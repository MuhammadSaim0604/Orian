import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { UI_NODE_ATTRIBUTES, UI_TREE_ATTRIBUTES, UI_TREE_SCHEMA_VERSION } from './index';

/**
 * Parity with the Kotlin UI-tree contract (issue G7).
 *
 * ## Why this reads the Kotlin source
 *
 * The UI-tree key list is one of three contracts in this repo duplicated on purpose, so a parity test can catch
 * drift. Until now only the **Kotlin** half was tested: `UiTreeSerializerTest` asserts the serializer emits
 * exactly the keys `UiNodeAttribute` declares. Nothing checked that the TypeScript copy still matched, so a key
 * added to the Kotlin enum and forgotten here would leave the TS side reading a field that is never present —
 * silently, because a missing key in JSON is `undefined` rather than an error.
 *
 * A test can only catch that by comparing against the other side, and the other side is Kotlin. So this parses
 * the enum out of the source file. Parsing source is normally a bad idea; here it is the *only* thing that
 * closes the gap, because there is no shared artefact between a Gradle module and a pnpm package to compare
 * against instead.
 *
 * It is deliberately strict about failing when the file cannot be read. A parity test that skips itself when the
 * other half is missing provides exactly the false assurance G7 is about.
 */

/** Walks up from this file to the repo root, identified by the `android` directory beside `packages`. */
const repoRoot = (): string => {
  let current = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(current, 'android', 'accessibility');

    try {
      readFileSync(join(candidate, 'build.gradle.kts'), 'utf8');
      return current;
    } catch {
      current = dirname(current);
    }
  }

  throw new Error('could not locate the repo root from this test file');
};

const kotlinSource = (): string =>
  readFileSync(
    join(
      repoRoot(),
      'android',
      'accessibility',
      'src',
      'main',
      'kotlin',
      'com',
      'mobileautomation',
      'accessibility',
      'UiNodeAttribute.kt',
    ),
    'utf8',
  );

/**
 * Extracts the wire keys from one Kotlin enum body.
 *
 * Matches `NAME("key")` between the enum's declaration and its closing `;`, which is the shape both enums use.
 * Order is preserved, because the order is part of the contract — the serializer emits in declaration order and
 * a diff of the two lists is far easier to read than a set comparison.
 */
const kotlinKeys = (source: string, enumName: string): string[] => {
  const declaration = source.indexOf(`enum class ${enumName}(val key: String) {`);
  expect(declaration, `${enumName} not found in the Kotlin source`).toBeGreaterThan(-1);

  const body = source.slice(declaration, source.indexOf(';', declaration));

  return [...body.matchAll(/^\s{4}[A-Z][A-Z0-9_]*\("([^"]+)"\),$/gm)].map((match) => match[1]!);
};

describe('node attributes', () => {
  it('matches the Kotlin UiNodeAttribute enum exactly, in order', () => {
    // The check G7 asked for. Order matters as well as content: the serializer emits in declaration order, and
    // a consumer reading positionally would break on a reorder that a set comparison would pass.
    expect([...UI_NODE_ATTRIBUTES]).toEqual(kotlinKeys(kotlinSource(), 'UiNodeAttribute'));
  });
});

describe('tree envelope attributes', () => {
  it('matches the Kotlin UiTreeAttribute enum exactly, in order', () => {
    expect([...UI_TREE_ATTRIBUTES]).toEqual(kotlinKeys(kotlinSource(), 'UiTreeAttribute'));
  });
});

describe('schema version', () => {
  it('matches the Kotlin UI_TREE_SCHEMA_VERSION', () => {
    // The version is what lets either side reject a payload it cannot read. If the two disagree, that rejection
    // fires on every capture or never fires at all — and both are worse than the drift it was meant to catch.
    const declaration = /const val UI_TREE_SCHEMA_VERSION: Int = (\d+)/.exec(kotlinSource());

    expect(declaration, 'UI_TREE_SCHEMA_VERSION not found in the Kotlin source').not.toBeNull();
    expect(Number(declaration![1])).toBe(UI_TREE_SCHEMA_VERSION);
  });
});

describe('the test itself', () => {
  it('actually read something, rather than passing on two empty lists', () => {
    // Without this, a change to the Kotlin file's formatting would make the regex match nothing and every
    // assertion above would compare an empty list to an empty list and pass. A parity test that can silently
    // stop testing is the failure mode G7 describes.
    const source = kotlinSource();

    expect(kotlinKeys(source, 'UiNodeAttribute').length).toBeGreaterThan(10);
    expect(kotlinKeys(source, 'UiTreeAttribute').length).toBeGreaterThan(5);
  });
});
