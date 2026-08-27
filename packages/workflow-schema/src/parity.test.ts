import {
  ERROR_BEHAVIOURS as SHARED_ERROR_BEHAVIOURS,
  NODE_KINDS as SHARED_NODE_KINDS,
  type ErrorBehaviour as SharedErrorBehaviour,
  type ExecutionPolicy as SharedExecutionPolicy,
  type JsonValue as SharedJsonValue,
  type NodeKind as SharedNodeKind,
} from '@mobile-automation/shared-types';
import { describe, expect, it } from 'vitest';

import { CORE_NODE_CONFIG_SCHEMAS } from './node-config';
import { type JsonValue as SchemaJsonValue } from './variable';
import {
  DEFAULT_EXECUTION_POLICY,
  ExecutionPolicySchema,
  type ExecutionPolicy as SchemaExecutionPolicy,
} from './workflow';

/**
 * Guards the split between plain types and Zod schemas.
 *
 * `shared-types` holds the types with no Zod, so `node-sdk` can sit at the bottom
 * of the graph and a third-party node package need not depend on this schema
 * package. This one duplicates the other's shapes on purpose - and duplication is
 * only safe if something fails when the two drift.
 *
 * These are compile-time assertions with a runtime formality, so a divergence is a
 * typecheck failure rather than a subtly wrong value at run time.
 */

/** Fails to compile unless the two types are mutually assignable. */
type AssertIdentical<A extends B, B extends A> = true;

describe('shared-types parity', () => {
  it('ExecutionPolicy matches the schema output', () => {
    // If the schema gains a field the plain type lacks, or vice versa, this line
    // stops compiling.
    type _Check = AssertIdentical<SharedExecutionPolicy, SchemaExecutionPolicy>;

    const policy: SharedExecutionPolicy = ExecutionPolicySchema.parse({});
    expect(policy).toEqual(DEFAULT_EXECUTION_POLICY);
  });

  it('ErrorBehaviour matches the schema enum', () => {
    type _Check = AssertIdentical<SharedErrorBehaviour, SchemaExecutionPolicy['onError']>;

    expect([...SHARED_ERROR_BEHAVIOURS]).toEqual(['stop', 'continue', 'retry']);
  });

  it('JsonValue is the same shape in both packages', () => {
    type _Check = AssertIdentical<SharedJsonValue, SchemaJsonValue>;

    expect(true).toBe(true);
  });

  it('every shared node kind has a core config schema', () => {
    // A kind with no schema would be registerable but unvalidatable.
    const kinds: readonly SharedNodeKind[] = SHARED_NODE_KINDS;

    for (const kind of kinds) {
      expect(CORE_NODE_CONFIG_SCHEMAS).toHaveProperty(kind);
    }
  });

  it('has no core config schema for a kind that does not exist', () => {
    expect(Object.keys(CORE_NODE_CONFIG_SCHEMAS)).toHaveLength(SHARED_NODE_KINDS.length);
  });
});
