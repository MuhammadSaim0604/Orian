import { useTheme } from '@mobile-automation/ui';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MODES, type ModeDescriptor } from './modes';
import { useShellStore } from './shellStore';

/**
 * The mode switcher — the app's home.
 *
 * Not a splash screen. This is where the user returns from either mode, so it has to read as a
 * destination rather than a gate: the two modes are the content, root settings is a corner action,
 * and the last-used mode is marked so a returning user sees continuity without being routed
 * automatically.
 *
 * Choosing a mode replaces the whole interface. That is what ADR 0011 means by two modes rather
 * than two tabs, and the transition animation is how the user is told.
 */
export const ModeSwitcherScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const lastMode = useShellStore((state) => state.lastMode);
  const enterMode = useShellStore((state) => state.enterMode);
  const openRootSettings = useShellStore((state) => state.openRootSettings);

  const choose = useCallback(
    (mode: ModeDescriptor) => {
      enterMode(mode.id);
    },
    [enterMode],
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[5],
          flexGrow: 1,
          gap: theme.spacing[5],
        }}
      >
        <View className="flex-row items-start justify-between">
          <View accessibilityRole="header" className="flex-1 pr-3">
            <Text className="text-3xl font-bold text-text-primary">Mobile Automation</Text>
            <Text className="mt-1 text-sm text-text-secondary">Pick how you want to work.</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={openRootSettings}
            className="rounded-md border border-border px-3 py-2"
          >
            <Text className="text-xs font-medium text-text-secondary">Settings</Text>
          </Pressable>
        </View>

        <View className="flex-1 justify-center" style={{ gap: theme.spacing[4] }}>
          {MODES.map((mode) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              isLastUsed={lastMode === mode.id}
              onPress={() => choose(mode)}
            />
          ))}
        </View>

        <Text className="text-center text-xs text-text-muted">
          You can switch modes at any time from either mode&apos;s settings.
        </Text>
      </ScrollView>
    </View>
  );
};

const ModeCard = ({
  mode,
  isLastUsed,
  onPress,
}: {
  readonly mode: ModeDescriptor;
  readonly isLastUsed: boolean;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${mode.title}. ${mode.tagline}. ${mode.detail}${
      isLastUsed ? ' You used this last.' : ''
    }`}
    onPress={onPress}
    className={`rounded-xl border p-5 ${
      isLastUsed ? 'border-primary bg-surface-raised' : 'border-border bg-surface'
    }`}
    style={{ gap: 8 }}
  >
    <View className="flex-row items-center justify-between">
      <Text className="text-2xl text-primary">{mode.glyph}</Text>
      {isLastUsed && <Text className="text-xs font-medium uppercase text-primary">Last used</Text>}
    </View>

    <Text className="text-xl font-bold text-text-primary">{mode.title}</Text>
    <Text className="text-sm font-medium text-text-secondary">{mode.tagline}</Text>
    <Text className="text-xs leading-4 text-text-muted">{mode.detail}</Text>
  </Pressable>
);
