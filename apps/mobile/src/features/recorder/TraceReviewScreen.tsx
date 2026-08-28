import {
  type ExecutionStep,
  type ExecutionTrace,
  describeScreenIdentity,
  isObservationTool,
} from '@mobile-automation/execution-recorder';
import { Badge, Button, Card, EmptyState, Field, Toggle } from '@mobile-automation/ui';
import { type Workflow } from '@mobile-automation/workflow-schema';
import { ScrollView, Text, View } from 'react-native';

import { useTraceWorkflow } from './useTraceWorkflow';

/**
 * The trace review screen.
 *
 * A generated workflow is going to drive someone's phone, and they did not write it. So this
 * screen's job is not to display a trace - it is to let the user **judge** the workflow before
 * saving it. Three things it must say, in order of importance:
 *
 * - What was dropped, and why. A silent collapse from nine steps to six looks like data loss.
 * - How durable each step is. A workflow of id matches will probably still work next month; one
 *   full of position matches probably will not, and only the user can decide whether that
 *   matters.
 * - What would stop it running at all, kept visually distinct from what is merely worth
 *   checking.
 */

export interface TraceReviewScreenProps {
  readonly trace: ExecutionTrace;
  /** Puts the generated workflow on the canvas for editing. */
  readonly onOpenInBuilder: (workflow: Workflow) => void;
  readonly onCancel: () => void;
}

export const TraceReviewScreen = ({ trace, onOpenInBuilder, onCancel }: TraceReviewScreenProps) => {
  const { compilation, extractVariables, setExtractVariables } = useTraceWorkflow(trace);

  if (compilation === null) {
    return <EmptyState title="Nothing recorded" detail="This run has no steps to compile." />;
  }

  const { generation, check, durability } = compilation;

  const blocking = check.issues.filter((issue) => issue.blocking);
  const warnings = check.issues.filter((issue) => !issue.blocking);

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">Build from this run</Text>
        <Text className="mt-1 text-sm text-text-secondary">{trace.goal}</Text>
      </View>

      <Card
        title={`${generation.workflow.nodes.length} steps`}
        subtitle={`Recorded ${trace.steps.length} actions · ${describeOutcome(trace)}`}
        trailing={
          <Badge
            label={blocking.length > 0 ? 'needs work' : 'ready'}
            tone={blocking.length > 0 ? 'bad' : 'good'}
          />
        }
      >
        <Text className="text-xs text-text-secondary">{durability.summary}</Text>
      </Card>

      {blocking.length > 0 && (
        <Card title="This would not run" muted>
          <View className="gap-1">
            {blocking.map((issue) => (
              <Text key={issue.message} className="text-xs text-danger">
                • {issue.message}
              </Text>
            ))}
          </View>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card title="Worth checking" muted>
          <View className="gap-1">
            {warnings.map((issue) => (
              <Text key={issue.message} className="text-xs text-text-secondary">
                • {issue.message}
              </Text>
            ))}
          </View>
        </Card>
      )}

      <Card title="The workflow">
        <View className="gap-2">
          {generation.workflow.nodes.map((node, position) => {
            const origin = generation.origins[position];

            return (
              <View
                key={node.id}
                accessible
                accessibilityLabel={`Step ${position + 1}: ${node.metadata.label}. ${origin?.rationale ?? ''}`}
                className="rounded-md border border-border bg-surface p-2.5"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 pr-2 text-sm text-text-primary">
                    {position + 1}. {node.metadata.label}
                  </Text>
                  {origin?.strategy != null && (
                    <Badge label={origin.strategy} tone={origin.fragile ? 'warn' : 'good'} />
                  )}
                </View>
                {origin?.rationale != null && (
                  <Text className="mt-0.5 text-xs text-text-muted">{origin.rationale}</Text>
                )}
              </View>
            );
          })}
        </View>
      </Card>

      <Card title="Make it reusable">
        <Field
          label="Turn typed text into variables"
          hint={
            extractVariables
              ? 'The workflow asks for the text each time, with what was typed as the default.'
              : 'The workflow will always type exactly what this run typed.'
          }
        >
          <Toggle
            accessibilityLabel="Turn typed text into variables"
            value={extractVariables}
            onChange={setExtractVariables}
          />
        </Field>

        {generation.variableCount > 0 && (
          <View className="mt-2 gap-1">
            {generation.workflow.variables.map((variable) => (
              <Text key={variable.name} className="text-xs text-text-secondary">
                {variable.name} = {JSON.stringify(variable.defaultValue)}
              </Text>
            ))}
          </View>
        )}
      </Card>

      {generation.omitted.length > 0 && (
        <Card title={`${generation.omitted.length} steps left out`} muted>
          {/* Stated rather than silent: a collapse from nine recorded steps to six looks like
              data loss unless the difference is explained. */}
          <View className="gap-1">
            {generation.omitted.map((entry) => (
              <Text key={`${entry.index}`} className="text-xs text-text-secondary">
                Step {entry.index} ({entry.tool}) — {entry.reason}
              </Text>
            ))}
          </View>
        </Card>
      )}

      <Card title="What the run did" muted>
        <View className="gap-1">
          {trace.steps.map((step) => (
            <TraceStepRow key={step.index} step={step} />
          ))}
        </View>
      </Card>

      <Button
        label="Open in the builder"
        onPress={() => onOpenInBuilder(generation.workflow)}
        disabled={generation.workflow.nodes.length === 0}
        accessibilityLabel="Open the generated workflow in the builder to edit it"
      />
      <Text className="-mt-1 text-xs text-text-muted">
        Nothing is saved yet. You can edit the steps on the canvas and save when you are happy.
      </Text>

      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </ScrollView>
  );
};

/** One recorded step, including the ones the workflow does not use. */
const TraceStepRow = ({ step }: { readonly step: ExecutionStep }) => {
  const tone =
    step.outcome === 'failed'
      ? 'text-danger'
      : isObservationTool(step.tool)
        ? 'text-text-muted'
        : 'text-text-secondary';

  return (
    <View accessible accessibilityLabel={`Step ${step.index}, ${step.tool}, ${step.outcome}`}>
      <Text className={`text-xs ${tone}`}>
        {step.index}. {step.tool}
        {step.error != null ? ` — ${step.error}` : ''}
      </Text>
      <Text className="text-xs text-text-muted">{describeScreenIdentity(step.screen)}</Text>
    </View>
  );
};

const describeOutcome = (trace: ExecutionTrace): string => {
  switch (trace.outcome) {
    case 'succeeded':
      return 'the run succeeded';
    case 'failed':
      return 'the run failed';
    case 'cancelled':
      return 'the run was stopped';
    case 'exhausted':
      return 'the run ran out of steps';
  }
};
