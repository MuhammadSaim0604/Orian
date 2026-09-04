import { Badge, Button, Card, Toggle, useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Text, View } from 'react-native';

import {
  type WakeWordFailure,
  type WakeWordState,
  disableWakeWord,
  enableWakeWord,
  openAssistPanel,
  readWakeWordState,
} from './wakeWord';

/**
 * The wake word's settings card.
 *
 * ## Why the copy is this blunt
 *
 * This feature keeps a microphone open. The honest version of that sentence has to be on the screen where it is
 * turned on, not buried in a help page — and saying "may affect battery life" would be the dishonest version.
 *
 * The alternative that costs nothing is right there in the same card: the assist gesture. Most users should use
 * that, and the card says so rather than presenting the toggle as the obvious choice.
 *
 * ## Why state is re-read on focus
 *
 * Two of the three preconditions are changed **outside this app** — the microphone in system settings, the assistant
 * role in the default-apps screen. Neither produces a callback, so the state is re-read whenever the app returns to
 * the foreground. That is the same reason the capability screen does it.
 */

export const WakeWordCard = () => {
  const { theme } = useTheme();
  const [state, setState] = useState<WakeWordState>(readWakeWordState);
  const [failure, setFailure] = useState<WakeWordFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => setState(readWakeWordState()), []);

  useEffect(() => {
    refresh();

    // Returning from a system settings screen is the only signal we get that a precondition changed.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });

    return () => subscription.remove();
  }, [refresh]);

  const toggle = (next: boolean) => {
    setFailure(null);
    setBusy(true);

    void (async () => {
      try {
        if (!next) {
          await disableWakeWord();
          refresh();
          return;
        }

        // Asked here rather than earlier, so someone reading this card is not prompted for a microphone they may
        // decide against. Same just-in-time rule as the panel's mic button.
        if (!state.hasMicrophone) {
          const permission =
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO ?? 'android.permission.RECORD_AUDIO';

          const granted = await PermissionsAndroid.request(permission, {
            title: 'Let Orion listen for its name',
            message:
              'Orion needs the microphone open to hear “Hey Orion”. It only acts when it hears the phrase.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          });

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setFailure('microphone_denied');
            return;
          }
        }

        setFailure(await enableWakeWord());
      } finally {
        setBusy(false);
        refresh();
      }
    })();
  };

  if (!state.available) {
    // An older build, or a bundle loaded before native registration. Saying nothing beats a toggle that cannot work.
    return null;
  }

  return (
    <Card
      title="“Hey Orion”"
      subtitle="Open Orion by saying its name"
      trailing={state.running ? <Badge label="Listening" tone="good" /> : undefined}
    >
      <View className="gap-3">
        <Text className="text-sm leading-5 text-text-secondary">
          This keeps the microphone open and listens for the phrase. It uses noticeably more battery
          than the alternative below, and a notification stays in your shade the whole time it is
          on.
        </Text>

        {/* The shared `Toggle` is a bare switch with no label of its own, so the row is composed here. A busy
            toggle is not disabled — it is simply ignored — because a switch that greys out mid-tap looks broken. */}
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 pr-3 text-sm text-text-primary">
            {state.running ? 'Listening for “Hey Orion”' : 'Listen for “Hey Orion”'}
          </Text>

          <Toggle
            value={state.running}
            onChange={(next) => {
              if (!busy) toggle(next);
            }}
            accessibilityLabel="Listen for the Hey Orion wake word"
          />
        </View>

        {failure !== null && <Failure failure={failure} />}

        {/* The free option, stated as the recommendation rather than as a footnote. */}
        <View className="rounded-lg bg-surface-muted p-3" style={{ marginTop: theme.spacing[1] }}>
          <Text className="text-xs leading-5 text-text-secondary">
            You can already open Orion with no battery cost by long-pressing the home button, or
            with your phone’s assistant gesture. That needs Orion set as your digital assistant.
          </Text>

          {!state.isDefaultAssistant && (
            <View className="mt-2">
              <Button
                label="Set Orion as the assistant"
                size="sm"
                variant="secondary"
                accessibilityLabel="Open assistant settings"
                onPress={() => {
                  void Linking.sendIntent('android.settings.VOICE_INPUT_SETTINGS').catch(() =>
                    Linking.openSettings(),
                  );
                }}
              />
            </View>
          )}
        </View>

        <Button
          label="Open Orion now"
          size="sm"
          variant="ghost"
          accessibilityLabel="Open the Orion panel"
          onPress={() => {
            void openAssistPanel();
          }}
        />
      </View>
    </Card>
  );
};

/**
 * Why enabling failed.
 *
 * A sentence each, because each has a different fix. "Could not enable" would leave the user with a toggle that
 * refuses and no idea why — and the commonest cause is a setting in a completely different app.
 */
const Failure = ({ failure }: { readonly failure: WakeWordFailure }) => {
  const text =
    failure === 'microphone_denied'
      ? 'Orion needs the microphone to hear you. You can still open it with the assistant gesture.'
      : failure === 'not_default_assistant'
        ? 'Set Orion as your digital assistant first — the wake word has nothing to open otherwise.'
        : 'The wake word could not start on this device.';

  return (
    <View className="rounded-lg bg-danger/10 px-3 py-2">
      <Text className="text-xs leading-5 text-danger">{text}</Text>
    </View>
  );
};
