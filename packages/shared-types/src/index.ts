/**
 * `@mobile-automation/shared-types`
 *
 * Bottom of the dependency graph: types shared across every package. This
 * package must never import from another workspace package.
 *
 * Phase 1 scaffold - the real cross-package types land with the schemas in
 * Phase 4 (`workflow-schema`) and the tool surface in Phase 3.
 */

/** Package identity, used to sanity-check wiring across the workspace. */
export const PACKAGE_NAME = '@mobile-automation/shared-types' as const;

/**
 * Which layer a piece of code belongs to. The language boundary between the
 * React Native product layer and the Kotlin OS layer is the core architectural
 * rule of this project, so it is worth naming in types.
 */
export type Layer = 'product' | 'runtime' | 'native';

/** A branded identifier, so ids of different kinds cannot be mixed up. */
export type Id<TBrand extends string> = string & { readonly __brand: TBrand };

export type WorkflowId = Id<'workflow'>;
export type NodeId = Id<'node'>;
export type EdgeId = Id<'edge'>;
export type ExecutionId = Id<'execution'>;

/** Result of an operation that is expected to fail in normal use. */
export type Result<TValue, TError = Error> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export const ok = <TValue>(value: TValue): Result<TValue, never> => ({ ok: true, value });

export const err = <TError>(error: TError): Result<never, TError> => ({ ok: false, error });
