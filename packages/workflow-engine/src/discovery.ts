import {
  type AnyNodeDefinition,
  MANIFEST_FIELD,
  type NodeManifest,
  NodeManifestSchema,
  type NodeRegistry,
  isCompatibleSdkVersion,
  reconcileManifest,
} from '@mobile-automation/node-sdk';

/**
 * Discovering and registering third-party node packages.
 *
 * The n8n community-node model: a user runs `npm install @developer/custom-nodes`, the
 * app finds packages declaring a node manifest, validates them, and registers what
 * they contribute.
 *
 * The order of operations is the whole point. A node package can tap on someone's
 * banking app, so the app **reads and validates the manifest before loading any of
 * the package's code**. A package that lies about what it provides, targets an
 * incompatible SDK, or is simply broken is rejected without ever executing.
 */

/** What a package looks like to the discovery process. */
export type DiscoverablePackage = {
  readonly name: string;
  readonly version: string;
  /** The `mobileAutomation` field from its `package.json`, if present. */
  readonly manifest?: unknown;
  /**
   * Loads the package's node definitions.
   *
   * A function rather than a value so nothing is imported until the manifest has
   * been checked. Injected rather than using a bare `import()` so this stays
   * testable and so the app controls how modules are resolved - Metro's resolver is
   * not Node's.
   */
  readonly load: () => Promise<readonly AnyNodeDefinition[]>;
};

export type PackageRejectionReason =
  | 'no-manifest'
  | 'invalid-manifest'
  | 'incompatible-sdk'
  | 'manifest-mismatch'
  | 'load-failed'
  | 'registration-failed';

export type RejectedPackage = {
  readonly packageName: string;
  readonly reason: PackageRejectionReason;
  /** What to tell the user, naming the package and the problem. */
  readonly detail: string;
};

export type AcceptedPackage = {
  readonly packageName: string;
  readonly version: string;
  readonly nodeTypes: readonly string[];
};

export type DiscoveryResult = {
  readonly accepted: readonly AcceptedPackage[];
  readonly rejected: readonly RejectedPackage[];
};

/**
 * Reads a `package.json`-style manifest field.
 *
 * Exported because the app needs it separately: the package browser shows what an
 * installed package claims to provide before the user agrees to enable it.
 */
export const readManifest = (
  raw: unknown,
): { ok: true; manifest: NodeManifest } | { ok: false; detail: string } => {
  const parsed = NodeManifestSchema.safeParse(raw);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path === '' ? issue.message : `${path}: ${issue.message}`;
      })
      .join('; ');

    return { ok: false, detail };
  }

  return { ok: true, manifest: parsed.data };
};

/**
 * Validates and registers a set of discovered packages.
 *
 * One bad package must not stop the others: a user with five node packages installed
 * should not lose all of them because one is broken. So each is handled
 * independently and the result reports both what loaded and what did not, with a
 * reason the UI can show.
 */
export const discoverNodePackages = async (
  packages: readonly DiscoverablePackage[],
  registry: NodeRegistry,
): Promise<DiscoveryResult> => {
  const accepted: AcceptedPackage[] = [];
  const rejected: RejectedPackage[] = [];

  for (const candidate of packages) {
    if (candidate.manifest === undefined || candidate.manifest === null) {
      // Not an error: most installed packages have nothing to do with this app.
      rejected.push({
        packageName: candidate.name,
        reason: 'no-manifest',
        detail: `does not declare a "${MANIFEST_FIELD}" field`,
      });
      continue;
    }

    const manifestResult = readManifest(candidate.manifest);
    if (!manifestResult.ok) {
      rejected.push({
        packageName: candidate.name,
        reason: 'invalid-manifest',
        detail: manifestResult.detail,
      });
      continue;
    }

    const { manifest } = manifestResult;

    if (!isCompatibleSdkVersion(manifest.sdkVersion)) {
      // Checked before loading: a package built for a future SDK may rely on
      // context fields this app does not provide, and finding that out mid-run
      // would be far worse than refusing it now.
      rejected.push({
        packageName: candidate.name,
        reason: 'incompatible-sdk',
        detail: `needs node SDK ${manifest.sdkVersion}, which this version cannot run`,
      });
      continue;
    }

    let definitions: readonly AnyNodeDefinition[];
    try {
      definitions = await candidate.load();
    } catch (error) {
      rejected.push({
        packageName: candidate.name,
        reason: 'load-failed',
        detail: error instanceof Error ? error.message : 'could not be loaded',
      });
      continue;
    }

    const mismatches = reconcileManifest(manifest, definitions);
    if (mismatches.length > 0) {
      // A package exporting a node it never declared would execute without
      // appearing in the manifest the user was shown, which defeats the purpose of
      // having one.
      rejected.push({
        packageName: candidate.name,
        reason: 'manifest-mismatch',
        detail: mismatches.map((m) => `${m.type}: ${m.reason}`).join('; '),
      });
      continue;
    }

    // Namespacing is what stops a third-party node shadowing a built-in `click`.
    const namespaced = definitions.map((definition) => ({
      ...definition,
      type: qualifyNodeType(candidate.name, definition.type),
    }));

    try {
      registry.registerAll(namespaced);
    } catch (error) {
      rejected.push({
        packageName: candidate.name,
        reason: 'registration-failed',
        detail: error instanceof Error ? error.message : 'could not be registered',
      });
      continue;
    }

    accepted.push({
      packageName: candidate.name,
      version: candidate.version,
      nodeTypes: namespaced.map((definition) => definition.type),
    });
  }

  return { accepted, rejected };
};

/**
 * Namespaces a third-party node type as `@scope/package:nodeType`.
 *
 * Built-in packages are exempt: their nodes are the canonical `click` and `openApp`
 * that workflows and the AI refer to by bare name.
 */
export const qualifyNodeType = (packageName: string, nodeType: string): string => {
  if (isBuiltInPackage(packageName)) return nodeType;
  if (nodeType.includes(':')) return nodeType;
  return `${packageName}:${nodeType}`;
};

const BUILT_IN_PACKAGES = [
  '@mobile-automation/core-nodes',
  '@mobile-automation/android-nodes',
] as const;

export const isBuiltInPackage = (packageName: string): boolean =>
  (BUILT_IN_PACKAGES as readonly string[]).includes(packageName);

/**
 * Registers the built-in node packages.
 *
 * Separate from discovery because these are not discovered - they ship with the app,
 * are not namespaced, and must be present for any workflow to run at all. If they
 * fail to register, that is a bug in this codebase and should throw rather than be
 * collected as a "rejected package".
 */
export const registerBuiltInNodes = (
  registry: NodeRegistry,
  packages: readonly { name: string; nodes: readonly AnyNodeDefinition[] }[],
): void => {
  for (const pack of packages) {
    registry.registerAll(pack.nodes);
  }
};
