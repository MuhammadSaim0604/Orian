import { BackIcon, Button, Card, useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WakeWordCard } from '../assistant/WakeWordCard';
import { PermissionsOverview } from '../permissions/PermissionsOverview';
import { ProviderRegistryScreen } from '../providers/ProviderRegistryScreen';
import { deleteTrace, listTraces, traceStorageUsedBytes } from '../recorder/traceStorage';
import { countWorkflows } from '../workflows/storage';

import { useShellStore } from './shellStore';

/**
 * Root settings.
 *
 * Everything shared by both modes lives here: the AI provider, the permission overview, and data
 * management. Each mode's own settings screen covers only what is specific to it, and links here
 * for the rest — otherwise the provider would be configured in two places and one of them would be
 * stale.
 *
 * Reachable from the mode switcher and from inside either mode.
 */
export const RootSettingsScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const goToSwitcher = useShellStore((state) => state.goToSwitcher);
  const resetOnboarding = useShellStore((state) => state.resetOnboarding);
  const themePreference = useShellStore((state) => state.themePreference);
  const setThemePreference = useShellStore((state) => state.setThemePreference);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[5],
          gap: theme.spacing[4],
        }}
      >
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            onPress={goToSwitcher}
            style={{ minHeight: 48, minWidth: 48 }}
            className="items-center justify-center"
          >
            <BackIcon size={20} color={theme.colors.primary} />
          </Pressable>

          <View accessibilityRole="header" className="flex-1">
            <Text className="text-2xl font-bold text-text-primary">Settings</Text>
            <Text className="text-xs text-text-secondary">Shared by both modes</Text>
          </View>
        </View>

        {/* The registry is deliberately root-level: both the device agent and the workflow builder agent use
            it, so configuring it twice would be an invitation to drift (issue A5). Several providers with one
            active, replacing the single base URL and hand-typed model of before (issue B6). */}
        <Card title="AI providers">
          <ProviderRegistryScreen />
        </Card>

        <Card title="Appearance">
          <View style={{ gap: theme.spacing[2] }}>
            <Text className="text-xs text-text-secondary">
              Follows your system setting unless you choose otherwise.
            </Text>

            <View className="flex-row gap-2">
              {([null, 'light', 'dark'] as const).map((option) => (
                <Pressable
                  key={option ?? 'system'}
                  accessibilityRole="button"
                  accessibilityLabel={
                    option === null ? 'Follow the system theme' : `Use the ${option} theme`
                  }
                  accessibilityState={{ selected: themePreference === option }}
                  onPress={() => setThemePreference(option)}
                  className={`flex-1 items-center rounded-md border px-3 py-2 ${
                    themePreference === option
                      ? 'border-primary bg-surface-raised'
                      : 'border-border'
                  }`}
                >
                  <Text className="text-xs font-medium capitalize text-text-primary">
                    {option ?? 'System'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Card>

        {/* Every capability with its live state, replacing the three-capability panel Step 1 had
            here — which could report everything as fine while a permission the app needed was
            missing. */}
        <PermissionsOverview />

        {/* Root settings rather than Agent Mode's, deliberately: Orion Assist belongs to neither
            mode. It opens over any app from a system gesture and has no session, so putting its
            toggle inside one mode's settings would imply it is part of that mode. */}
        <WakeWordCard />

        <DataManagement />

        <Card title="Start over" muted>
          <View style={{ gap: theme.spacing[2] }}>
            <Text className="text-xs leading-4 text-text-secondary">
              Runs the welcome and permission screens again. Your workflows and recordings are kept.
            </Text>
            <Button label="Run setup again" variant="secondary" full onPress={resetOnboarding} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

/**
 * Data management.
 *
 * Shows what is stored before offering to delete it. A "clear data" button with no indication of
 * what it would remove is one nobody can press with confidence.
 */
const DataManagement = () => {
  const { theme } = useTheme();

  const [workflowCount, setWorkflowCount] = useState<number | null>(null);
  const [traceCount, setTraceCount] = useState<number | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void countWorkflows().then(setWorkflowCount);
    void listTraces().then((traces) => setTraceCount(traces.length));
    void traceStorageUsedBytes().then(setBytes);
  }, []);

  useEffect(refresh, [refresh]);

  const deleteRecordings = useCallback(() => {
    Alert.alert(
      'Delete all recordings?',
      'Every recorded run and its screenshots will be removed. Workflows are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void listTraces()
              .then((traces) => Promise.all(traces.map((trace) => deleteTrace(trace.id))))
              .then(refresh);
          },
        },
      ],
    );
  }, [refresh]);

  return (
    <Card title="Data on this device">
      <View style={{ gap: theme.spacing[2] }}>
        <Row label="Workflows" value={workflowCount === null ? '…' : String(workflowCount)} />
        <Row label="Recorded runs" value={traceCount === null ? '…' : String(traceCount)} />
        <Row label="Screenshots" value={bytes === null ? '…' : formatBytes(bytes)} />

        <Text className="text-xs leading-4 text-text-muted">
          Everything stays on this phone. Screen content is only sent to the AI provider you
          configured, and only when you ask for something that needs it.
        </Text>

        <Button
          label="Delete all recordings"
          variant="danger"
          full
          onPress={deleteRecordings}
          disabled={traceCount === 0}
        />
      </View>
    </Card>
  );
};

const Row = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <View accessible accessibilityLabel={`${label}: ${value}`} className="flex-row justify-between">
    <Text className="text-sm text-text-secondary">{label}</Text>
    <Text className="text-sm font-medium text-text-primary">{value}</Text>
  </View>
);

const formatBytes = (value: number): string => {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${Math.round(value / 1_024)} KB`;
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
};
