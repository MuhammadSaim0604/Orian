import { RefreshIcon, useTheme } from '@mobile-automation/ui';
import { Text, View } from 'react-native';

import { type ChatMessage, parseMessageDetail } from './sessionStorage';
import { type TaskList, storedPlanFrom, taskListFromStored } from './taskList';
import { TaskTimeline } from './TaskTimeline';
import { ThinkingStrip } from './ThinkingStrip';

/**
 * One message in the transcript.
 *
 * Four roles, four shapes, because they are four different kinds of thing and rendering them alike would
 * make the conversation unreadable:
 *
 * - **user** — a bubble, right-aligned. What was asked.
 * - **assistant** — plain text, left-aligned. What was said back.
 * - **tool** — a structured row: what was done, to what, and whether it worked. **Never raw JSON.** The
 *   step file is explicit about this and it is the difference between a readable chat and a log dump; the
 *   information is already in the event, it just has to be phrased.
 * - **event** — loop narration (a plan, a replan), muted, because it explains a pause the user would
 *   otherwise read as the agent doing nothing.
 */

export interface ChatMessageRowProps {
  readonly message: ChatMessage;
  /**
   * The live run's task list, when there is one.
   *
   * Passed in rather than subscribed to here, because a row renders inside a list and a per-row subscription
   * would re-render every message on every event.
   */
  readonly liveTasks?: TaskList | null;
  /** Whether a run is in flight, which decides whether the thinking strip pulses. */
  readonly running?: boolean;
}

/**
 * The structured half of a tool message.
 *
 * Optional throughout: detail is opaque storage that an older version of the app may have written, so every
 * field is treated as absent-until-proven rather than assumed.
 */
type ToolDetail = {
  readonly tool?: string;
  readonly arguments?: Record<string, unknown>;
  readonly outcome?: 'succeeded' | 'failed';
  readonly error?: string;
  readonly step?: number;
};

export const ChatMessageRow = ({
  message,
  liveTasks = null,
  running = false,
}: ChatMessageRowProps) => {
  switch (message.role) {
    case 'user':
      return <UserMessage text={message.text} />;

    case 'assistant':
      return <AssistantMessage text={message.text} />;

    case 'tool':
      return <ToolMessage message={message} />;

    case 'event':
      return <EventMessage message={message} liveTasks={liveTasks} running={running} />;
  }
};

const UserMessage = ({ text }: { readonly text: string }) => (
  <View className="items-end py-1.5">
    <View className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2">
      <Text className="text-sm text-text-on-primary">{text}</Text>
    </View>
  </View>
);

const AssistantMessage = ({ text }: { readonly text: string }) => (
  <View className="items-start py-1.5">
    <View className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface px-3 py-2">
      <Text className="text-sm text-text-primary">{text}</Text>
    </View>
  </View>
);

/**
 * A tool call, phrased rather than dumped.
 *
 * The outcome is carried by a coloured rail down the left edge rather than an icon: it reads at a glance
 * while scrolling, and it does not depend on a glyph being present — a missing icon inside a chat is the
 * kind of thing nobody notices until a user reports a blank square.
 */
const ToolMessage = ({ message }: { readonly message: ChatMessage }) => {
  const detail = parseMessageDetail<ToolDetail>(message.detail);
  const failed = detail?.outcome === 'failed';

  return (
    <View className="py-1.5 pl-2">
      <View
        accessible
        accessibilityLabel={`${message.text}. ${failed ? 'Failed' : 'Succeeded'}`}
        className={`border-l-2 pl-3 ${failed ? 'border-danger' : 'border-success'}`}
      >
        <Text className="text-xs font-medium text-text-primary">{message.text}</Text>

        {/* Only on failure. On success the phrase above already says what happened, and repeating it
            would double the height of every row in a long run. */}
        {failed && detail?.error != null && (
          <Text className="mt-0.5 text-xs text-danger">{detail.error}</Text>
        )}
      </View>
    </View>
  );
};

/**
 * Loop narration: a plan, a replan, or the model's reasoning.
 *
 * One role covering three shapes, discriminated by `detail.kind`. They share a role because they share the
 * property that matters more than their appearance — none is speech, and all must be excludable from the prompt.
 *
 * A stored message with no `kind` falls through to plain muted text, which is exactly what it used to render as.
 * Nothing in an existing conversation breaks because the renderer grew.
 */
const EventMessage = ({
  message,
  liveTasks,
  running,
}: {
  readonly message: ChatMessage;
  readonly liveTasks: TaskList | null;
  readonly running: boolean;
}) => {
  const { theme } = useTheme();
  const detail = parseMessageDetail<{ kind?: string }>(message.detail);

  const plan = storedPlanFrom(detail);

  if (plan !== null) {
    return (
      <View className="py-2">
        {/* A card, because a plan is a distinct object in the conversation rather than a remark. Bordered rather
            than filled: a filled block at this width competes with the user's own bubbles. */}
        <View className="rounded-xl border border-border bg-surface p-3">
          <TaskTimeline list={taskListFromStored(plan, liveTasks)} />
        </View>
      </View>
    );
  }

  if (detail?.kind === 'thinking') {
    return <ThinkingStrip content={message.text} live={running} />;
  }

  if (detail?.kind === 'replan') {
    return (
      <View className="flex-row items-center gap-1.5 py-1">
        <RefreshIcon size={13} color={theme.colors.warning} />
        <Text className="flex-1 text-xs text-text-muted">{message.text}</Text>
      </View>
    );
  }

  return (
    <View className="py-1" style={{ paddingLeft: theme.spacing[2] }}>
      <Text className="text-xs text-text-muted">{message.text}</Text>
    </View>
  );
};

/**
 * Turns a tool call into a phrase.
 *
 * Exported because the run controller uses it when persisting a message, so the stored text is already
 * readable — the alternative is storing a tool name plus JSON and phrasing it at render time, which would
 * mean the transcript's wording changed whenever this function did.
 *
 * The wording answers what a user actually wants to know: what did it do, and to what.
 */
export const describeToolCall = (tool: string, args: Readonly<Record<string, unknown>>): string => {
  const target = describeTarget(args);

  switch (tool) {
    case 'click':
      return target === null ? 'Tapped the screen' : `Tapped ${target}`;
    case 'longPress':
      return target === null ? 'Held the screen' : `Held ${target}`;
    case 'typeText':
      return typeof args.text === 'string' ? `Typed “${truncate(args.text, 40)}”` : 'Typed text';
    case 'swipe':
      return typeof args.direction === 'string' ? `Swiped ${args.direction}` : 'Swiped';
    case 'pressBack':
      return 'Pressed back';
    case 'pressHome':
      return 'Went to the home screen';
    case 'openApp':
    case 'openAppByName':
      return target === null ? 'Opened an app' : `Opened ${target}`;
    case 'getUiTree':
      return 'Read the screen';
    case 'getCurrentScreen':
      return 'Checked which app is open';
    case 'findElement':
      return target === null ? 'Looked for an element' : `Looked for ${target}`;
    case 'waitForElement':
      return target === null ? 'Waited for an element' : `Waited for ${target}`;
    case 'takeScreenshot':
      return 'Took a screenshot';
    case 'runOcr':
      return 'Read text from the screen';
    case 'getContacts':
    case 'findContacts':
      return 'Looked up contacts';
    case 'createAlarm':
      return 'Set an alarm';
    case 'readClipboard':
      return 'Read the clipboard';
    case 'writeClipboard':
      return 'Copied to the clipboard';
    case 'sendNotification':
      return 'Sent a notification';
    case 'launchIntent':
      return 'Asked Android to handle something';
    case 'listApps':
      return 'Listed installed apps';
    case 'getSystemSetting':
      return 'Read a system setting';
    case 'controlMedia':
      return 'Controlled playback';
    case 'adjustVolume':
      return 'Changed the volume';
    default:
      // An unknown tool still gets a row rather than being dropped. A third-party or newly added tool
      // appearing as its own name is far better than a silent gap in the transcript.
      return tool;
  }
};

/**
 * What a call was aimed at, in the user's terms.
 *
 * A selector is a priority chain of ways to identify an element, and its *text* is the only part a person
 * recognises — `resourceId` is developer vocabulary. So text and contentDescription come first, and a bare
 * resourceId is used only when nothing human-readable exists.
 */
const describeTarget = (args: Readonly<Record<string, unknown>>): string | null => {
  const selector = args.selector as Record<string, unknown> | undefined;

  if (selector !== undefined) {
    const label =
      asString(selector.text) ??
      asString(selector.contentDescription) ??
      asString(selector.resourceId);

    if (label !== null) return `“${truncate(label, 32)}”`;
  }

  return asString(args.appName) ?? asString(args.packageName) ?? asString(args.name);
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;
