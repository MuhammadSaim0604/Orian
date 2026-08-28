import { describe, expect, it } from 'vitest';

import {
  TOOL_ARGUMENT_SCHEMAS,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  allToolDefinitions,
  isRetryableTool,
  readOnlyTools,
  toolDefinition,
} from './index';

describe('definition coverage', () => {
  it('defines every tool in the vocabulary', () => {
    // A missing definition would let the agent name a tool it has no schema for.
    for (const name of TOOL_NAMES) {
      expect(TOOL_DEFINITIONS[name]).toBeDefined();
      expect(TOOL_DEFINITIONS[name].name).toBe(name);
    }
  });

  it('defines no tool that is not in the vocabulary', () => {
    expect(Object.keys(TOOL_DEFINITIONS).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('gives every tool an argument schema', () => {
    for (const name of TOOL_NAMES) {
      expect(TOOL_ARGUMENT_SCHEMAS[name]).toBeDefined();
      expect(TOOL_DEFINITIONS[name].argumentSchema).toBe(TOOL_ARGUMENT_SCHEMAS[name]);
    }
  });

  it('describes what every tool does and returns', () => {
    // The description is the only thing the model has to decide *when* to use a
    // tool, so an empty one is a real defect.
    for (const definition of allToolDefinitions()) {
      expect(definition.description.length).toBeGreaterThan(20);
      expect(definition.returns.length).toBeGreaterThan(0);
    }
  });

  it('resolves a definition by name', () => {
    expect(toolDefinition('click').name).toBe('click');
  });

  it('lists definitions in vocabulary order', () => {
    expect(allToolDefinitions().map((definition) => definition.name)).toEqual([...TOOL_NAMES]);
  });
});

describe('impact and retry classification', () => {
  it('treats reads as safe to repeat', () => {
    expect(isRetryableTool('getUiTree')).toBe(true);
    expect(isRetryableTool('findElement')).toBe(true);
    expect(isRetryableTool('getCurrentScreen')).toBe(true);
  });

  it('does not treat a tap as safe to repeat', () => {
    // A repeated tap might submit a form twice.
    expect(isRetryableTool('click')).toBe(false);
    expect(isRetryableTool('typeText')).toBe(false);
  });

  it('does not treat sending a notification as safe to repeat', () => {
    expect(isRetryableTool('sendNotification')).toBe(false);
  });

  it('classifies every read-only tool as impact read', () => {
    for (const name of readOnlyTools()) {
      expect(TOOL_DEFINITIONS[name].impact).toBe('read');
    }
  });

  it('reports the read-only subset', () => {
    const readOnly = readOnlyTools();

    expect(readOnly).toContain('getUiTree');
    expect(readOnly).toContain('takeScreenshot');
    expect(readOnly).not.toContain('click');
  });

  it('marks every read-only tool retryable', () => {
    // Reading the screen twice can never be harmful, so this should hold by
    // construction.
    for (const name of readOnlyTools()) {
      expect(isRetryableTool(name)).toBe(true);
    }
  });

  it('classifies launchIntent as a system-level tool', () => {
    // It can start anything on the device, so it deserves stronger gating than an
    // ordinary tap.
    expect(TOOL_DEFINITIONS.launchIntent.impact).toBe('system');
  });
});

describe('argument schemas', () => {
  it('accepts a valid click', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.click.safeParse({ selector: { text: 'Send' } }).success).toBe(
      true,
    );
  });

  it('rejects a selector with nothing to locate by', () => {
    // A model will happily emit this, and the resulting "element not found" would
    // send the agent replanning against a phantom problem.
    const result = TOOL_ARGUMENT_SCHEMAS.click.safeParse({
      selector: { className: 'android.widget.Button' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invented extra field', () => {
    // Silently dropping it would hide that the model misunderstood the tool.
    const result = TOOL_ARGUMENT_SCHEMAS.click.safeParse({
      selector: { text: 'Send' },
      force: true,
    });

    expect(result.success).toBe(false);
  });

  it('accepts a swipe with only a direction', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.swipe.safeParse({ direction: 'down' }).success).toBe(true);
  });

  it('rejects an unknown swipe direction', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.swipe.safeParse({ direction: 'sideways' }).success).toBe(false);
  });

  it('rejects a swipe distance beyond the screen', () => {
    expect(
      TOOL_ARGUMENT_SCHEMAS.swipe.safeParse({ direction: 'up', distanceFraction: 3 }).success,
    ).toBe(false);
  });

  it('accepts an empty object for a no-argument tool', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.pressBack.safeParse({}).success).toBe(true);
  });

  it('rejects arguments to a no-argument tool', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.pressBack.safeParse({ twice: true }).success).toBe(false);
  });

  it('requires a package name to open an app', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.openApp.safeParse({ packageName: 'com.whatsapp' }).success).toBe(
      true,
    );
    expect(TOOL_ARGUMENT_SCHEMAS.openApp.safeParse({}).success).toBe(false);
  });

  it('validates an alarm time', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.createAlarm.safeParse({ hour: 7, minute: 30 }).success).toBe(true);
    expect(TOOL_ARGUMENT_SCHEMAS.createAlarm.safeParse({ hour: 25, minute: 0 }).success).toBe(
      false,
    );
  });

  it('validates an ISO weekday', () => {
    expect(
      TOOL_ARGUMENT_SCHEMAS.createAlarm.safeParse({ hour: 7, minute: 0, repeatDays: [1, 7] })
        .success,
    ).toBe(true);
    expect(
      TOOL_ARGUMENT_SCHEMAS.createAlarm.safeParse({ hour: 7, minute: 0, repeatDays: [0] }).success,
    ).toBe(false);
  });

  it('caps a wait so the agent cannot stall indefinitely', () => {
    expect(
      TOOL_ARGUMENT_SCHEMAS.waitForElement.safeParse({
        selector: { text: 'Send' },
        timeoutMs: 600_000,
      }).success,
    ).toBe(false);
  });

  it('accepts a media command from the vocabulary', () => {
    expect(TOOL_ARGUMENT_SCHEMAS.controlMedia.safeParse({ command: 'play_pause' }).success).toBe(
      true,
    );
    expect(TOOL_ARGUMENT_SCHEMAS.controlMedia.safeParse({ command: 'moonwalk' }).success).toBe(
      false,
    );
  });
});
