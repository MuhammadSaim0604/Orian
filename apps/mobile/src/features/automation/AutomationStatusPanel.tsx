import { Pressable, Text, View } from 'react-native';

import { useAutomationStatus } from './useAutomationStatus';
import { useScreenCaptureConsent } from './useScreenCaptureConsent';

/**
 * Shows what the native bridge can currently do, and lets the user grant screen
 * capture.
 *
 * The Phase 3 proof that the bridge is wired end to end: the status comes straight
 * from Kotlin, and the capture button exercises the consent round trip the Phase 2
 * pipeline was waiting for.
 *
 * Every capability is reported honestly, including the reason it is unavailable.
 * A user who does not know the accessibility service is off cannot turn it on.
 */
export const AutomationStatusPanel = () => {
  const { status, bridgeAvailable } = useAutomationStatus();
  const consent = useScreenCaptureConsent();

  return (
    <View className="rounded-lg border border-border bg-surface p-4">
      <Text className="text-base font-semibold text-text-primary">Device automation</Text>

      {!bridgeAvailable ? (
        <Text className="mt-2 text-sm text-text-secondary">
          The native automation module is not present in this build.
        </Text>
      ) : (
        <View className="mt-3" style={{ gap: 8 }}>
          <CapabilityRow
            label="Accessibility service"
            granted={status.isReady}
            hint="Enable in Settings → Accessibility to read the screen and tap for you."
          />
          <CapabilityRow
            label="Screen capture"
            granted={status.canCaptureScreen}
            hint="Granted per session, so it is requested again after a restart."
          />
          <CapabilityRow
            label="Display over other apps"
            granted={status.canDrawOverlay}
            hint="Needed for the Configure-with-AI floating toolset."
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              status.canCaptureScreen ? 'Stop screen capture' : 'Allow screen capture'
            }
            accessibilityState={{ busy: consent.state === 'requesting' }}
            onPress={() => {
              // Fire-and-forget is deliberate here: both hooks own their own state
              // and surface failures, so there is nothing for the caller to await.
              void (status.canCaptureScreen ? consent.release() : consent.request());
            }}
            className="mt-2 rounded-md bg-primary px-4 py-3"
          >
            <Text className="text-center text-sm font-semibold text-text-inverse">
              {consent.state === 'requesting'
                ? 'Asking…'
                : status.canCaptureScreen
                  ? 'Stop screen capture'
                  : 'Allow screen capture'}
            </Text>
          </Pressable>

          {consent.state === 'declined' && (
            <Text className="text-sm text-text-secondary">
              Declined. The AI will work from screen structure only, which can fail on image-heavy
              screens.
            </Text>
          )}

          {consent.state === 'failed' && consent.errorMessage != null && (
            <Text className="text-sm text-danger">{consent.errorMessage}</Text>
          )}
        </View>
      )}
    </View>
  );
};

const CapabilityRow = ({
  label,
  granted,
  hint,
}: {
  readonly label: string;
  readonly granted: boolean;
  readonly hint: string;
}) => (
  <View accessible accessibilityLabel={`${label}: ${granted ? 'granted' : 'not granted'}. ${hint}`}>
    <View className="flex-row items-center justify-between">
      <Text className="flex-1 pr-3 text-sm text-text-primary">{label}</Text>
      <Text
        className={`text-xs font-medium uppercase ${granted ? 'text-success' : 'text-text-muted'}`}
      >
        {granted ? 'Granted' : 'Off'}
      </Text>
    </View>
    {!granted && <Text className="mt-1 text-xs text-text-muted">{hint}</Text>}
  </View>
);
