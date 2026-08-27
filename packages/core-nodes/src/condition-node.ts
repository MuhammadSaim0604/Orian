import {
  type ExecutionContext,
  type JsonValue,
  NodeExecutionError,
  defineNode,
} from '@mobile-automation/node-sdk';
import {
  type Condition,
  ConditionNodeConfigSchema,
  type ComparisonOperator,
  isUnaryOperator,
} from '@mobile-automation/workflow-schema';

import { isTruthy, resolveValue, stringify } from './values';

/**
 * The condition node: the only place a workflow branches.
 *
 * It returns a named output handle rather than a boolean, so the engine follows the
 * `true` or `false` edge without having to interpret a result value. Which branch
 * was taken is therefore explicit in the execution log, and a user reading the log
 * can see the decision rather than infer it.
 */

export const NODE_TYPE = 'condition' as const;

/** Compares two values under an operator. Exported for the engine's loop support. */
export const compare = (
  left: JsonValue,
  operator: ComparisonOperator,
  right: JsonValue | undefined,
): boolean => {
  switch (operator) {
    case 'equals':
      return looseEquals(left, right);

    case 'notEquals':
      return !looseEquals(left, right);

    case 'contains':
      return contains(left, right);

    case 'notContains':
      return !contains(left, right);

    case 'greaterThan':
      return compareNumbers(left, right) > 0;

    case 'lessThan':
      return compareNumbers(left, right) < 0;

    case 'isEmpty':
      return !isTruthy(left);

    case 'isNotEmpty':
      return isTruthy(left);
  }
};

/**
 * Equality that does not distinguish 5 from "5".
 *
 * Values arriving from a text input are strings even when the user typed a number,
 * and requiring exact type equality would make the obvious workflow fail for a
 * reason invisible on the canvas. Objects compare structurally.
 */
const looseEquals = (left: JsonValue, right: JsonValue | undefined): boolean => {
  if (right === undefined) return left === null;
  if (left === null || right === null) return left === right;

  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  if (typeof left === typeof right) return left === right;

  return stringify(left) === stringify(right);
};

/** Substring for strings, membership for arrays, key presence for objects. */
const contains = (left: JsonValue, right: JsonValue | undefined): boolean => {
  if (right === undefined) return false;

  if (typeof left === 'string') return left.includes(stringify(right));

  if (Array.isArray(left)) {
    return left.some((element) => looseEquals(element, right));
  }

  if (left !== null && typeof left === 'object') {
    return Object.prototype.hasOwnProperty.call(left, stringify(right));
  }

  return false;
};

/**
 * Numeric comparison, coercing strings.
 *
 * Throws on a value that is not a number at all. Comparing "hello" to 3 has no
 * sensible answer, and returning false would let a workflow branch on nonsense.
 */
const compareNumbers = (left: JsonValue, right: JsonValue | undefined): number => {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);

  if (leftNumber === null || rightNumber === null) {
    throw new Error(
      `cannot compare ${JSON.stringify(left)} and ${JSON.stringify(right)} numerically`,
    );
  }

  return leftNumber - rightNumber;
};

const toNumber = (value: JsonValue | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Evaluates a condition.
 *
 * Exported so the loop node can share it for `while` loops - a loop condition and a
 * branch condition should never disagree about what "the Send button exists" means.
 */
export const evaluateCondition = async (
  condition: Condition,
  context: ExecutionContext<unknown>,
  nodeType: string,
): Promise<boolean> => {
  switch (condition.type) {
    case 'element_exists': {
      if (!context.tools.isAvailable) {
        throw new NodeExecutionError(
          context.nodeId,
          nodeType,
          'this condition inspects the screen, but no device is attached',
          { retryable: false, needsUserAction: true },
        );
      }

      // waitForElement rather than findElement when a timeout is given: a screen
      // that has not finished loading is the most common reason a real element is
      // reported absent.
      try {
        if (condition.timeoutMs !== undefined && condition.timeoutMs > 0) {
          await context.tools.invoke('waitForElement', {
            selector: condition.selector,
            timeoutMs: condition.timeoutMs,
          });
        } else {
          await context.tools.invoke('findElement', { selector: condition.selector });
        }
        return true;
      } catch {
        // Not found is a legitimate answer here, not a node failure: the whole
        // point of the condition is to ask whether something is present.
        return false;
      }
    }

    case 'comparison': {
      const left = resolveValue(condition.left, context, nodeType);
      const right =
        condition.right === undefined
          ? undefined
          : resolveValue(condition.right, context, nodeType);

      if (!isUnaryOperator(condition.operator) && right === undefined) {
        throw new NodeExecutionError(
          context.nodeId,
          nodeType,
          `operator "${condition.operator}" needs a right-hand value`,
          { retryable: false },
        );
      }

      try {
        return compare(left, condition.operator, right);
      } catch (error) {
        throw new NodeExecutionError(
          context.nodeId,
          nodeType,
          error instanceof Error ? error.message : 'comparison failed',
          { retryable: false, cause: error },
        );
      }
    }

    case 'current_app': {
      if (!context.tools.isAvailable) {
        throw new NodeExecutionError(
          context.nodeId,
          nodeType,
          'this condition checks the foreground app, but no device is attached',
          { retryable: false, needsUserAction: true },
        );
      }

      const screen = (await context.tools.invoke('getCurrentScreen', {})) as {
        packageName?: string | null;
      };

      return screen?.packageName === condition.packageName;
    }
  }
};

export const conditionNode = defineNode({
  type: NODE_TYPE,
  version: '1.0.0',
  kind: 'condition',
  display: {
    label: 'If',
    description: 'Takes one path or the other depending on a test',
    icon: 'git-branch',
    category: 'Logic',
  },
  configSchema: ConditionNodeConfigSchema,
  inputs: [{ handle: 'in', label: 'In' }],
  outputs: [
    { handle: 'true', label: 'True' },
    { handle: 'false', label: 'False' },
  ],
  execute: async (context) => {
    const result = await evaluateCondition(context.config.condition, context, NODE_TYPE);
    const branch = context.config.negate ? !result : result;

    context.log(`condition evaluated to ${branch}`);

    return {
      branch: { handle: branch ? 'true' : 'false' },
      outputs: { result: branch },
      summary: `took the ${branch ? 'true' : 'false'} branch`,
    };
  },
});
