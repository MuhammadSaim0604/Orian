import { LayoutAnimation, Platform, UIManager } from 'react-native';

/**
 * Smooth expand and collapse, animated by the platform.
 *
 * This exists because of a specific reported bug: expanding the reasoning strip made the whole conversation jitter
 * for a fraction of a second before settling.
 *
 * The cause was animating `maxHeight` from zero. The content is laid out at its full height immediately while the
 * clamp grows, so the scroll view's content size changes in one frame and every message shifts, then corrects.
 * `maxHeight` also cannot be driven natively, so each frame was a JS-thread layout pass — and during an agent run
 * that thread is the one driving the phone.
 *
 * `LayoutAnimation` is the right tool: the content mounts or unmounts, and the platform interpolates the
 * surrounding layout on the UI thread. One call, no per-frame JavaScript.
 *
 * Shared rather than repeated, because the Android opt-in below must happen once wherever an expanding component
 * is used, and a component that forgot it would simply snap open — a silent difference, not an error.
 */

// Android needs this before `LayoutAnimation` does anything. Idempotent, and optional-chained because the method
// is absent under Jest's react-native mock.
if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

/**
 * Configures the next layout pass to animate.
 *
 * Must be called immediately before the state change that alters the tree — `LayoutAnimation` applies to the *next*
 * commit, so calling it any earlier animates the wrong pass.
 *
 * Opacity on create and delete rather than scale: a scaling block of text pulls the eye away from the conversation,
 * and the point of the fix is that the surrounding messages stay calm.
 */
export const animateNextLayout = (durationMs = DEFAULT_DURATION_MS): void => {
  LayoutAnimation.configureNext({
    duration: durationMs,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
};

/** Long enough to read as a movement, short enough not to delay a deliberate tap. */
const DEFAULT_DURATION_MS = 200;
