import { useCallback, useMemo } from 'react';
import { Gesture, type GestureType, type SimultaneousGesture } from 'react-native-gesture-handler';
import {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { type Camera, MAX_SCALE, MIN_SCALE, cameraToFit } from './geometry';

/**
 * The camera, as Reanimated shared values.
 *
 * The whole reason the canvas can be smooth: pan and pinch write to shared values that live
 * on the **UI thread**, so a drag never waits for a JavaScript render. Writing the camera to
 * Zustand on every frame would put a store update, a React reconcile, and a bridge hop
 * between the finger and the pixels, and the canvas would visibly lag behind the touch.
 *
 * The store is updated only when a gesture ends (ADR 0003), which is when anything else
 * actually needs to know where the camera is.
 */

export type CameraController = {
  readonly translateX: SharedValue<number>;
  readonly translateY: SharedValue<number>;
  readonly scale: SharedValue<number>;
  /** Pan and pinch, composed so a two-finger gesture is not fought over. */
  readonly gesture: SimultaneousGesture;
  /** Transform for the Skia group, so the canvas follows the camera. */
  readonly animatedStyle: ReturnType<typeof useAnimatedStyle>;
  fitTo: (
    nodes: Parameters<typeof cameraToFit>[0],
    viewportWidth: number,
    viewportHeight: number,
  ) => void;
  reset: () => void;
  read: () => Camera;
};

export type UseCameraOptions = {
  readonly initial?: Camera;
  /** Called when a gesture settles, to commit the camera to the store. */
  readonly onSettle?: (camera: Camera) => void;
  /** Tapping empty canvas clears the selection. */
  readonly onTapEmpty?: (worldX: number, worldY: number) => void;
};

export const useCamera = (options: UseCameraOptions = {}): CameraController => {
  const initial = options.initial;

  const translateX = useSharedValue(initial?.translateX ?? 0);
  const translateY = useSharedValue(initial?.translateY ?? 0);
  const scale = useSharedValue(initial?.scale ?? 1);

  // Gesture start values, so a pan is relative to where it began rather than accumulating
  // drift from frame to frame.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  const onSettle = options.onSettle;

  const settle = useCallback(
    (camera: Camera) => {
      onSettle?.(camera);
    },
    [onSettle],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      // Two fingers are a pinch, not a pan. Without this the two gestures interleave and
      // a pinch drifts across the screen as it zooms.
      .maxPointers(1)
      .onStart(() => {
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((event) => {
        // Divided by scale so a drag moves the content under the finger by the same screen
        // distance at every zoom level - without it, panning while zoomed out feels
        // sluggish and while zoomed in feels violent.
        translateX.value = startX.value + event.translationX / scale.value;
        translateY.value = startY.value + event.translationY / scale.value;
      })
      .onEnd(() => {
        runOnJS(settle)({
          translateX: translateX.value,
          translateY: translateY.value,
          scale: scale.value,
        });
      });

    const pinch = Gesture.Pinch()
      .onStart(() => {
        startScale.value = scale.value;
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((event) => {
        const next = Math.min(Math.max(startScale.value * event.scale, MIN_SCALE), MAX_SCALE);

        // Zoom about the pinch centre rather than the origin. Scaling about (0,0) makes the
        // content shoot away from the fingers, which feels like the canvas is fighting back.
        const focusWorldX = event.focalX / startScale.value - startX.value;
        const focusWorldY = event.focalY / startScale.value - startY.value;

        translateX.value = event.focalX / next - focusWorldX;
        translateY.value = event.focalY / next - focusWorldY;
        scale.value = next;
      })
      .onEnd(() => {
        runOnJS(settle)({
          translateX: translateX.value,
          translateY: translateY.value,
          scale: scale.value,
        });
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [scale, settle, startScale, startX, startY, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const fitTo = useCallback(
    (nodes: Parameters<typeof cameraToFit>[0], viewportWidth: number, viewportHeight: number) => {
      const target = cameraToFit(nodes, viewportWidth, viewportHeight);

      // Animated rather than snapped: a jump-cut to a new camera position loses the user's
      // sense of where they were on the graph.
      translateX.value = withTiming(target.translateX, { duration: 220 });
      translateY.value = withTiming(target.translateY, { duration: 220 });
      scale.value = withTiming(target.scale, { duration: 220 });

      settle(target);
    },
    [scale, settle, translateX, translateY],
  );

  const reset = useCallback(() => {
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    scale.value = withTiming(1);
    settle({ translateX: 0, translateY: 0, scale: 1 });
  }, [scale, settle, translateX, translateY]);

  const read = useCallback(
    (): Camera => ({
      translateX: translateX.value,
      translateY: translateY.value,
      scale: scale.value,
    }),
    [scale, translateX, translateY],
  );

  return { translateX, translateY, scale, gesture, animatedStyle, fitTo, reset, read };
};

/** A tap gesture that reports the world point touched. */
export const useCanvasTap = (
  camera: CameraController,
  onTap: (worldX: number, worldY: number) => void,
): GestureType =>
  useMemo(
    () =>
      Gesture.Tap().onEnd((event) => {
        // Converted on the UI thread before crossing to JS, so the JS side never has to know
        // about the camera at all.
        const worldX = event.x / camera.scale.value - camera.translateX.value;
        const worldY = event.y / camera.scale.value - camera.translateY.value;

        runOnJS(onTap)(worldX, worldY);
      }),
    [camera.scale, camera.translateX, camera.translateY, onTap],
  );
