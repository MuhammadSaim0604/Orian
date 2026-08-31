import { ChevronDownIcon, MenuIcon, SendIcon, StopIcon, useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAutomationStatus } from '../automation/useAutomationStatus';
import { useActiveModelLabel } from '../providers/useActiveModelLabel';

import { ChatMessageRow } from './ChatMessageRow';
import { useSessionStore } from './sessionStore';
import { taskListFrom } from './taskList';
import { PinnedTaskCard } from './TaskTimeline';
import { useAgentRun } from './useAgentRun';
import { useActiveSession } from './useSessionViews';

/**
 * The chat.
 *
 * What Agent Mode is meant to be, replacing the single text box and event list (issue B3). The transcript is
 * persisted, so a conversation survives the run that produced it — which is what makes a follow-up possible
 * and what gives the agent something to remember.
 *
 * Three things it has to get right, because this is where a user hands control of their phone to a model:
 *
 * - **Stop is always reachable**, inside the composer rather than at the end of a scrolling log. Someone who
 *   wants to stop an agent wants to stop it now.
 * - **Every step is narrated.** An agent acting silently is alarming; the transcript is the reassurance that
 *   it is doing what was asked.
 * - **It refuses to start when it cannot work.** Accessibility off and no provider key are different
 *   problems with different fixes, and both are said plainly rather than surfacing later as a failed run.
 */

export interface AgentChatScreenProps {
  /** Opens the sidebar. Passed in because the shell owns layout, not this screen. */
  readonly onOpenSessions: () => void;
  /** Opens the model picker. The one setting a person changes mid-conversation. */
  readonly onOpenModelPicker: () => void;
}

export const AgentChatScreen = ({ onOpenSessions, onOpenModelPicker }: AgentChatScreenProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { status } = useAutomationStatus();

  const messages = useSessionStore((state) => state.messages);
  const loading = useSessionStore((state) => state.loading);
  const post = useSessionStore((state) => state.post);
  const activeSession = useActiveSession();

  const { runState, currentTask, configError, timersHeld, events, start, stop } = useAgentRun();

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  /**
   * The plan and how far through it the run is.
   *
   * Derived from the run's events rather than stored, so the pinned card, the transcript's plan card and the
   * overlay cannot disagree — one function, no second copy to drift. Memoised because the event array is
   * replaced on every event and the derivation walks all of it.
   */
  const tasks = useMemo(() => taskListFrom(events), [events]);

  /**
   * Whether to follow new messages.
   *
   * Tracked rather than always scrolling: a user who has scrolled up to read what the agent did earlier must
   * not be yanked back to the bottom every time a step completes, which is exactly what makes a live log
   * impossible to read.
   */
  const pinnedToBottom = useRef(true);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;

    pinnedToBottom.current = distanceFromBottom < BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    if (pinnedToBottom.current) scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const running = runState === 'running';
  const trimmed = draft.trim();
  const canSend = status.isReady && trimmed !== '' && !running;

  const send = useCallback(async () => {
    const text = draft.trim();
    if (text === '') return;

    setDraft('');

    // Recorded before the run starts, so the user's message is in the transcript even if the run fails to
    // begin — a conversation that dropped what you typed because the provider was misconfigured would look
    // like the app lost it.
    await post({ role: 'user', text });

    start(text);
  }, [draft, post, start]);

  return (
    <View className="flex-1">
      {/* Insets applied here rather than with a `SafeAreaView` wrapper, because the composer needs the bottom inset
          on its own padding - a wrapper would inset the whole screen and leave a strip of background below the
          composer instead of the composer sitting against the navigation bar. */}
      <View style={{ paddingTop: insets.top }}>
        <ChatHeader
          title={activeSession?.title ?? 'Agent'}
          onOpenSessions={onOpenSessions}
          onOpenModelPicker={onOpenModelPicker}
          running={running}
        />
      </View>

      {/* Pinned beneath the header, because the plan scrolls out of view the moment the agent starts working and
          "what is it doing now" is the question a user asks continuously while watching their phone be driven. */}
      {tasks !== null && <PinnedTaskCard list={tasks} />}

      {!status.isReady && (
        <Notice
          tone="warning"
          title="Accessibility service is off"
          detail="The agent cannot read or touch the screen until you enable it in Android settings."
        />
      )}

      {configError != null && <Notice tone="danger" title="Cannot start" detail={configError} />}

      <ScrollView
        ref={scrollRef}
        accessibilityLabel="Conversation"
        className="flex-1 px-4"
        onScroll={onScroll}
        scrollEventThrottle={SCROLL_THROTTLE_MS}
        contentContainerStyle={{ paddingVertical: theme.spacing[3] }}
      >
        {loading && messages.length === 0 ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : messages.length === 0 ? (
          <EmptyConversation />
        ) : (
          messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              liveTasks={tasks}
              running={running}
            />
          ))
        )}

        {running && (
          <View className="flex-row items-center gap-2 py-3">
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text className="text-xs text-text-muted">{currentTask || 'Working…'}</Text>
          </View>
        )}
      </ScrollView>

      {/* Only while running, and only when unprotected: something the user needs to know *before* they
          walk away, not after they come back to a stalled run. */}
      {running && !timersHeld && (
        <Text className="bg-warning/15 px-4 py-1 text-xs text-warning">
          This run may pause if you leave the app.
        </Text>
      )}

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        onStop={stop}
        canSend={canSend}
        running={running}
        bottomInset={insets.bottom}
      />
    </View>
  );
};

const ChatHeader = ({
  title,
  onOpenSessions,
  onOpenModelPicker,
  running,
}: {
  readonly title: string;
  readonly onOpenSessions: () => void;
  readonly onOpenModelPicker: () => void;
  readonly running: boolean;
}) => {
  const { theme } = useTheme();
  const model = useActiveModelLabel();

  return (
    <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show conversations"
        onPress={onOpenSessions}
        style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
        className="items-center justify-center"
      >
        <MenuIcon size={20} color={theme.colors.textSecondary} />
      </Pressable>

      <View className="flex-1">
        <Text numberOfLines={1} className="text-base font-semibold text-text-primary">
          {title}
        </Text>
        {running && <Text className="text-xs text-success">Running</Text>}
      </View>

      {/* A labelled button, not an icon: the model in use is a fact worth seeing without pressing anything, and it
          is the one setting a person changes mid-conversation. Settings moved into the sidebar, where a screen
          visited occasionally belongs. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Model: ${model}. Choose a different model`}
        onPress={onOpenModelPicker}
        style={{ minHeight: MIN_TOUCH_TARGET - 8, maxWidth: MODEL_BUTTON_MAX_WIDTH }}
        className="flex-row items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 active:opacity-70"
      >
        {/* Truncated rather than wrapped: a two-line header button would change the header's height as the model
            changes, shifting the conversation beneath it. */}
        <Text numberOfLines={1} className="text-xs font-medium text-text-secondary">
          {model}
        </Text>

        <ChevronDownIcon size={12} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
};

const EmptyConversation = () => (
  <View className="items-center px-6 py-10">
    <Text className="text-center text-sm text-text-secondary">
      Describe what you want done. The agent reads your screen and acts, one step at a time.
    </Text>
    <Text className="mt-3 text-center text-xs text-text-muted">
      “Send Robert a WhatsApp message that I&apos;ll be late tomorrow”
    </Text>
  </View>
);

const Notice = ({
  tone,
  title,
  detail,
}: {
  readonly tone: 'warning' | 'danger';
  readonly title: string;
  readonly detail: string;
}) => (
  <View
    className={`mx-4 mt-2 rounded-lg border bg-surface-muted p-3 ${
      tone === 'danger' ? 'border-danger' : 'border-warning'
    }`}
  >
    <Text
      className={`text-sm font-medium ${tone === 'danger' ? 'text-danger' : 'text-text-primary'}`}
    >
      {title}
    </Text>
    <Text className="mt-1 text-xs text-text-secondary">{detail}</Text>
  </View>
);

/**
 * The composer.
 *
 * **The action sits inside the field**, at its right edge, rather than beside it — that is where a phone user
 * reaches for send, and it leaves the field the full width of the screen.
 *
 * Send becomes Stop while a run is in flight rather than sitting next to it. One control in one place: a
 * disabled Send beside an active Stop invites tapping the wrong one, and during a run stop is the only thing
 * anyone wants.
 */
const Composer = ({
  value,
  onChange,
  onSend,
  onStop,
  canSend,
  running,
  bottomInset,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly canSend: boolean;
  readonly running: boolean;
  /** The navigation-bar inset, so the field sits above the buttons rather than under them. */
  readonly bottomInset: number;
}) => {
  const { theme } = useTheme();

  return (
    <View
      className="border-t border-border px-3 pt-2"
      style={{ paddingBottom: bottomInset + theme.spacing[2] }}
    >
      {/* The field is the row: a bordered container holding the input and the action, so the action reads as part
          of the field rather than as a separate button that happens to sit nearby. */}
      <View
        className="flex-row items-end rounded-xl border border-border bg-surface pl-3 pr-1.5"
        style={{ minHeight: MIN_TOUCH_TARGET }}
      >
        <TextInput
          accessibilityLabel="What should the agent do?"
          className="flex-1 py-2 text-sm text-text-primary"
          style={{ maxHeight: MAX_COMPOSER_HEIGHT, minHeight: MIN_TOUCH_TARGET - 8 }}
          placeholder={running ? 'Running…' : 'Ask the agent to do something'}
          placeholderTextColor={theme.colors.textMuted}
          value={value}
          onChangeText={onChange}
          editable={!running}
          multiline
        />

        {running ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop the agent"
            accessibilityHint="Ends the current task within a step"
            onPress={onStop}
            style={{ width: ACTION_DIAMETER, height: ACTION_DIAMETER, marginBottom: 5 }}
            className="items-center justify-center rounded-full bg-danger active:opacity-70"
          >
            {/* On the filled circle, so the glyph is the background's contrast colour rather than the danger
                colour it now sits on. */}
            <StopIcon size={15} color={theme.colors.textOnPrimary} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send to the agent"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={onSend}
            style={{ width: ACTION_DIAMETER, height: ACTION_DIAMETER, marginBottom: 5 }}
            // A filled round background, as asked. It also solves a real problem: a bare outline glyph inside a
            // bordered field has two competing edges, and the send action should be the one thing in the composer
            // that reads as a button.
            className={`items-center justify-center rounded-full ${
              canSend ? 'bg-primary active:opacity-70' : 'bg-surface-muted'
            }`}
          >
            <SendIcon
              size={17}
              // White on the filled circle; muted against the flat disabled fill, so the disabled state is visible
              // rather than only announced.
              color={canSend ? theme.colors.textOnPrimary : theme.colors.textMuted}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
};

/** Android's minimum touch target. Below this a control is a coin toss to hit. */
const MIN_TOUCH_TARGET = 48;

/**
 * A ceiling for the model button.
 *
 * Wide enough for a real name, narrow enough that it cannot squeeze the conversation title out of the header —
 * and the title is how a person knows which conversation they are in.
 */
const MODEL_BUTTON_MAX_WIDTH = 128;

/** Roughly five lines. Beyond that the composer would eat the conversation it belongs to. */
const MAX_COMPOSER_HEIGHT = 120;

/**
 * The send and stop circle.
 *
 * 36dp rather than the full 48: it sits inside the field, and a 48dp circle in a 48dp-tall row leaves no room for
 * the border. The row itself is the touch target, and the circle is centred in the padding it has.
 */
const ACTION_DIAMETER = 36;

/** Within this many pixels of the bottom counts as "following the conversation". */
const BOTTOM_THRESHOLD = 80;

const SCROLL_THROTTLE_MS = 100;
