import { Card, useTheme } from '@mobile-automation/ui';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentScreen } from '../agent/AgentScreen';
import { AutomationStatusPanel } from '../automation/AutomationStatusPanel';
import { ModeSettingsFooter } from '../shell/ModeSettingsFooter';
import { useShellStore } from '../shell/shellStore';

import { BackgroundExecutionCard } from './BackgroundExecutionCard';

/**
 * Agent Mode.
 *
 * Its own navigation, deliberately separate from Workflow Mode's (ADR 0011). The temptation is one
 * shared stack with a `mode` prop, which rebuilds the tab bar with extra steps and makes the two
 * modes peers again.
 *
 * Today it holds the existing agent screen and a settings screen. **Step 4** builds what the mode is
 * actually meant to be: chat sessions with per-session memory, the provider registry, tools
 * management, and MCP clients. The routes for those already exist in `shellStore`, unrendered, so
 * that step adds screens rather than reshaping navigation.
 */
export const AgentModeShell = () => {
  const route = useShellStore((state) => state.agentRoute);

  switch (route.kind) {
    case 'settings':
      return <AgentSettingsScreen />;

    // Sessions and tools are Step 4's. Until then they fall through to the chat, rather than
    // rendering an empty screen the user cannot get out of.
    case 'chat':
    case 'sessions':
    case 'tools':
      return <AgentHomeScreen />;
  }
};

const AgentHomeScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const navigate = useShellStore((state) => state.navigateAgent);
  const enterMode = useShellStore((state) => state.enterMode);
  const navigateWorkflow = useShellStore((state) => state.navigateWorkflow);

  return (
    <View className="flex-1 bg-background">
      <ModeHeader
        title="Agent"
        subtitle="Describe a task and it will carry it out"
        onOpenSettings={() => navigate({ kind: 'settings' })}
      />

      {/* The agent screen owns its own scrolling, because its event log must stay pinned while
          the goal field and stop button remain reachable. */}
      <View
        className="flex-1 px-5 pt-3"
        style={{ paddingBottom: insets.bottom + theme.spacing[4] }}
      >
        <AgentScreen
          onBuildWorkflow={(trace) => {
            // Turning a run into a workflow is Workflow Mode's job, so this crosses modes rather
            // than opening a builder inside Agent Mode. The trace is already persisted, so only
            // its id needs to travel - which is also why the route carries an id rather than the
            // trace itself.
            navigateWorkflow({ kind: 'reviewTrace', traceId: trace.id });
            enterMode('workflow');
          }}
        />
      </View>
    </View>
  );
};

const AgentSettingsScreen = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const navigate = useShellStore((state) => state.navigateAgent);

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
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the agent"
            onPress={() => navigate({ kind: 'chat' })}
            className="px-1 py-1"
          >
            <Text className="text-sm text-primary">Back</Text>
          </Pressable>

          <View accessibilityRole="header" className="flex-1">
            <Text className="text-2xl font-bold text-text-primary">Agent settings</Text>
            <Text className="text-xs text-text-secondary">Applies to Agent Mode only</Text>
          </View>
        </View>

        {/* Capability state belongs in each mode's settings rather than on a tab of its own
            (issue A3). A user whose automation is not running needs to see which grant is
            missing, and this is where they would look for it. */}
        <AutomationStatusPanel />

        {/* Whether the run survived being backgrounded. The one measurement that says whether
            ADR 0012's assumption holds on this device (Step 3). */}
        <BackgroundExecutionCard />

        <Card title="Coming in Step 4" muted>
          <Text className="text-xs leading-4 text-text-secondary">
            Chat sessions with their own memory, several AI providers with model discovery, a tools
            page with per-tool permissions, and MCP client connections.
          </Text>
        </Card>

        <Card title="AI provider" muted>
          <Text className="text-xs leading-4 text-text-secondary">
            The provider is configured once in the app&apos;s main settings and shared with Workflow
            Mode, so both use the same credentials.
          </Text>
        </Card>

        <ModeSettingsFooter mode="agent" />
      </ScrollView>
    </View>
  );
};

/**
 * The header every mode screen starts with.
 *
 * Local to this file rather than shared with Workflow Mode: the two modes are supposed to be able to
 * diverge, and a shared header component is the first thing that quietly re-couples them.
 */
const ModeHeader = ({
  title,
  subtitle,
  onOpenSettings,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly onOpenSettings: () => void;
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center gap-3 border-b border-border px-5 pb-3"
      style={{ paddingTop: insets.top + theme.spacing[3] }}
    >
      <View accessibilityRole="header" className="flex-1">
        <Text className="text-xl font-bold text-text-primary">{title}</Text>
        <Text className="text-xs text-text-secondary">{subtitle}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agent settings"
        onPress={onOpenSettings}
        className="rounded-md border border-border px-3 py-2"
      >
        <Text className="text-xs font-medium text-text-secondary">Settings</Text>
      </Pressable>
    </View>
  );
};
