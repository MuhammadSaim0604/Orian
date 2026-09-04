import {
  CloseIcon,
  Markdown,
  SendIcon,
  SparkIcon,
  StopIcon,
  useTheme,
} from '@mobile-automation/ui';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { type AssistantTurn } from './assistantController';
import { useAssistant } from './useAssistant';
import { useAssistMic } from './useAssistMic';

/**
 * The Orion Assist panel.
 *
 * Shown in the voice-interaction session's own window, over whatever app the user was looking at. Two consequences
 * shape the whole layout:
 *
 * - **It is transient.** The system may dismiss it, so nothing here is the only copy of anything — the exchange
 *   lives in `assistantController`, a module.
 * - **It sits over someone else's app.** It anchors to the bottom and leaves the top two-thirds of the screen
 *   visible, because the thing being asked about is usually up there. A centred panel would cover the answer.
 */

export interface AssistPanelProps {
  /**
   * Whether the system handed us screen context.
   *
   * Passed from Kotlin as an initial prop because it is knowable only at the moment of summoning. False is a real
   * state, not an error — the user can turn off "Use screen context" in assist settings — and the panel says so,
   * since it is fixable and otherwise Orion just looks incapable of reading a screen in plain view.
   */
  readonly hasScreenContext?: boolean;
}

export const AssistPanel = ({ hasScreenContext = true }: AssistPanelProps) => {
  const { theme } = useTheme();
  const assistant = useAssistant();
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  const mic = useAssistMic((text) => {
    // Sent as soon as the transcript is final. A voice assistant that made you confirm what you just said out loud
    // would defeat the point of speaking to it.
    void assistant.ask(text);
  });

  const busy = assistant.state === 'thinking';

  useEffect(() => {
    // Pinned to the newest turn. `requestAnimationFrame` rather than a direct call, so the scroll happens after the
    // layout pass that added the turn — otherwise it scrolls to where the content used to end.
    const frame = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [assistant.turns.length, assistant.partialSpeech]);

  const send = () => {
    const text = draft.trim();
    if (text === '' || busy) return;

    setDraft('');
    void assistant.ask(text);
  };

  return (
    <View className="flex-1 justify-end">
      {/* Tapping away closes it, the way every assistant panel does. A transparent pressable rather than a modal
          backdrop: this window already sits over another app, and dimming it would obscure the thing being asked
          about. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Orion"
        className="flex-1"
        onPress={assistant.dismiss}
      />

      <View
        className="rounded-t-3xl border-t border-border bg-surface"
        style={{ maxHeight: '62%', paddingBottom: theme.spacing[3] }}
      >
        <Header
          state={assistant.state}
          onClose={assistant.dismiss}
          onStop={assistant.stop}
          canStop={busy || assistant.state === 'speaking'}
        />

        <ScrollView
          ref={scroll}
          className="px-4"
          contentContainerStyle={{ paddingBottom: theme.spacing[2] }}
          keyboardShouldPersistTaps="handled"
        >
          {assistant.turns.length === 0 && (
            <Empty hasScreenContext={hasScreenContext} listening={mic.listening} />
          )}

          {assistant.turns.map((turn) => (
            <Turn key={turn.id} turn={turn} />
          ))}

          {/* What is being heard, before it becomes a turn. Shown in the transcript rather than in the input, so
              the user watches their words land where the answer will appear. */}
          {assistant.partialSpeech !== '' && (
            <View className="items-end py-1.5">
              <View className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/60 px-3 py-2">
                <Text className="text-sm text-text-on-primary">{assistant.partialSpeech}</Text>
              </View>
            </View>
          )}

          {busy && <Text className="py-2 text-xs text-text-muted">Working on it…</Text>}

          {assistant.error !== null && (
            <Text className="py-2 text-xs text-danger">{assistant.error}</Text>
          )}

          {mic.error !== null && (
            <Text className="py-2 text-xs text-danger">{micErrorText(mic.error)}</Text>
          )}
        </ScrollView>

        <Composer draft={draft} onChange={setDraft} onSend={send} busy={busy} mic={mic} />
      </View>
    </View>
  );
};

/**
 * The panel's top row.
 *
 * Carries the name, because the user summoned something by a gesture and needs to see *what* opened — an unlabelled
 * panel over another app is alarming. The stop button appears only while there is something to stop, so it is never
 * a control that does nothing.
 */
const Header = ({
  state,
  onClose,
  onStop,
  canStop,
}: {
  readonly state: string;
  readonly onClose: () => void;
  readonly onStop: () => void;
  readonly canStop: boolean;
}) => {
  const { theme } = useTheme();

  return (
    <View className="flex-row items-center gap-2 px-4 py-3">
      <SparkIcon size={16} color={theme.colors.primary} />

      <Text className="flex-1 text-sm font-semibold text-text-primary">Orion</Text>

      {canStop && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state === 'speaking' ? 'Stop speaking' : 'Stop'}
          hitSlop={10}
          onPress={onStop}
          className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
        >
          <StopIcon size={14} color={theme.colors.danger} />
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Orion"
        hitSlop={10}
        onPress={onClose}
        className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
      >
        <CloseIcon size={14} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
};

/**
 * One turn.
 *
 * The assistant's reply is markdown, from the same renderer as the chat — models write markdown wherever they are
 * asked, and this panel is no exception. What is *spoken* is the stripped version, which is why the two are built
 * from one source but never the same string.
 */
const Turn = ({ turn }: { readonly turn: AssistantTurn }) => {
  if (turn.role === 'user') {
    return (
      <View className="items-end py-1.5">
        <View className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2">
          <Text className="text-sm text-text-on-primary">{turn.text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="items-start py-1.5">
      <View className="max-w-[92%]">
        <Markdown accessibilityLabel={turn.text}>{turn.text}</Markdown>

        {/* What it did to answer, small and under the reply. Shown because an assistant that silently tapped
            something on your screen is unsettling, and because a wrong action is easier to report when the user can
            see what happened. */}
        {turn.actions.length > 0 && (
          <Text className="mt-1 text-xs text-text-muted">{turn.actions.join(' · ')}</Text>
        )}
      </View>
    </View>
  );
};

/**
 * Before anything has been asked.
 *
 * The screen-context warning lives here rather than as an error, because it is not a failure of this exchange — it
 * is a setting the user can change, and saying so is the difference between "Orion cannot read screens" and "Orion
 * has not been allowed to".
 */
const Empty = ({
  hasScreenContext,
  listening,
}: {
  readonly hasScreenContext: boolean;
  readonly listening: boolean;
}) => (
  <View className="py-6">
    <Text className="text-sm text-text-secondary">
      {listening ? 'Listening…' : 'Ask about this screen, or ask me to do something.'}
    </Text>

    {!hasScreenContext && (
      <Text className="mt-2 text-xs text-text-muted">
        Android is not sharing this screen with me. Turn on “Use screen context” in your assistant
        settings and I will be able to see it.
      </Text>
    )}
  </View>
);

/**
 * The input row.
 *
 * Both a microphone and a text field, deliberately. Voice is the point of the panel, but a voice-only assistant is
 * unusable in a quiet room, on a bus, or by anyone the recogniser mishears — and this app already asks a lot of its
 * users' trust without also demanding they speak.
 */
const Composer = ({
  draft,
  onChange,
  onSend,
  busy,
  mic,
}: {
  readonly draft: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly busy: boolean;
  readonly mic: ReturnType<typeof useAssistMic>;
}) => {
  const { theme } = useTheme();
  const canSend = draft.trim() !== '' && !busy;

  return (
    <View className="flex-row items-center gap-2 border-t border-border px-4 pt-3">
      {mic.available && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mic.listening ? 'Stop listening' : 'Speak'}
          accessibilityState={{ selected: mic.listening }}
          onPress={mic.listening ? mic.stop : mic.start}
          className={`h-10 w-10 items-center justify-center rounded-full ${
            mic.listening ? 'bg-danger' : 'bg-surface-muted'
          }`}
          // Scaled by the microphone level while listening, so it is obvious the phone is hearing something. A
          // static button gives no clue whether the mic is working, which is the commonest voice complaint.
          style={mic.listening ? { transform: [{ scale: 1 + mic.level * 0.12 }] } : undefined}
        >
          <MicGlyph active={mic.listening} />
        </Pressable>
      )}

      <TextInput
        value={draft}
        onChangeText={onChange}
        onSubmitEditing={onSend}
        editable={!busy}
        placeholder={mic.listening ? 'Listening…' : 'Ask Orion'}
        placeholderTextColor={theme.colors.textMuted}
        returnKeyType="send"
        className="flex-1 rounded-full border border-border bg-surface-muted px-4 py-2 text-sm text-text-primary"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={onSend}
        className={`h-10 w-10 items-center justify-center rounded-full ${
          canSend ? 'bg-primary' : 'bg-surface-muted'
        }`}
      >
        <SendIcon size={16} color={canSend ? theme.colors.textOnPrimary : theme.colors.textMuted} />
      </Pressable>
    </View>
  );
};

/**
 * A microphone, drawn rather than iconed.
 *
 * `Icon.ts` has no microphone and this is the only place that needs one, so it is composed from two rounded views —
 * a capsule and a stand. Deliberately not a glyph character: a font-dependent glyph in a window that must appear
 * instantly is how a blank square ends up in a screenshot.
 */
const MicGlyph = ({ active }: { readonly active: boolean }) => (
  <View className="items-center">
    <View
      className={`h-3.5 w-2.5 rounded-full ${active ? 'bg-text-on-primary' : 'bg-text-secondary'}`}
    />
    <View
      className={`mt-0.5 h-1 w-3 rounded-sm ${active ? 'bg-text-on-primary' : 'bg-text-secondary'}`}
    />
  </View>
);

/**
 * A speech failure in the user's words.
 *
 * Each case gets a different sentence because each has a different fix, and "speech failed" tells someone standing
 * there holding their phone nothing they can act on.
 */
const micErrorText = (error: string): string => {
  switch (error) {
    case 'no_speech':
      return 'I did not catch that. Try again.';
    case 'microphone_denied':
      return 'I need permission to use the microphone. You can type instead.';
    case 'network':
      return 'Speech needs a connection right now. You can type instead.';
    case 'busy':
      return 'Something else is using the microphone.';
    default:
      return 'The microphone did not work. You can type instead.';
  }
};
