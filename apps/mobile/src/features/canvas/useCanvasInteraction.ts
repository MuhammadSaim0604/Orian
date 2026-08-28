import { useCallback, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { type PortsByType } from './CanvasScene';
import { useCanvasStore } from './canvasStore';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  PORT_TOUCH_RADIUS,
  type Point,
  containsPoint,
  inputPortPosition,
  nodeRect,
  outputPortPosition,
} from './geometry';
import { type CameraController } from './useCamera';

/**
 * Hit testing and node/edge gestures.
 *
 * The interaction rules here decide whether the canvas feels deliberate or fidgety, and two
 * of them matter more than the rest:
 *
 * - **Ports are tested before node bodies.** A port sits on the node's edge, so a touch near
 *   it is inside both. Testing the body first would make drawing an edge nearly impossible,
 *   because every attempt would drag the node instead.
 * - **Ports have a much larger touch radius than their drawn dot.** A 7px circle is a
 *   reasonable thing to look at and an unreasonable thing to hit with a fingertip.
 */

export type HitTarget =
  | { readonly kind: 'node'; readonly nodeId: string }
  | { readonly kind: 'outputPort'; readonly nodeId: string; readonly handle: string }
  | { readonly kind: 'inputPort'; readonly nodeId: string; readonly handle: string }
  | { readonly kind: 'empty' };

/** What is at a world point. */
export const hitTest = (
  world: Point,
  nodes: readonly { id: string; type: string; metadata: { position: Point } }[],
  portsByType: PortsByType,
): HitTarget => {
  // Reversed, so the most recently added node - which draws on top - is hit first.
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]!;
    const ports = portsByType.get(node.type);

    if (ports !== undefined) {
      for (const [portIndex, handle] of ports.outputs.entries()) {
        const position = outputPortPosition(node as never, portIndex, ports.outputs.length);

        if (withinRadius(world, position, PORT_TOUCH_RADIUS)) {
          return { kind: 'outputPort', nodeId: node.id, handle };
        }
      }

      for (const [portIndex, handle] of ports.inputs.entries()) {
        const position = inputPortPosition(node as never, portIndex, ports.inputs.length);

        if (withinRadius(world, position, PORT_TOUCH_RADIUS)) {
          return { kind: 'inputPort', nodeId: node.id, handle };
        }
      }
    }

    if (containsPoint(nodeRect(node as never), world)) {
      return { kind: 'node', nodeId: node.id };
    }
  }

  return { kind: 'empty' };
};

const withinRadius = (a: Point, b: Point, radius: number): boolean =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= radius ** 2;

export type PendingEdge = {
  readonly from: Point;
  readonly to: Point;
  readonly sourceNodeId: string;
  readonly sourceHandle: string;
};

export type CanvasInteraction = {
  /** Composed gesture for dragging nodes and drawing edges. */
  readonly gesture: ReturnType<typeof Gesture.Pan>;
  readonly pendingEdge: PendingEdge | null;
  /** Node being dragged, so the scene can draw it at the live position. */
  readonly draggingNodeId: string | null;
  readonly dragPosition: Point | null;
};

export type UseCanvasInteractionOptions = {
  readonly camera: CameraController;
  readonly portsByType: PortsByType;
  readonly onSelectNode: (nodeId: string) => void;
};

export const useCanvasInteraction = ({
  camera,
  portsByType,
  onSelectNode,
}: UseCanvasInteractionOptions): CanvasInteraction => {
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<Point | null>(null);

  // Held on the UI thread so the drag itself never waits for React.
  const active = useSharedValue<'none' | 'node' | 'edge'>('none');

  const begin = useCallback(
    (worldX: number, worldY: number) => {
      const state = useCanvasStore.getState();
      const nodes = Object.values(state.nodes);

      const target = hitTest({ x: worldX, y: worldY }, nodes, portsByType);

      if (target.kind === 'outputPort') {
        const node = state.nodes[target.nodeId]!;
        const ports = portsByType.get(node.type)!;
        const index = ports.outputs.indexOf(target.handle);

        setPendingEdge({
          from: outputPortPosition(node, index, ports.outputs.length),
          to: { x: worldX, y: worldY },
          sourceNodeId: target.nodeId,
          sourceHandle: target.handle,
        });

        return 'edge' as const;
      }

      if (target.kind === 'node') {
        const node = state.nodes[target.nodeId]!;

        setDraggingNodeId(target.nodeId);
        setDragPosition(node.metadata.position);
        onSelectNode(target.nodeId);

        return 'node' as const;
      }

      return 'none' as const;
    },
    [onSelectNode, portsByType],
  );

  const move = useCallback((worldX: number, worldY: number) => {
    setPendingEdge((current) =>
      current === null ? null : { ...current, to: { x: worldX, y: worldY } },
    );

    setDragPosition((current) =>
      current === null
        ? null
        : // Centred on the finger, so the node does not jump to have its corner under the
          // touch point when the drag starts.
          { x: worldX - NODE_WIDTH / 2, y: worldY - NODE_HEIGHT / 2 },
    );
  }, []);

  const finish = useCallback(
    (worldX: number, worldY: number) => {
      const state = useCanvasStore.getState();

      setPendingEdge((current) => {
        if (current !== null) {
          const nodes = Object.values(state.nodes);
          const target = hitTest({ x: worldX, y: worldY }, nodes, portsByType);

          // Only an input port completes an edge. Dropping on a node body is ambiguous when
          // it has several inputs, and guessing would silently wire the wrong handle.
          if (target.kind === 'inputPort' && target.nodeId !== current.sourceNodeId) {
            state.connect({
              source: current.sourceNodeId,
              sourceHandle: current.sourceHandle,
              target: target.nodeId,
              targetHandle: target.handle,
            });
          }
        }

        return null;
      });

      setDraggingNodeId((nodeId) => {
        if (nodeId !== null) {
          // Committed once, at the end. Writing every frame would defeat the shared-value
          // design entirely (ADR 0003).
          state.moveNode(nodeId, worldX - NODE_WIDTH / 2, worldY - NODE_HEIGHT / 2);
        }

        return null;
      });

      setDragPosition(null);
    },
    [portsByType],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        // Given priority over the camera pan, so a drag that starts on a node moves the node
        // and one that starts on empty canvas moves the view.
        .onBegin((event) => {
          const worldX = event.x / camera.scale.value - camera.translateX.value;
          const worldY = event.y / camera.scale.value - camera.translateY.value;

          const kind = runOnJS(begin)(worldX, worldY);
          active.value = kind as unknown as 'none' | 'node' | 'edge';
        })
        .onUpdate((event) => {
          const worldX = event.x / camera.scale.value - camera.translateX.value;
          const worldY = event.y / camera.scale.value - camera.translateY.value;

          runOnJS(move)(worldX, worldY);
        })
        .onEnd((event) => {
          const worldX = event.x / camera.scale.value - camera.translateX.value;
          const worldY = event.y / camera.scale.value - camera.translateY.value;

          runOnJS(finish)(worldX, worldY);
          active.value = 'none';
        }),
    [active, begin, camera.scale, camera.translateX, camera.translateY, finish, move],
  );

  return { gesture, pendingEdge, draggingNodeId, dragPosition };
};

/** A tap gesture that selects or clears, converting to world space on the UI thread. */
export const useTapToSelect = (
  camera: CameraController,
  portsByType: PortsByType,
  onSelectNode: (nodeId: string) => void,
  onTapEmpty: () => void,
) => {
  const handle = useCallback(
    (worldX: number, worldY: number) => {
      const nodes = Object.values(useCanvasStore.getState().nodes);
      const target = hitTest({ x: worldX, y: worldY }, nodes, portsByType);

      if (target.kind === 'node') onSelectNode(target.nodeId);
      else if (target.kind === 'empty') onTapEmpty();
    },
    [onSelectNode, onTapEmpty, portsByType],
  );

  return useMemo(
    () =>
      Gesture.Tap().onEnd((event) => {
        const worldX = event.x / camera.scale.value - camera.translateX.value;
        const worldY = event.y / camera.scale.value - camera.translateY.value;

        runOnJS(handle)(worldX, worldY);
      }),
    [camera.scale, camera.translateX, camera.translateY, handle],
  );
};
