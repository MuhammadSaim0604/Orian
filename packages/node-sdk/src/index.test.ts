import { describe, expect, it } from 'vitest';

import { DEPENDS_ON, NODE_KINDS, PACKAGE_NAME, isNodeKind } from './index.js';

describe('node-sdk', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/node-sdk');
  });

  it('resolves its workspace dependency', () => {
    expect(DEPENDS_ON).toContain('@mobile-automation/shared-types');
  });

  it('declares the seven device-agnostic node kinds', () => {
    expect(NODE_KINDS).toHaveLength(7);
  });

  it('recognises a valid node kind', () => {
    expect(isNodeKind('condition')).toBe(true);
  });

  it('rejects a device capability as a node kind', () => {
    expect(isNodeKind('click')).toBe(false);
  });
});
