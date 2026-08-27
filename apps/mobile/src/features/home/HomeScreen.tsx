import { useTheme } from '@mobile-automation/ui';
import { ScrollView, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutomationStatusPanel } from '../automation/AutomationStatusPanel';

import { PhaseStatusCard } from './PhaseStatusCard';

/**
 * Phase 1 placeholder screen, extended in Phase 3 with a live view of the native
 * bridge. It is replaced by the real workflow list in Phase 6.
 */
export const HomeScreen = () => {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[6],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[5],
          gap: theme.spacing[4],
        }}
      >
        <View accessibilityRole="header">
          <Text className="text-3xl font-bold text-text-primary">Mobile Automation</Text>
          <Text className="mt-2 text-base text-text-secondary">
            An AI agent and a visual workflow engine sharing one Android device runtime.
          </Text>
        </View>

        <PhaseStatusCard
          title="Phase 0 — Foundation"
          status="done"
          detail="Decisions recorded as ADRs, conventions, permission model, and pinned versions."
        />
        <PhaseStatusCard
          title="Phase 1 — Monorepo & tooling"
          status="done"
          detail="pnpm workspace, Turborepo pipelines, 14 packages, this themed app shell, and CI."
        />
        <PhaseStatusCard
          title="Phase 2 — Android automation core"
          status="done"
          detail="Kotlin accessibility service, selector resolver, gesture engine, screen capture, overlays, and the device tool layer."
        />
        <PhaseStatusCard
          title="Phase 3 — Native bridge"
          status="in-progress"
          detail="Turbo Module exposing the automation runtime to TypeScript, with typed errors and an event channel."
        />

        <AutomationStatusPanel />

        <View className="mt-2 rounded-lg border border-border bg-surface-muted p-4">
          <Text className="text-sm font-semibold text-text-primary">Active theme</Text>
          <Text className="mt-1 text-sm text-text-secondary">
            {scheme === 'dark' ? 'Dark' : 'Light'} — following the system setting. Every colour on
            this screen comes from the shared design tokens, not from hardcoded values.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};
