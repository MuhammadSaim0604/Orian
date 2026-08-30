import { Pressable, Text, View } from 'react-native';

import { useAutomationStatus } from './useAutomationStatus';
import { useScreenCaptureConsent } from './useScreenCaptureConsent';

/**
 * Shows what the native bridge can currently do, and lets the user grant screen capture.
 *
 * Every capability is reported honestly, **including the difference between "off" and "unknown"**. Those
 * are not the same claim: off sends the user to Settings, unknown means the app could not tell. Device
 * testing found the cost of conflating them — granting screen capture made the other two rows flip to
 * off, because a failed status read was rendered as three revoked permissions.
 *
 * The three capabilities are independent. Accessibility is a service, capture is a per-session
 * MediaProjection grant, overlay is a settings toggle. None of them implies another, and the rows must
 * never move together.
 */
export const AutomationStatusPanel = () => {
  const { status, bridgeAvailable } = useAutomationStatus();
  const consent = useScreenCaptureConsent();

  // Absent means known: only an explicit false says the read failed.
  const statusKnown = status.statusKnown !== false;

  return (
    <View className="rounded-lg border border-border bg-surface p-4">
      <Text className="text-base font-semibold text-text-primary">Device automation</Text>

      {!bridgeAvailable ? (
        <Text className="mt-2 text-sm text-text-secondary">
          The native automation module is not present in this build.
        </Text>
      ) : (
        <View className="mt-3" style={{ gap: 8 }}>
          {!statusKnown && (
            <Text className="text-xs text-warning">
              Could not read the current state. These may be out of date — reopen the app to
              refresh.
            </Text>
          )}

          <CapabilityRow
            label="Accessibility service"
            granted={status.isReady}
            known={statusKnown}
            hint="Enable in Settings → Accessibility to read the screen and tap for you."
          />
          <CapabilityRow
            label="Screen capture"
            granted={status.canCaptureScreen}
            known={statusKnown}
            hint="Granted per session, so it is requested again after a restart."
          />
          <CapabilityRow
            label="Display over other apps"
            granted={status.canDrawOverlay}
            known={statusKnown}
            hint="Needed for the agent status strip and the node toolset."
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
            <Text className="text-center text-sm font-semibold text-text-on-primary">
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

          {/* A second guard for the same failure, reached when capture stops after having worked - the
              projection can be revoked from the shade, and the OS may stop our service with it. The
              consent-failed message above covers the grant path; this covers losing it later. */}
          {consent.state === 'granted' && !status.canCaptureScreen && (
            <Text className="text-sm text-warning">
              Screen recording stopped. Check that notifications are enabled for this app, then try
              again.
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const CapabilityRow = ({
  label,
  granted,
  known,
  hint,
}: {
  readonly label: string;
  readonly granted: boolean;
  readonly known: boolean;
  readonly hint: string;
}) => {
  const state = known ? (granted ? 'Granted' : 'Off') : 'Unknown';

  return (
    <View accessible accessibilityLabel={`${label}: ${state.toLowerCase()}. ${hint}`}>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-sm text-text-primary">{label}</Text>
        <Text
          className={`text-xs font-medium uppercase ${
            !known ? 'text-warning' : granted ? 'text-success' : 'text-text-muted'
          }`}
        >
          {state}
        </Text>
      </View>

      {/* The hint explains how to grant something. Suppressed when the state is unknown, because
          telling a user to enable what may already be enabled is worse than saying nothing. */}
      {known && !granted && <Text className="mt-1 text-xs text-text-muted">{hint}</Text>}
    </View>
  );
};
