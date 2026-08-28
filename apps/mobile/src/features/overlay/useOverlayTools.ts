import { invokeTool } from '@mobile-automation/native-automation';
import { type ToolName } from '@mobile-automation/tool-sdk';
import { useCallback } from 'react';

import { useCanvasStore } from '../canvas/canvasStore';
import { definitionFor } from '../canvas/registry';
import { inspectScreen } from '../inspector/inspectScreen';

import { useOverlayStore } from './overlayStore';

/**
 * The overlay's device tools.
 *
 * Every one of these goes through `invokeTool`, the same by-name dispatch the agent and the
 * workflow engine use. Nothing here reimplements a device capability - the overlay is a different
 * consumer of the one runtime (ADR 0008), and a second path would be a second thing that can
 * disagree about what a tap is.
 */

export type OverlayTools = {
  /** Reads the current screen into the store. */
  readScreen: () => Promise<void>;
  /** Captures a screenshot, keeping only its path. */
  capture: () => Promise<void>;
  /** Reports what is at a screen coordinate, for the coordinate inspector. */
  probe: (x: number, y: number) => Promise<void>;
  /**
   * Runs the node's own action live, so the user sees the result before committing.
   *
   * The point of Test Action: a selector that looks right in a form is not the same as one that
   * resolves on the screen in front of you.
   */
  testAction: () => Promise<void>;
};

export const useOverlayTools = (): OverlayTools => {
  const readScreen = useCallback(async () => {
    const overlay = useOverlayStore.getState();
    overlay.setBusy(true);

    try {
      const screen = await inspectScreen();

      overlay.setReading({
        packageName: screen.packageName,
        activityName: screen.activityName,
        elements: screen.elements,
        capturedAtEpochMs: screen.capturedAtEpochMs,
        schemaMismatch: screen.schemaMismatch,
      });
    } catch (error) {
      overlay.setReadingError(
        error instanceof Error ? error.message : 'The screen could not be read.',
      );
    }
  }, []);

  const capture = useCallback(async () => {
    const overlay = useOverlayStore.getState();

    try {
      const shot = (await invokeTool('takeScreenshot', {})) as { path?: string };

      // The path only. An image in JS state would cross the bridge as base64 and defeat the
      // whole by-reference design.
      overlay.setScreenshotPath(shot.path ?? null);
    } catch (error) {
      overlay.setReadingError(
        error instanceof Error ? error.message : 'The screen could not be captured.',
      );
    }
  }, []);

  const probe = useCallback(
    async (x: number, y: number) => {
      const overlay = useOverlayStore.getState();

      overlay.probePoint({ x: Math.round(x), y: Math.round(y) });

      // A coordinate on its own is the weakest possible selector, so the probe immediately looks
      // for a real element at that point - turning a tap into something durable if it can.
      if (overlay.reading === null) await readScreen();

      const reading = useOverlayStore.getState().reading;
      if (reading === null) return;

      const hit = reading.elements.find(
        (element) =>
          element.bounds !== null &&
          x >= element.bounds.left &&
          x <= element.bounds.right &&
          y >= element.bounds.top &&
          y <= element.bounds.bottom,
      );

      if (hit !== undefined) useOverlayStore.getState().selectElement(hit);
    },
    [readScreen],
  );

  const testAction = useCallback(async () => {
    const overlay = useOverlayStore.getState();
    const nodeId = overlay.nodeId;

    if (nodeId === null) return;

    const node = useCanvasStore.getState().nodes[nodeId];
    const definition = node === undefined ? undefined : definitionFor(node.type);

    if (node === undefined || definition === undefined) {
      overlay.setTestOutcome({
        tool: 'getCurrentScreen',
        succeeded: false,
        detail: 'That step no longer exists.',
        at: Date.now(),
      });
      return;
    }

    // The proposal is tested in preference to the saved config, because the whole point is
    // checking the AI's suggestion before accepting it.
    const config = (overlay.proposal?.config ?? node.config) as Record<string, unknown>;

    const tool = testToolFor(node.type);

    if (tool === null) {
      overlay.setTestOutcome({
        tool: 'getCurrentScreen',
        succeeded: false,
        detail: `A ${definition.display.label} step has nothing to test on its own.`,
        at: Date.now(),
      });
      return;
    }

    overlay.setBusy(true);

    try {
      const result = await invokeTool(tool, argumentsFor(tool, config));

      overlay.setTestOutcome({
        tool,
        succeeded: true,
        detail: describeResult(tool, result),
        at: Date.now(),
      });
    } catch (error) {
      overlay.setTestOutcome({
        tool,
        succeeded: false,
        detail: error instanceof Error ? error.message : 'The action failed.',
        at: Date.now(),
      });
    } finally {
      useOverlayStore.getState().setBusy(false);
    }
  }, []);

  return { readScreen, capture, probe, testAction };
};

/**
 * The tool a test should run for a node type.
 *
 * **A test never performs the destructive action.** Testing a `click` resolves the element rather
 * than tapping it; testing `typeText` checks the field is there rather than typing into it. A
 * "test" that sent a message would be indefensible - the user is checking a configuration, not
 * asking to act.
 */
const testToolFor = (nodeType: string): ToolName | null => {
  switch (nodeType) {
    case 'click':
    case 'longPress':
    case 'typeText':
    case 'waitForElement':
    case 'findElement':
      return 'findElement';

    case 'condition':
      // A condition is about whether an element is there, which findElement answers exactly.
      return 'findElement';

    case 'readScreen':
      return 'getUiTree';

    case 'currentScreen':
      return 'getCurrentScreen';

    case 'takeScreenshot':
      return 'takeScreenshot';

    default:
      // openApp, swipe, notification and friends either change state or need context the overlay
      // does not have. Saying so is better than running something surprising.
      return null;
  }
};

/**
 * Arguments for a test call, pulled out of the node's config.
 *
 * A condition node nests its selector, so both shapes are read - otherwise testing the very node
 * type the phase's definition of done names would silently find nothing.
 */
const argumentsFor = (tool: ToolName, config: Record<string, unknown>): Record<string, unknown> => {
  if (tool !== 'findElement') return {};

  const direct = config.selector;
  if (direct !== undefined) return { selector: direct };

  const condition = config.condition as Record<string, unknown> | undefined;
  if (condition?.selector !== undefined) return { selector: condition.selector };

  return {};
};

/** What the test found, in words the user can act on. */
const describeResult = (tool: ToolName, result: unknown): string => {
  if (tool === 'findElement') {
    if (result === null || typeof result !== 'object') return 'No element matched.';

    const element = result as Record<string, unknown>;

    const label =
      (typeof element.text === 'string' && element.text !== '' ? element.text : null) ??
      (typeof element.contentDescription === 'string' ? element.contentDescription : null) ??
      (typeof element.resourceId === 'string' ? element.resourceId : null);

    const strategy = typeof element.strategy === 'string' ? element.strategy : 'unknown';

    return label === null
      ? `Matched an element by ${strategy}.`
      : `Matched “${label}” by ${strategy}.`;
  }

  if (tool === 'getCurrentScreen') {
    const screen = result as { packageName?: string | null; activityName?: string | null };
    return `${screen.packageName ?? 'unknown app'} / ${screen.activityName ?? 'unknown screen'}`;
  }

  if (tool === 'getUiTree') {
    const tree = result as { nodeCount?: number };
    return `Read ${tree.nodeCount ?? 0} elements.`;
  }

  if (tool === 'takeScreenshot') {
    const shot = result as { path?: string };
    return shot.path === undefined ? 'Captured.' : `Captured to ${shot.path}.`;
  }

  return 'Done.';
};
