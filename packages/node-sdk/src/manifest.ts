import { z } from 'zod';

import { type AnyNodeDefinition } from './definition';

/**
 * The node manifest: how a package advertises what it contributes.
 *
 * A package could just export definitions, but a manifest is what makes
 * *discovery* possible - the app can read a manifest from `package.json` and show
 * the user what a package provides before loading and executing any of its code.
 * That ordering matters for a product where a node can tap on someone's banking
 * app: knowing what a package claims to do should not require running it.
 *
 * This mirrors the n8n community-node model.
 */

/** Where in `package.json` a package declares its nodes. */
export const MANIFEST_FIELD = 'mobileAutomation' as const;

export const NodeManifestEntrySchema = z.object({
  /** Must match the `type` of the exported definition. Checked at load time. */
  type: z.string().min(1),
  version: z.string().min(1),
  kind: z.enum(['input', 'action', 'condition', 'loop', 'variable', 'transform', 'trigger']),
  label: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  category: z.string().min(1),
  /** Declared up front so the UI can warn before a workflow needs a device. */
  requiresDevice: z.boolean().default(false),
});

export type NodeManifestEntry = z.infer<typeof NodeManifestEntrySchema>;

/**
 * What a package publishes under `mobileAutomation` in its `package.json`.
 *
 * `sdkVersion` is the compatibility gate: a package built against a future SDK
 * may rely on context fields this app does not provide, and failing at load with
 * a clear message beats failing mid-run with an undefined property.
 */
export const NodeManifestSchema = z.object({
  sdkVersion: z.string().min(1),
  nodes: z.array(NodeManifestEntrySchema).min(1, 'a node package must declare at least one node'),
});

export type NodeManifest = z.infer<typeof NodeManifestSchema>;

/**
 * Major version of the node SDK contract.
 *
 * Bumped when `NodeDefinition` or `ExecutionContext` changes in a way that would
 * break an existing third-party node.
 */
export const NODE_SDK_VERSION = '1' as const;

/**
 * Whether a package's declared SDK version can run here.
 *
 * Major-version match only. A package built for SDK 1 keeps working as this app
 * adds optional context fields, and one built for SDK 2 is refused rather than
 * left to discover a missing field halfway through driving the device.
 */
export const isCompatibleSdkVersion = (declared: string): boolean => {
  const major = declared.trim().split('.')[0];
  return major === NODE_SDK_VERSION;
};

/** A discrepancy between what a package promised and what it exported. */
export type ManifestMismatch = {
  readonly type: string;
  readonly reason: string;
};

/**
 * Checks exported definitions against the manifest.
 *
 * Both directions matter. A node declared but not exported is a broken package the
 * user should hear about at install time. A node exported but not declared is
 * worse: it would execute without ever appearing in the manifest the user was
 * shown, which defeats the point of having one.
 */
export const reconcileManifest = (
  manifest: NodeManifest,
  definitions: readonly AnyNodeDefinition[],
): ManifestMismatch[] => {
  const mismatches: ManifestMismatch[] = [];

  const exported = new Map(definitions.map((definition) => [definition.type, definition]));
  const declared = new Set(manifest.nodes.map((entry) => entry.type));

  for (const entry of manifest.nodes) {
    const definition = exported.get(entry.type);

    if (definition === undefined) {
      mismatches.push({ type: entry.type, reason: 'declared in the manifest but not exported' });
      continue;
    }

    if (definition.version !== entry.version) {
      mismatches.push({
        type: entry.type,
        reason: `manifest says version ${entry.version} but the definition says ${definition.version}`,
      });
    }

    if (definition.kind !== entry.kind) {
      mismatches.push({
        type: entry.type,
        reason: `manifest says kind ${entry.kind} but the definition says ${definition.kind}`,
      });
    }

    if ((definition.requiresDevice ?? false) !== entry.requiresDevice) {
      // A node that touches the device without saying so would bypass the
      // pre-run capability check.
      mismatches.push({
        type: entry.type,
        reason: 'manifest and definition disagree about whether a device is required',
      });
    }
  }

  for (const definition of definitions) {
    if (!declared.has(definition.type)) {
      mismatches.push({
        type: definition.type,
        reason: 'exported but not declared in the manifest',
      });
    }
  }

  return mismatches;
};
