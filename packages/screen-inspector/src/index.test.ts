import { describe, expect, it } from 'vitest';

import {
  PACKAGE_NAME,
  UI_NODE_ATTRIBUTES,
  UI_TREE_ATTRIBUTES,
  UI_TREE_SCHEMA_VERSION,
  centreOf,
  isSupportedSchemaVersion,
  isTappable,
} from './index.js';

describe('screen-inspector', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@mobile-automation/screen-inspector');
  });

  it('serializes the attributes selectors depend on', () => {
    expect(UI_NODE_ATTRIBUTES).toContain('resourceId');
    expect(UI_NODE_ATTRIBUTES).toContain('contentDescription');
  });

  it('describes every attribute the Kotlin parser emits', () => {
    // Mirrors UiNodeAttribute in android/accessibility, where a parity test
    // asserts the serializer emits exactly these keys in this order. Listing
    // fewer here would hide fields from the inspector and the AI.
    expect(UI_NODE_ATTRIBUTES).toEqual([
      'text',
      'resourceId',
      'className',
      'contentDescription',
      'packageName',
      'bounds',
      'clickable',
      'longClickable',
      'scrollable',
      'editable',
      'checkable',
      'checked',
      'selected',
      'focused',
      'enabled',
      'visible',
      'index',
      'children',
    ]);
  });

  it('describes the tree envelope including the screen identity', () => {
    // package + activity scope a selector to the screen it was recorded on.
    expect(UI_TREE_ATTRIBUTES).toContain('packageName');
    expect(UI_TREE_ATTRIBUTES).toContain('activityName');
    expect(UI_TREE_ATTRIBUTES).toContain('schemaVersion');
  });

  it('has no duplicate attribute keys', () => {
    expect(new Set(UI_NODE_ATTRIBUTES).size).toBe(UI_NODE_ATTRIBUTES.length);
    expect(new Set(UI_TREE_ATTRIBUTES).size).toBe(UI_TREE_ATTRIBUTES.length);
  });

  it('accepts the schema version it was written against', () => {
    expect(isSupportedSchemaVersion(UI_TREE_SCHEMA_VERSION)).toBe(true);
  });

  it('rejects an older or newer schema version rather than misreading it', () => {
    expect(isSupportedSchemaVersion(1)).toBe(false);
    expect(isSupportedSchemaVersion(UI_TREE_SCHEMA_VERSION + 1)).toBe(false);
  });

  it('computes the centre of an element', () => {
    expect(centreOf({ left: 100, top: 700, right: 900, bottom: 850 })).toEqual({
      x: 500,
      y: 775,
    });
  });

  it('treats a zero-area element as untappable', () => {
    expect(isTappable({ left: 10, top: 10, right: 10, bottom: 10 })).toBe(false);
  });

  it('treats a normal element as tappable', () => {
    expect(isTappable({ left: 0, top: 0, right: 100, bottom: 50 })).toBe(true);
  });
});
