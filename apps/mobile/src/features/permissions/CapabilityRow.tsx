import { Badge, Button, Card, useTheme } from '@mobile-automation/ui';
import { Text, View } from 'react-native';

import { type Capability } from './capabilities';
import { useCapability } from './useCapability';

/**
 * One capability, with its rationale and a way to grant it.
 *
 * Used by onboarding, root settings, and the just-in-time prompts, so the wording a user sees for a
 * permission is the same wherever they meet it. All copy comes from the Kotlin registry — a screen
 * that wrote its own explanation could describe a permission differently from the rationale the
 * permission model requires.
 *
 * The button wording follows the grant mechanism, which is the point of tracking it: "Allow" for a
 * runtime prompt is honest, but for a settings grant it would be a lie — nothing is allowed by
 * pressing it, the user is merely taken somewhere.
 */

export interface CapabilityRowProps {
  readonly capability: Capability;
  /** Hide the consequence line where space is tight and the list is long. */
  readonly compact?: boolean;
}

export const CapabilityRow = ({ capability, compact = false }: CapabilityRowProps) => {
  const { theme } = useTheme();

  const { granted, requesting, awaitingSettings, request } = useCapability(capability.id);

  const actionLabel = (): string => {
    if (requesting) return 'Opening…';
    if (awaitingSettings) return 'Check again';

    switch (capability.grant) {
      case 'settings_screen':
        return 'Open settings';
      case 'session_consent':
        return 'Allow while running';
      case 'install_time':
        return 'Not needed';
      case 'runtime_prompt':
        return 'Allow';
    }
  };

  return (
    <Card
      title={capability.title}
      trailing={
        <Badge
          label={granted ? 'on' : capability.tier === 'required' ? 'needed' : 'off'}
          tone={granted ? 'good' : capability.tier === 'required' ? 'warn' : 'neutral'}
        />
      }
      accessibilityLabel={`${capability.title}. ${granted ? 'Allowed.' : 'Not allowed.'} ${
        capability.explanation
      }`}
    >
      <View style={{ gap: theme.spacing[2] }}>
        <Text className="text-xs leading-4 text-text-secondary">{capability.explanation}</Text>

        {!compact && !granted && (
          <Text className="text-xs leading-4 text-text-muted">
            {capability.consequenceIfDenied}
          </Text>
        )}

        {/* A settings grant has no callback, so the user has to be told what to expect rather than
            watching a spinner that will never finish. */}
        {awaitingSettings && !granted && (
          <Text className="text-xs leading-4 text-warning">
            Allow it in the settings screen that opened, then come back here.
          </Text>
        )}

        {!granted && capability.grant !== 'install_time' && (
          <Button
            label={actionLabel()}
            size="sm"
            variant={capability.tier === 'required' ? 'primary' : 'secondary'}
            busy={requesting}
            onPress={() => {
              void request();
            }}
            accessibilityLabel={`${actionLabel()} — ${capability.title}`}
          />
        )}
      </View>
    </Card>
  );
};
