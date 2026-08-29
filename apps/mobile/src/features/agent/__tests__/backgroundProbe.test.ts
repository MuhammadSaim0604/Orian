import {
  SUSPICIOUS_GAP_MS,
  describeProbe,
  isProbeRunning,
  readProbe,
  resetProbe,
  startProbe,
  stopProbe,
} from '../backgroundProbe';

/**
 * The background-execution probe.
 *
 * The probe answers the one question Step 3 rests on: **did backgrounding stop the agent?** These tests
 * check its arithmetic and its wording, because the number it reports is going to be read on a device
 * and believed.
 *
 * Fake timers throughout — a real one-second interval would make the suite slow for no benefit, and the
 * quantity under test is the gap it computes, not whether `setInterval` works.
 */

beforeEach(() => {
  jest.useFakeTimers();
  resetProbe();
});

afterEach(() => {
  resetProbe();
  jest.useRealTimers();
});

describe('measuring', () => {
  it('reports nothing before a run', () => {
    expect(readProbe()).toBeNull();
  });

  it('is running once started', () => {
    startProbe();

    expect(isProbeRunning()).toBe(true);
  });

  it('is not running once stopped', () => {
    startProbe();
    stopProbe();

    expect(isProbeRunning()).toBe(false);
  });

  it('counts ticks over an uninterrupted run', () => {
    startProbe();
    jest.advanceTimersByTime(5_000);

    expect(stopProbe()?.actualTicks).toBe(5);
  });

  it('records a small worst gap when nothing is suspended', () => {
    startProbe();
    jest.advanceTimersByTime(5_000);

    const reading = stopProbe();

    // Each tick arrives on time, so the gap is the interval itself.
    expect(reading?.worstGapMs).toBeLessThanOrEqual(1_100);
  });

  it('records elapsed wall-clock time', () => {
    startProbe();
    jest.advanceTimersByTime(7_000);

    expect(stopProbe()?.elapsedMs).toBeGreaterThanOrEqual(7_000);
  });

  it('keeps the reading after stopping', () => {
    startProbe();
    jest.advanceTimersByTime(2_000);
    stopProbe();

    expect(readProbe()).not.toBeNull();
  });

  it('discards the previous reading on restart', () => {
    startProbe();
    jest.advanceTimersByTime(5_000);
    stopProbe();

    startProbe();
    jest.advanceTimersByTime(1_000);

    expect(stopProbe()?.actualTicks).toBe(1);
  });
});

describe('the final gap', () => {
  it('is measured at stop, not only per tick', () => {
    // The case that would otherwise be missed entirely: if the process was frozen when the run ended, no
    // tick ever arrived to record that gap — so stopping has to measure it.
    startProbe();
    jest.advanceTimersByTime(1_000);

    // Timers do not fire, but wall clock moves: exactly what a suspended process looks like.
    jest.setSystemTime(Date.now() + 30_000);

    const reading = stopProbe();

    expect(reading?.worstGapMs).toBeGreaterThan(SUSPICIOUS_GAP_MS);
  });
});

describe('describing a reading', () => {
  it('says nothing has been measured yet', () => {
    expect(describeProbe(null)).toMatch(/no run/i);
  });

  it('says JavaScript kept running when gaps were small', () => {
    const description = describeProbe({
      expectedTicks: 10,
      actualTicks: 10,
      worstGapMs: 1_050,
      elapsedMs: 10_000,
      startedAtEpochMs: 0,
    });

    expect(description).toMatch(/kept running/i);
  });

  it('says the process was suspended when a gap was long', () => {
    // The wording matters: this is the sentence that would tell us ADR 0012 needs revisiting.
    const description = describeProbe({
      expectedTicks: 60,
      actualTicks: 4,
      worstGapMs: 45_000,
      elapsedMs: 60_000,
      startedAtEpochMs: 0,
    });

    expect(description).toMatch(/suspended/i);
    expect(description).toMatch(/stall/i);
  });

  it('reports the worst gap in seconds', () => {
    const description = describeProbe({
      expectedTicks: 60,
      actualTicks: 4,
      worstGapMs: 45_000,
      elapsedMs: 60_000,
      startedAtEpochMs: 0,
    });

    expect(description).toContain('45.0');
  });

  it('treats three intervals as the threshold', () => {
    // A loaded device can miss a tick and be late on the next; three seconds of silence for a
    // one-second timer is not scheduling noise.
    expect(SUSPICIOUS_GAP_MS).toBe(3_000);
  });
});
