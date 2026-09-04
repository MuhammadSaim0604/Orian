import { CloseIcon, Markdown, SendIcon, StopIcon, useTheme } from '@mobile-automation/ui';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { type AssistantTurn } from './assistantController';
import { useAssistant } from './useAssistant';
import { useAssistMic } from './useAssistMic';

/**
 * The Orion Assist panel.
 *
 * Shown in the voice-interaction session's own window, over whatever app the user was looking at. Three things
 * shape the layout, and the first two were device-testing defects:
 *
 * - **The session's window is not inset.** Its content runs under the navigation bar, so the bottom padding comes
 *   from a native inset read off *this* window. `react-native-safe-area-context` reads the activity's insets and
 *   reports the wrong number here, or zero, which put the send button behind the back button.
 * - **It sits over someone else's app.** It anchors to the bottom and leaves the top of the screen visible,
 *   because the thing being asked about is usually up there.
 * - **It is transient.** The system may dismiss it, so nothing here is the only copy of anything — the exchange
 *   lives in `assistantController`, a module.
 */

export interface AssistPanelProps {
  /**
   * Whether the system handed us screen context, for the first paint.
   *
   * Superseded by the native show event, which carries the same flag along with the insets. Kept as a prop because
   * the event can arrive a frame after mount and the empty state would otherwise flash the wrong message.
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
  const speaking = assistant.state === 'speaking';
  const empty = assistant.turns.length === 0 && assistant.partialSpeech === '';

  // The event's value wins once it arrives; the prop covers the frame before that.
  const screenShared = assistant.hasScreenContext && hasScreenContext;

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
      {/* Tapping away closes it, the way every assistant panel does. Transparent rather than a dimmed backdrop:
          this window already sits over another app, and dimming it would obscure the thing being asked about. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Orion"
        className="flex-1"
        onPress={assistant.dismiss}
      />

      <View
        className="rounded-t-3xl bg-surface"
        style={{
          // A shadow rather than a top border. Over an arbitrary app a 1px line reads as part of that app's
          // layout, while a shadow reads as something floating above it.
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.18,
          shadowRadius: 12,
          elevation: 16,
          maxHeight: empty ? '48%' : '76%',
          // The fix for the panel drawing under the navigation bar. Read natively from this window, not from the
          // activity's insets.
          paddingBottom: assistant.bottomInsetDp,
        }}
      >
        <GrabHandle />

        <Header
          speaking={speaking}
          busy={busy}
          listening={mic.listening}
          onClose={assistant.dismiss}
          onStop={assistant.stop}
        />

        <ScrollView
          ref={scroll}
          className="px-5"
          contentContainerStyle={{ paddingBottom: theme.spacing[3] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {empty ? (
            <Empty screenShared={screenShared} listening={mic.listening} />
          ) : (
            assistant.turns.map((turn) => <Turn key={turn.id} turn={turn} />)
          )}

          {/* What is being heard, before it becomes a turn. Shown in the transcript rather than in the input, so
              the user watches their words land where the answer will appear. */}
          {assistant.partialSpeech !== '' && (
            <View className="items-end py-2">
              <View className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary/50 px-4 py-2.5">
                <Text className="text-[15px] leading-5 text-text-on-primary">
                  {assistant.partialSpeech}
                </Text>
              </View>
            </View>
          )}

          {busy && <WorkingDots />}

          {assistant.error !== null && (
            <View className="mt-2 rounded-2xl bg-danger/10 px-4 py-3">
              <Text className="text-[13px] leading-5 text-danger">{assistant.error}</Text>
            </View>
          )}

          {mic.error !== null && (
            <View className="mt-2 rounded-2xl bg-surface-muted px-4 py-3">
              <Text className="text-[13px] leading-5 text-text-secondary">
                {micErrorText(mic.error)}
              </Text>
            </View>
          )}
        </ScrollView>

        <Composer draft={draft} onChange={setDraft} onSend={send} busy={busy} mic={mic} />
      </View>
    </View>
  );
};

/**
 * The bar at the top of a sheet.
 *
 * Not draggable — it is an affordance without a gesture, which is normally a mistake. Kept because it is the
 * clearest signal that this is a panel over another app rather than part of that app, and a sheet with no handle
 * reads as a dialog the user has to find a button to close.
 */
const GrabHandle = () => (
  <View className="items-center pb-1 pt-2.5">
    <View className="h-1 w-9 rounded-full bg-border" />
  </View>
);

/**
 * The panel's top row.
 *
 * Carries the name, because the user summoned something by a gesture and needs to see *what* opened — an
 * unlabelled panel appearing over someone's banking app is alarming. The status word beside it does the job an
 * activity spinner would, without competing with the send button's own state.
 *
 * The stop button appears only while there is something to stop, so it is never a control that does nothing.
 */
const Header = ({
  speaking,
  busy,
  listening,
  onClose,
  onStop,
}: {
  readonly speaking: boolean;
  readonly busy: boolean;
  readonly listening: boolean;
  readonly onClose: () => void;
  readonly onStop: () => void;
}) => {
  const { theme } = useTheme();
  const canStop = busy || speaking;

  const status = listening ? 'Listening' : busy ? 'Thinking' : speaking ? 'Speaking' : null;

  return (
    <View className="flex-row items-center gap-2.5 px-5 pb-3 pt-1">
      <OrionMark active={busy || speaking || listening} />

      <View className="flex-1">
        <Text className="text-[17px] font-semibold leading-5 text-text-primary">Orion</Text>

        {status !== null && (
          <Text className="text-[12px] leading-4 text-text-muted">{status}…</Text>
        )}
      </View>

      {canStop && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={speaking ? 'Stop speaking' : 'Stop'}
          hitSlop={12}
          onPress={onStop}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted"
        >
          <StopIcon size={15} color={theme.colors.danger} />
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Orion"
        hitSlop={12}
        onPress={onClose}
        className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted"
      >
        <CloseIcon size={15} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
};

/**
 * Orion's mark: a filled circle with a ring.
 *
 * Drawn rather than iconed because `Icon.ts` has nothing suitable and this window must appear instantly — a
 * font-dependent glyph is how a blank square ends up in a screenshot. The ring brightens while something is
 * happening, which is a cheaper signal than an animated spinner and does not compete with the status word.
 */
const OrionMark = ({ active }: { readonly active: boolean }) => (
  <View
    className={`h-8 w-8 items-center justify-center rounded-full ${
      active ? 'bg-primary' : 'bg-primary/15'
    }`}
  >
    <View
      className={`h-3 w-3 rounded-full border-2 ${
        active ? 'border-text-on-primary' : 'border-primary'
      }`}
    />
  </View>
);

/**
 * One turn.
 *
 * The assistant's reply is markdown, from the same renderer as the chat — models write markdown wherever they are
 * asked, and this panel is no exception. What is *spoken* is the stripped version, which is why the two are built
 * from one source but are never the same string.
 */
const Turn = ({ turn }: { readonly turn: AssistantTurn }) => {
  if (turn.role === 'user') {
    return (
      <View className="items-end py-2">
        <View className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5">
          <Text className="text-[15px] leading-5 text-text-on-primary">{turn.text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="py-2">
      {/* No bubble on the assistant's side. A reply that is read aloud is the panel's main content, and boxing it
          makes a two-sentence answer look like a quotation. */}
      <Markdown
        textClassName="text-[15px] leading-[21px] text-text-primary"
        accessibilityLabel={turn.text}
      >
        {turn.text}
      </Markdown>

      {/* What it did to answer. Shown because an assistant that silently tapped something on your screen is
          unsettling, and because a wrong action is easier to report when the user can see what happened. */}
      {turn.actions.length > 0 && (
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {turn.actions.map((action, index) => (
            <View key={index} className="rounded-full bg-surface-muted px-2.5 py-1">
              <Text className="text-[11px] leading-4 text-text-muted">{action}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

/**
 * Before anything has been asked.
 *
 * Suggestions rather than an instruction, because "ask me something" leaves the user to guess what a phone
 * assistant can actually do — and the answer is not obvious. They are plain text rather than tappable chips
 * deliberately: a tappable suggestion invites a tap, and a canned question is almost never the one the user
 * actually wants.
 *
 * The screen-context warning lives here rather than as an error, because it is not a failure of this exchange. It
 * is a setting the user can change, and saying so is the difference between "Orion cannot read screens" and "Orion
 * has not been allowed to".
 */
const Empty = ({
  screenShared,
  listening,
}: {
  readonly screenShared: boolean;
  readonly listening: boolean;
}) => (
  <View className="pb-4 pt-1">
    <Text className="text-[15px] leading-[21px] text-text-secondary">
      {listening ? 'Go ahead, I am listening.' : 'What can I do?'}
    </Text>

    {!listening && (
      <View className="mt-3 gap-1.5">
        {['What is on this screen?', 'Read this out to me', 'Open my messages'].map(
          (suggestion) => (
            <Text key={suggestion} className="text-[14px] leading-5 text-text-muted">
              “{suggestion}”
            </Text>
          ),
        )}
      </View>
    )}

    {!screenShared && (
      <View className="mt-4 rounded-2xl bg-surface-muted px-4 py-3">
        <Text className="text-[13px] leading-5 text-text-secondary">
          Android is not sharing this screen with me. Turn on “Use screen context” in your assistant
          settings and I will be able to see it.
        </Text>
      </View>
    )}
  </View>
);

/**
 * Three dots, breathing.
 *
 * Opacity on the native driver rather than a spinner or cycling text: a spinner beside the composer competes with
 * the send button, and text whose width changes nudges the layout while someone is reading it.
 */
const WorkingDots = () => {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    // A loop left running keeps work on the thread that drives the phone during a run.
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View style={{ opacity: pulse }} className="flex-row gap-1 py-3">
      {[0, 1, 2].map((dot) => (
        <View key={dot} className="h-2 w-2 rounded-full bg-text-muted" />
      ))}
    </Animated.View>
  );
};

/**
 * The input row.
 *
 * Both a microphone and a text field, deliberately. Voice is the point of the panel, but a voice-only assistant is
 * unusable in a quiet room, on a bus, or by anyone the recogniser mishears — and this app already asks a lot of its
 * users' trust without also demanding they speak.
 *
 * Targets are 44dp rather than the 40 they were: this panel sits at the bottom of the screen, where thumbs are
 * least accurate, and it is the surface most likely to be used one-handed while looking at something else.
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
    <View className="flex-row items-end gap-2 px-4 pt-2">
      {mic.available && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mic.listening ? 'Stop listening' : 'Speak'}
          accessibilityState={{ selected: mic.listening }}
          onPress={mic.listening ? mic.stop : mic.start}
          hitSlop={6}
          className={`h-11 w-11 items-center justify-center rounded-full ${
            mic.listening ? 'bg-danger' : 'bg-surface-muted'
          }`}
          // Scaled by the live input level while listening, so it is obvious the phone is hearing something. A
          // static button gives no clue whether the mic works, which is the commonest voice complaint.
          style={mic.listening ? { transform: [{ scale: 1 + mic.level * 0.14 }] } : undefined}
        >
          <MicGlyph active={mic.listening} />
        </Pressable>
      )}

      <View className="min-h-11 flex-1 justify-center rounded-3xl bg-surface-muted px-4">
        <TextInput
          value={draft}
          onChangeText={onChange}
          onSubmitEditing={onSend}
          editable={!busy}
          placeholder={mic.listening ? 'Listening…' : 'Ask Orion'}
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="send"
          multiline
          // Capped so a long question scrolls rather than growing the composer until it covers the answer.
          className="max-h-24 py-2.5 text-[15px] leading-5 text-text-primary"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={onSend}
        hitSlop={6}
        className={`h-11 w-11 items-center justify-center rounded-full ${
          canSend ? 'bg-primary' : 'bg-surface-muted'
        }`}
      >
        <SendIcon size={18} color={canSend ? theme.colors.textOnPrimary : theme.colors.textMuted} />
      </Pressable>
    </View>
  );
};

/**
 * A microphone, drawn rather than iconed.
 *
 * `Icon.ts` has no microphone and this is the only place that needs one, so it is composed from a capsule, a stand
 * and a base. Deliberately not a glyph character: a font-dependent glyph in a window that must appear instantly is
 * how a blank square ends up on screen.
 */
const MicGlyph = ({ active }: { readonly active: boolean }) => {
  const tint = active ? 'bg-text-on-primary' : 'bg-text-secondary';

  return (
    <View className="items-center">
      <View className={`h-3.5 w-2.5 rounded-full ${tint}`} />
      <View className={`mt-0.5 h-1.5 w-0.5 ${tint}`} />
      <View className={`h-0.5 w-3 rounded-sm ${tint}`} />
    </View>
  );
};

/**
 * A speech failure in the user's words.
 *
 * Each case gets a different sentence because each has a different fix, and "speech failed" tells someone standing
 * there holding their phone nothing they can act on.
 */
const micErrorText = (error: string): string => {
  switch (error) {
    case 'no_speech':
      return 'I did not catch that. Try again, or type it.';
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
