/**
 * Records whether JavaScript kept running while the app was in the background.
 *
 * This exists because **the entire step rests on an assumption** (ADR 0012, ADR 0016): that JS
 * continues to execute under a foreground service when the app is not in front. React Native runs JS
 * on its own thread rather than a WebView timer, and a foreground service keeps the process out of the
 * cached states where Doze and App Standby apply — so it should hold. But should is not does, and if
 * timers throttle hard enough to stall the loop then keeping the loop in JS is not viable.
 *
 * The probe is deliberately crude: a timer at a known interval, measuring how late each tick actually
 * was. A tick that should arrive after 1s and arrives after 40s says the process was frozen, and says
 * it in a way no amount of reasoning about Doze can argue with.
 *
 * It measures **wall clock**, not timer callbacks, because a throttled timer that fires late still
 * fires — the question is how much time passed, not how many ticks were delivered.
 */

export type ProbeReading = {
  /** How many ticks were expected in the elapsed time. */
  readonly expectedTicks: number;
  readonly actualTicks: number;
  /** The worst gap between consecutive ticks, in ms. The number that matters. */
  readonly worstGapMs: number;
  /** Total wall-clock time the probe was running. */
  readonly elapsedMs: number;
  readonly startedAtEpochMs: number;
};

const TICK_INTERVAL_MS = 1_000;

/**
 * A gap beyond this means the process was suspended rather than merely busy.
 *
 * Three intervals: a loaded device can easily miss one tick and be a little late on the next, but
 * three seconds of silence for a one-second timer is not scheduling noise.
 */
export const SUSPICIOUS_GAP_MS = 3 * TICK_INTERVAL_MS;

let timer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let lastTickAt = 0;
let ticks = 0;
let worstGap = 0;
let lastReading: ProbeReading | null = null;

/** Starts measuring. Restarting discards the previous run's figures. */
export const startProbe = (): void => {
  stopProbe();

  startedAt = Date.now();
  lastTickAt = startedAt;
  ticks = 0;
  worstGap = 0;

  timer = setInterval(() => {
    const now = Date.now();
    const gap = now - lastTickAt;

    if (gap > worstGap) worstGap = gap;

    lastTickAt = now;
    ticks += 1;
  }, TICK_INTERVAL_MS);
};

/**
 * Stops measuring and keeps the reading.
 *
 * The final gap is measured here as well as on each tick: if the process was frozen when the run
 * ended, the last tick is old and that gap is exactly the interesting one — it would otherwise be
 * missed, since no tick ever arrived to record it.
 */
export const stopProbe = (): ProbeReading | null => {
  if (timer === null) return lastReading;

  clearInterval(timer);
  timer = null;

  const now = Date.now();
  const finalGap = now - lastTickAt;
  if (finalGap > worstGap) worstGap = finalGap;

  const elapsedMs = now - startedAt;

  lastReading = {
    expectedTicks: Math.floor(elapsedMs / TICK_INTERVAL_MS),
    actualTicks: ticks,
    worstGapMs: worstGap,
    elapsedMs,
    startedAtEpochMs: startedAt,
  };

  return lastReading;
};

/** The most recent reading, for a settings screen to display. */
export const readProbe = (): ProbeReading | null => lastReading;

export const isProbeRunning = (): boolean => timer !== null;

/**
 * A sentence a human can act on.
 *
 * Phrased around what it means rather than the raw numbers, because the reason to show this at all is
 * to answer one question: did backgrounding stop the agent?
 */
export const describeProbe = (reading: ProbeReading | null): string => {
  if (reading === null) return 'No run has been measured yet.';

  const seconds = Math.round(reading.elapsedMs / 1_000);
  const worstSeconds = (reading.worstGapMs / 1_000).toFixed(1);

  if (reading.worstGapMs <= SUSPICIOUS_GAP_MS) {
    return `Ran for ${seconds}s with no pause longer than ${worstSeconds}s — JavaScript kept running throughout.`;
  }

  return `Ran for ${seconds}s but paused for up to ${worstSeconds}s. The process was suspended, which would stall a run.`;
};

/** Test-only. Module state persists between tests, so it has to be cleared explicitly. */
export const resetProbe = (): void => {
  if (timer !== null) clearInterval(timer);
  timer = null;
  startedAt = 0;
  lastTickAt = 0;
  ticks = 0;
  worstGap = 0;
  lastReading = null;
};
