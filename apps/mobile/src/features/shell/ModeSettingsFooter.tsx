import { Button, Card, useTheme } from '@mobile-automation/ui';
import { Text, View } from 'react-native';

import { otherMode } from '../shell/modes';
import { type AppMode } from '../shell/preferences';
import { useShellStore } from '../shell/shellStore';

/**
 * The two actions every mode's settings screen ends with.
 *
 * Extracted because they are a fixed requirement of both modes rather than a detail of either, and
 * because "switch to the other mode" needs the other mode's name — which is exactly the sort of
 * string that ends up hardcoded in two places and then wrong in one of them.
 */

export interface ModeSettingsFooterProps {
  readonly mode: AppMode;
}

export const ModeSettingsFooter = ({ mode }: ModeSettingsFooterProps) => {
  const { theme } = useTheme();

  const switchMode = useShellStore((state) => state.switchMode);
  const goToSwitcher = useShellStore((state) => state.goToSwitcher);

  const other = otherMode(mode);

  return (
    <Card title="Leave this mode" muted>
      <View style={{ gap: theme.spacing[2] }}>
        <Button
          label={`Switch to ${other.title}`}
          variant="secondary"
          full
          onPress={switchMode}
          accessibilityLabel={`Switch to ${other.title}. ${other.tagline}.`}
        />

        <Button label="Back to home" variant="ghost" full onPress={goToSwitcher} />

        <Text className="text-xs leading-4 text-text-muted">
          Switching replaces the whole interface. Anything unsaved in this mode is left as it is.
        </Text>
      </View>
    </Card>
  );
};
