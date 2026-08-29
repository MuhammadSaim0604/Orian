import { Button, Card, useTheme } from '@mobile-automation/ui';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CapabilityRow } from '../permissions/CapabilityRow';
import { useCapabilityStore } from '../permissions/capabilityStore';
import {
  useMissingRequiredCapabilities,
  useOptionalCapabilities,
  useRequiredCapabilities,
  useRequiredCapabilitiesGranted,
} from '../permissions/useCapabilityViews';

/**
 * The permission stage of onboarding.
 *
 * Driven entirely by the capability registry rather than a screen per permission. That is deliberate:
 * a hand-written screen per capability is how one gets forgotten, and it lets two people describe the
 * same permission differently.
 *
 * **This is a real gate.** Continue stays disabled until every required capability is granted, and it
 * says what is still missing rather than leaving the user to work it out. Optional capabilities are
 * offered here and skippable, because making someone grant contacts to reach the app they downloaded
 * is exactly what the permission model exists to prevent.
 *
 * Four of the five required capabilities can only be granted in system settings, so this screen is
 * built around a round trip: the user leaves, allows, comes back, and the state updates from the
 * resume listener in `useCapabilityWatcher`.
 */

export interface PermissionSetupScreenProps {
  readonly onContinue: () => void;
  readonly onBack: () => void;
}

export const PermissionSetupScreen = ({ onContinue, onBack }: PermissionSetupScreenProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const required = useRequiredCapabilities();
  const optional = useOptionalCapabilities();
  const missing = useMissingRequiredCapabilities();
  const allRequiredGranted = useRequiredCapabilitiesGranted();
  const loading = useCapabilityStore((state) => state.loading);
  const error = useCapabilityStore((state) => state.error);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[5],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[5],
          gap: theme.spacing[4],
        }}
      >
        <View accessibilityRole="header" style={{ gap: 8 }}>
          <Text className="text-3xl font-bold text-text-primary">Permissions</Text>
          <Text className="text-sm leading-5 text-text-secondary">
            These are the powerful ones. Each explains itself before it is requested, and you can
            turn any of them off later from your phone&apos;s settings.
          </Text>
        </View>

        {error != null && (
          <Card muted>
            <Text className="text-xs text-danger">{error}</Text>
          </Card>
        )}

        <View style={{ gap: theme.spacing[2] }}>
          <Text className="px-1 text-base font-semibold text-text-primary">
            Needed to work at all
          </Text>

          {loading && required.length === 0 ? (
            <Text className="px-1 text-xs text-text-muted">Checking what is already allowed…</Text>
          ) : (
            required.map((capability) => (
              <CapabilityRow key={capability.id} capability={capability} />
            ))
          )}
        </View>

        <View style={{ gap: theme.spacing[2] }}>
          <Text className="px-1 text-base font-semibold text-text-primary">
            Allow now, or when something needs them
          </Text>
          <Text className="px-1 text-xs leading-4 text-text-secondary">
            You can skip all of these. Each one is requested again when a step or a tool actually
            needs it.
          </Text>

          {optional.map((capability) => (
            <CapabilityRow key={capability.id} capability={capability} compact />
          ))}
        </View>

        <View style={{ gap: theme.spacing[2] }}>
          {/* Named rather than merely disabled: a greyed-out button with no explanation is the most
              frustrating thing an onboarding flow can do. */}
          {!allRequiredGranted && missing.length > 0 && (
            <Card muted>
              <Text className="text-xs leading-4 text-text-secondary">
                Still to allow: {missing.map((capability) => capability.title).join(', ')}.
              </Text>
            </Card>
          )}

          <Button
            label="Continue"
            full
            disabled={!allRequiredGranted}
            onPress={onContinue}
            accessibilityLabel={
              allRequiredGranted
                ? 'Continue to choose a mode'
                : 'Continue — allow the required permissions first'
            }
          />

          <Button label="Back" variant="ghost" full onPress={onBack} />
        </View>
      </ScrollView>
    </View>
  );
};
