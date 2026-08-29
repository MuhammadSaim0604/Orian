import { Button, Card, useTheme } from '@mobile-automation/ui';
import { Text, View } from 'react-native';

import { CapabilityRow } from './CapabilityRow';
import { useCapabilityStore } from './capabilityStore';
import {
  useOptionalCapabilities,
  useRequiredCapabilities,
  useRequiredCapabilitiesGranted,
} from './useCapabilityViews';

/**
 * Every capability, its live state, and a route to change it.
 *
 * Lives in root settings because it is the answer to "why is my automation not running" — and that
 * question has one answer often enough that it deserves a dedicated place rather than being spread
 * across whichever screen happened to need a permission.
 *
 * Replaces the automation status panel that Step 1 embedded here. That panel reported three
 * capabilities out of nine, which meant the app could tell a user everything was fine while a
 * permission it needed was missing.
 */
export const PermissionsOverview = () => {
  const { theme } = useTheme();

  const required = useRequiredCapabilities();
  const optional = useOptionalCapabilities();
  const allRequiredGranted = useRequiredCapabilitiesGranted();
  const error = useCapabilityStore((state) => state.error);
  const refresh = useCapabilityStore((state) => state.refresh);

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-base font-semibold text-text-primary">Permissions</Text>

        <Button
          label="Re-check"
          variant="ghost"
          size="sm"
          onPress={() => {
            void refresh();
          }}
          accessibilityLabel="Check permissions again"
        />
      </View>

      {error != null && (
        <Card muted>
          <Text className="text-xs text-danger">{error}</Text>
        </Card>
      )}

      {!allRequiredGranted && (
        <Card muted>
          <Text className="text-xs leading-4 text-warning">
            Automation will not run until every permission in the first group is allowed.
          </Text>
        </Card>
      )}

      <View style={{ gap: theme.spacing[2] }}>
        <Text className="px-1 text-xs font-medium uppercase text-text-muted">Required</Text>
        {required.map((capability) => (
          <CapabilityRow key={capability.id} capability={capability} compact />
        ))}
      </View>

      <View style={{ gap: theme.spacing[2] }}>
        <Text className="px-1 text-xs font-medium uppercase text-text-muted">Optional</Text>
        {optional.map((capability) => (
          <CapabilityRow key={capability.id} capability={capability} compact />
        ))}
      </View>

      <Text className="px-1 text-xs leading-4 text-text-muted">
        Turning a permission off in your phone&apos;s settings takes effect immediately. Anything
        that needs it will explain what is missing rather than failing quietly.
      </Text>
    </View>
  );
};
