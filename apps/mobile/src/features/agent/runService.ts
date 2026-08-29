import {
  isAvailable,
  startAutomationService,
  stopAutomationService,
} from '@mobile-automation/native-automation';

/**
 * The foreground service that keeps a run alive.
 *
 * Android suspends background work aggressively, and an agent run happens **by definition** while the
 * user is in another app. Without a foreground service the JS context is throttled and the loop
 * stalls — which is issue B1, the most serious defect the product had.
 *
 * The service keeps the process alive. It does not become the agent (ADR 0012): no reasoning moves
 * into Kotlin, because a second agent implementation could disagree with the tested one.
 *
 * The notification is not decoration. It is the user's guarantee that they know when their phone is
 * being driven, and Android requires it of a foreground service anyway.
 *
 * A thin wrapper over `native-automation` rather than a direct call, so the run controller can be
 * unit-tested by mocking one small module — and so the "failure is not fatal" rule below lives in one
 * place rather than at each call site.
 */

/**
 * Starts the service, or updates its notification if it is already running.
 *
 * Idempotent on purpose: `startForegroundService` with a new label updates the existing notification
 * rather than starting a second service, so the caller uses one function for "begin" and for "the
 * task changed" without tracking which it is.
 *
 * **Failure is reported, not thrown.** A run whose service could not start is worse off but not
 * broken — it still works while the app is foregrounded — and abandoning the run because a
 * notification failed would be the worse outcome.
 */
export const startRunService = async (statusLabel: string): Promise<boolean> => {
  if (!isAvailable()) return false;

  try {
    await startAutomationService(statusLabel);
    return true;
  } catch {
    return false;
  }
};

/**
 * Stops the service and removes the notification.
 *
 * Must be called on **every** exit from a run, including failure and abort. A notification that
 * outlives the work tells the user their phone is being driven when it is not, which is worse than no
 * notification at all.
 */
export const stopRunService = async (): Promise<void> => {
  if (!isAvailable()) return;

  try {
    await stopAutomationService();
  } catch {
    // Already stopped, or the context is gone. Either way there is nothing to recover.
  }
};

export const isRunServiceAvailable = (): boolean => isAvailable();
