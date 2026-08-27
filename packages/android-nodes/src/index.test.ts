import {
  createRecordingToolInvoker,
  createTestContext,
  createVariableStore,
  executeNode,
} from '@mobile-automation/node-sdk';
import { TOOL_NAMES, isToolName } from '@mobile-automation/tool-sdk';
import { describe, expect, it } from 'vitest';

import {
  NODE_TO_TOOL,
  PACKAGE_NAME,
  androidNodes,
  clickNode,
  everyNodeMapsToAKnownTool,
  toolForNode,
} from './index';

const sendSelector = { resourceId: 'com.whatsapp:id/send' };

describe('android-nodes', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/android-nodes');
  });

  it('maps every node to a tool the runtime actually exposes', () => {
    // A node wired to a nonexistent tool would otherwise fail only when someone ran
    // that step on a real phone.
    expect(everyNodeMapsToAKnownTool()).toBe(true);
  });

  it('resolves the tool for a node', () => {
    expect(toolForNode('readScreen')).toBe('getUiTree');
    expect(toolForNode('click')).toBe('click');
  });

  it('exports one definition per mapped node type', () => {
    const exported = androidNodes.map((node) => node.type).sort();
    const mapped = Object.keys(NODE_TO_TOOL).sort();

    expect(exported).toEqual(mapped);
  });

  it('gives every node a unique type', () => {
    const types = androidNodes.map((node) => node.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('marks every device node as requiring a device', () => {
    // Lets a workflow be checked for device requirements before it starts.
    for (const node of androidNodes) {
      expect(node.requiresDevice).toBe(true);
    }
  });

  it('gives every node palette metadata', () => {
    for (const node of androidNodes) {
      expect(node.display.label.length).toBeGreaterThan(0);
      expect(node.display.icon.length).toBeGreaterThan(0);
      expect(node.display.category.length).toBeGreaterThan(0);
    }
  });

  it('every tool a node references is in the shared vocabulary', () => {
    for (const tool of Object.values(NODE_TO_TOOL)) {
      expect(isToolName(tool)).toBe(true);
      expect(TOOL_NAMES).toContain(tool);
    }
  });
});

describe('device guard', () => {
  it('refuses to run with no device attached', async () => {
    // A clearer failure than whatever the bridge would say, and it names the tool.
    await expect(
      executeNode(clickNode, {
        ...createTestContext({ config: {} }),
        config: { selector: sendSelector },
      }),
    ).rejects.toThrow(/no device is attached/);
  });

  it('marks a missing device as needing user action rather than a retry', async () => {
    try {
      await executeNode(clickNode, {
        ...createTestContext({ config: {} }),
        config: { selector: sendSelector },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as { retryable: boolean; needsUserAction: boolean };
      expect(failure.retryable).toBe(false);
      expect(failure.needsUserAction).toBe(true);
    }
  });
});

describe('result handling', () => {
  it('stores the tool result when the workflow asks', async () => {
    const tools = createRecordingToolInvoker({
      findElement: () => ({ text: 'Send', strategy: 'resourceId' }),
    });
    const store = createVariableStore();

    const { findElementNode } = await import('./index');

    await executeNode(findElementNode, {
      ...createTestContext({ config: {}, tools, variables: store }),
      config: { selector: sendSelector, assignTo: 'element' },
    });

    expect(store.get('element')).toEqual({ text: 'Send', strategy: 'resourceId' });
  });

  it('publishes the result on its output regardless', async () => {
    const tools = createRecordingToolInvoker({ findElement: () => ({ text: 'Send' }) });
    const { findElementNode } = await import('./index');

    const result = await executeNode(findElementNode, {
      ...createTestContext({ config: {}, tools }),
      config: { selector: sendSelector },
    });

    expect(result.outputs?.result).toEqual({ text: 'Send' });
  });

  it('turns an undefined tool result into null so it can be stored', async () => {
    const tools = createRecordingToolInvoker({ click: () => undefined });
    const store = createVariableStore();

    await executeNode(clickNode, {
      ...createTestContext({ config: {}, tools, variables: store }),
      config: { selector: sendSelector, assignTo: 'tapped' },
    });

    expect(store.get('tapped')).toBeNull();
  });
});

describe('bridge error translation', () => {
  it('keeps the bridge’s own retry classification', async () => {
    // The bridge already knows element_not_found is usually a loading screen;
    // re-deriving that from the message here would be guesswork.
    const tools = createRecordingToolInvoker({
      click: () => {
        throw Object.assign(new Error('Element not found: Send'), {
          code: 'element_not_found',
          isRetryable: true,
          needsUserAction: false,
        });
      },
    });

    try {
      await executeNode(clickNode, {
        ...createTestContext({ config: {}, tools }),
        config: { selector: sendSelector },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as { retryable: boolean; detail: Record<string, unknown> };
      expect(failure.retryable).toBe(true);
      expect(failure.detail.code).toBe('element_not_found');
    }
  });

  it('carries a permission failure through as needing user action', async () => {
    const tools = createRecordingToolInvoker({
      click: () => {
        throw Object.assign(new Error('permission denied'), {
          code: 'permission_denied',
          isRetryable: false,
          needsUserAction: true,
        });
      },
    });

    try {
      await executeNode(clickNode, {
        ...createTestContext({ config: {}, tools }),
        config: { selector: sendSelector },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as { needsUserAction: boolean };
      expect(failure.needsUserAction).toBe(true);
    }
  });

  it('defaults to retryable for an unclassified failure', async () => {
    const tools = createRecordingToolInvoker({
      click: () => {
        throw new Error('something odd');
      },
    });

    try {
      await executeNode(clickNode, {
        ...createTestContext({ config: {}, tools }),
        config: { selector: sendSelector },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { retryable: boolean }).retryable).toBe(true);
    }
  });

  it('records the tool and arguments for the log', async () => {
    const tools = createRecordingToolInvoker({
      click: () => {
        throw new Error('nope');
      },
    });

    try {
      await executeNode(clickNode, {
        ...createTestContext({ config: {}, tools }),
        config: { selector: sendSelector },
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as { detail: Record<string, unknown> };
      expect(failure.detail.tool).toBe('click');
      expect(failure.detail.args).toEqual({ selector: sendSelector });
    }
  });
});
