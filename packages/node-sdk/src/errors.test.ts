import { describe, expect, it } from 'vitest';

import {
  ExecutionCancelledError,
  NodeExecutionError,
  isExecutionCancelledError,
  isNodeExecutionError,
  throwIfCancelled,
} from './errors';

describe('NodeExecutionError', () => {
  it('leads with the node id and type', () => {
    // The first thing someone debugging a twenty-node workflow needs to know.
    const error = new NodeExecutionError('click_3', 'click', 'element not found');

    expect(error.message).toContain('click_3');
    expect(error.message).toContain('click');
    expect(error.message).toContain('element not found');
  });

  it('defaults to retryable, matching the common case', () => {
    // Most node failures are transient device conditions: a loading screen, a
    // gesture arriving mid-animation.
    expect(new NodeExecutionError('n', 't', 'm').retryable).toBe(true);
  });

  it('can be marked not retryable', () => {
    expect(new NodeExecutionError('n', 't', 'm', { retryable: false }).retryable).toBe(false);
  });

  it('separates needing user action from being retryable', () => {
    // A missing permission will never resolve itself, but it is fixable - so the
    // UI should prompt rather than merely report failure.
    const error = new NodeExecutionError('n', 't', 'no accessibility permission', {
      retryable: false,
      needsUserAction: true,
    });

    expect(error.retryable).toBe(false);
    expect(error.needsUserAction).toBe(true);
  });

  it('carries detail for the execution log', () => {
    const error = new NodeExecutionError('n', 't', 'm', {
      detail: { selector: { text: 'Send' }, attempted: ['resourceId', 'text'] },
    });

    expect(error.detail.attempted).toEqual(['resourceId', 'text']);
  });

  it('keeps the underlying cause', () => {
    const cause = new Error('bridge rejected');
    expect(new NodeExecutionError('n', 't', 'm', { cause }).cause).toBe(cause);
  });

  it('is recognisable with instanceof after transpilation', () => {
    // Without the prototype fix the engine would treat every node failure as an
    // unknown error and lose the retry flags.
    const error = new NodeExecutionError('n', 't', 'm');

    expect(error).toBeInstanceOf(NodeExecutionError);
    expect(error).toBeInstanceOf(Error);
    expect(isNodeExecutionError(error)).toBe(true);
  });

  it('does not mistake a plain error for a node failure', () => {
    expect(isNodeExecutionError(new Error('x'))).toBe(false);
  });
});

describe('cancellation', () => {
  it('is distinct from a failure', () => {
    // The user stopping a workflow is a normal outcome: it must not be retried or
    // reported as an error.
    const error = new ExecutionCancelledError();

    expect(isExecutionCancelledError(error)).toBe(true);
    expect(isNodeExecutionError(error)).toBe(false);
  });

  it('passes an unaborted signal', () => {
    expect(() => throwIfCancelled(new AbortController().signal)).not.toThrow();
  });

  it('throws on an aborted signal', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => throwIfCancelled(controller.signal)).toThrow(ExecutionCancelledError);
  });
});
