import { type AgentEvent } from '@mobile-automation/ai-agent';
import { Text, View } from 'react-native';

/**
 * One line of the agent's activity.
 *
 * A user watching their own phone being driven needs to know what is happening at each
 * moment, and "thinking" with no further detail is alarming rather than reassuring. So
 * every event type gets a plain-language line, and a failed step says what failed rather
 * than just showing a red mark.
 */

export interface AgentEventRowProps {
  readonly event: AgentEvent;
}

type Rendered = {
  readonly label: string;
  readonly detail: string | null;
  /** Semantic colour class - no raw colour values in the component. */
  readonly tone: 'normal' | 'muted' | 'good' | 'bad' | 'accent';
};

const render = (event: AgentEvent): Rendered => {
  switch (event.type) {
    case 'runStarted':
      return { label: 'Started', detail: event.goal, tone: 'accent' };

    case 'planned':
      return {
        label: event.isReplan ? 'New plan' : 'Plan',
        detail: event.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
        tone: 'accent',
      };

    case 'observed':
      return {
        label: 'Looking at the screen',
        detail: `${event.packageName ?? 'unknown app'} - ${event.elementCount} elements`,
        tone: 'muted',
      };

    case 'thinking':
      return { label: 'Thinking', detail: event.content, tone: 'muted' };

    case 'toolCallProposed':
      return { label: `Step ${event.step}`, detail: `about to ${event.tool}`, tone: 'muted' };

    case 'toolCallRejected':
      // Surfaced rather than hidden: it explains a pause the user would otherwise see as
      // the agent doing nothing.
      return {
        label: 'Retrying',
        detail: `the AI proposed something invalid (${event.reason})`,
        tone: 'muted',
      };

    case 'toolExecuted':
      return {
        label: `${event.step}. ${event.tool}`,
        detail:
          event.outcome === 'succeeded'
            ? describeArguments(event.arguments)
            : (event.error ?? 'failed'),
        tone: event.outcome === 'succeeded' ? 'good' : 'bad',
      };

    case 'replanning':
      return { label: 'Changing approach', detail: event.reason, tone: 'accent' };

    case 'runFinished':
      return {
        label: FINISH_LABEL[event.outcome] ?? 'Finished',
        detail: event.summary,
        tone: event.outcome === 'succeeded' ? 'good' : 'bad',
      };
  }
};

const FINISH_LABEL: Record<string, string> = {
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Stopped',
  exhausted: 'Gave up',
};

const TONE_CLASS: Record<Rendered['tone'], string> = {
  normal: 'text-text-primary',
  muted: 'text-text-muted',
  good: 'text-success',
  bad: 'text-danger',
  accent: 'text-primary',
};

/**
 * Describes tool arguments in a phrase, not JSON.
 *
 * A selector dumped as JSON is unreadable on a phone, and the user cares which element
 * was touched rather than how it was identified.
 */
const describeArguments = (args: Record<string, unknown>): string | null => {
  const selector = args.selector as Record<string, unknown> | undefined;

  if (selector !== undefined) {
    const label =
      (selector.text as string | undefined) ??
      (selector.contentDescription as string | undefined) ??
      (selector.resourceId as string | undefined);

    if (label !== undefined) return `"${label}"`;
  }

  if (typeof args.packageName === 'string') return args.packageName;
  if (typeof args.text === 'string') return `"${args.text}"`;
  if (typeof args.direction === 'string') return args.direction;

  return null;
};

export const AgentEventRow = ({ event }: AgentEventRowProps) => {
  const { label, detail, tone } = render(event);

  return (
    <View
      accessible
      accessibilityLabel={detail == null ? label : `${label}. ${detail}`}
      className="border-b border-border py-2"
    >
      <Text className={`text-sm font-medium ${TONE_CLASS[tone]}`}>{label}</Text>
      {detail != null && <Text className="mt-0.5 text-xs text-text-secondary">{detail}</Text>}
    </View>
  );
};
