import { useTheme } from '@mobile-automation/ui';
import { useState } from 'react';
import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentScreen } from '../agent/AgentScreen';
import { ProviderSettingsScreen } from '../agent/ProviderSettingsScreen';
import { AutomationStatusPanel } from '../automation/AutomationStatusPanel';

import { PhaseStatusCard } from './PhaseStatusCard';

/**
 * The app shell.
 *
 * A three-tab switch rather than a navigation library: the agent needs a screen now, and
 * introducing react-navigation would be a structural decision better made in Phase 6,
 * where the canvas and its editors define what the navigation actually has to support.
 */
type Tab = 'agent' | 'status' | 'settings';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'status', label: 'Status' },
  { id: 'settings', label: 'Provider' },
];

export const HomeScreen = () => {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('agent');

  return (
    <View className="flex-1 bg-background">
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />

      <View
        className="flex-row gap-2 border-b border-border px-5 pb-3"
        style={{ paddingTop: insets.top + theme.spacing[3] }}
        accessibilityRole="tablist"
      >
        {TABS.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="tab"
            accessibilityLabel={entry.label}
            accessibilityState={{ selected: tab === entry.id }}
            onPress={() => setTab(entry.id)}
            className={`rounded-md px-3 py-2 ${
              tab === entry.id ? 'bg-primary' : 'bg-surface-muted'
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                tab === entry.id ? 'text-text-on-primary' : 'text-text-secondary'
              }`}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* The agent screen manages its own scrolling, since its log must stay pinned
          while the goal field and stop button remain reachable. */}
      {tab === 'agent' ? (
        <View
          className="flex-1 px-5 pt-4"
          style={{ paddingBottom: insets.bottom + theme.spacing[4] }}
        >
          <AgentScreen />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingTop: theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[6],
            paddingHorizontal: theme.spacing[5],
            gap: theme.spacing[4],
          }}
        >
          {tab === 'settings' ? <ProviderSettingsScreen /> : <StatusTab />}
        </ScrollView>
      )}
    </View>
  );
};

/** Build status and the live view of the native bridge. Replaced in Phase 6. */
const StatusTab = () => {
  const { scheme } = useTheme();

  return (
    <>
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">Mobile Automation</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          An AI agent and a visual workflow engine sharing one Android device runtime.
        </Text>
      </View>

      <PhaseStatusCard
        title="Phases 0-3 — Foundation, tooling, Kotlin core, native bridge"
        status="done"
        detail="Monorepo and CI, the accessibility service and selector resolver, and a typed bridge joining Kotlin to TypeScript."
      />
      <PhaseStatusCard
        title="Phases 4-5 — Node SDK, schema, and workflow engine"
        status="done"
        detail="Zod workflow schema, 7 core nodes, 21 device nodes, third-party node discovery, and the DAG executor."
      />
      <PhaseStatusCard
        title="Phase 7 — AI agent engine"
        status="in-progress"
        detail="Bounded agent loop, Chat Completions client, prompt engine, and the recorder seam Phase 9 will consume."
      />
      <PhaseStatusCard
        title="Phase 6 — Workflow builder UI"
        status="pending"
        detail="Skia canvas, node editor, debugger, and workflow persistence."
      />

      <AutomationStatusPanel />

      <View className="mt-2 rounded-lg border border-border bg-surface-muted p-4">
        <Text className="text-sm font-semibold text-text-primary">Active theme</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          {scheme === 'dark' ? 'Dark' : 'Light'} — following the system setting. Every colour on
          this screen comes from the shared design tokens, not from hardcoded values.
        </Text>
      </View>
    </>
  );
};
