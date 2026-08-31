import { TOOL_DEFINITIONS, type ToolName } from '@mobile-automation/tool-sdk';
import { BackIcon, useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type CapabilityId } from '../permissions/capabilities';
import { useCapabilityStore } from '../permissions/capabilityStore';

import {
  type AgentSettings,
  TOOL_GROUPS,
  readAgentSettings,
  toggleTool,
  toolsWithImpact,
  writeDisabledTools,
} from './agentSettings';

/**
 * Tools management.
 *
 * The user could not previously see which tools existed, disable one, or grant a tool's permission from where
 * the tool is named (issue B4). All three are here, and the third matters more than it sounds: a contacts tool
 * that fails because contacts were never granted looks like a broken tool, not a missing permission.
 *
 * Grouped by **impact** rather than alphabetically, because that is the question someone switching things off
 * actually has — does this read, does it touch my screen, does it change something. Twenty-four tools in one
 * flat list is a wall.
 *
 * A toggle here reaches the prompt. `enabledToolNames` feeds `runAgent`'s `allowedTools`, which filters the
 * tool list the model is given as well as the validator — so a disabled tool is not merely blocked, the model
 * never learns it exists. A tool advertised and then refused mid-run reads as the agent malfunctioning.
 */

export interface AgentToolsScreenProps {
  readonly onBack: () => void;
}

/**
 * Which capability a tool needs, where one is not implied by the accessibility service.
 *
 * Only the tools whose permission is separately grantable. Tapping and reading the screen need the
 * accessibility service, which is a required capability granted during onboarding — listing it against twenty
 * tools would be noise.
 *
 * Kept here rather than on the tool definitions because `tool-sdk` is device-agnostic and publishable;
 * teaching it about Android permission ids would pollute it. Same reasoning as
 * `features/permissions/nodeCapabilities.ts`.
 */
const TOOL_CAPABILITIES: Partial<Record<ToolName, CapabilityId>> = {
  getContacts: 'contacts',
  findContacts: 'contacts',
  takeScreenshot: 'screen_capture',
  sendNotification: 'notifications',
  createAlarm: 'exact_alarm',
};

export const AgentToolsScreen = ({ onBack }: AgentToolsScreenProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<AgentSettings>(readAgentSettings);

  const capabilities = useCapabilityStore((state) => state.capabilities);
  const request = useCapabilityStore((state) => state.request);
  const refreshCapabilities = useCapabilityStore((state) => state.refresh);

  useEffect(() => {
    void refreshCapabilities();
  }, [refreshCapabilities]);

  /**
   * Asks for the permission a tool needs, if it needs one and does not have it.
   *
   * Declared before the toggle that uses it, because it is reachable two ways: switching a tool on, and tapping
   * Grant on a row that is already on but unusable. Device testing found the second case — every tool read "On"
   * from a fresh install regardless of its permission, so the only way to trigger a request was to switch a
   * tool off and on again, which nobody would think to do.
   */
  const requestFor = useCallback(
    async (name: ToolName) => {
      const capabilityId = TOOL_CAPABILITIES[name];
      if (capabilityId === undefined) return;

      const capability = capabilities.find((candidate) => candidate.id === capabilityId);
      if (capability !== undefined && !capability.granted) await request(capabilityId);
    },
    [capabilities, request],
  );

  const onToggle = useCallback(
    async (name: ToolName, enabled: boolean) => {
      const disabled = toggleTool(settings, name, enabled);

      // Optimistic: a toggle that waited for a write would feel unresponsive, and the write is a
      // SharedPreferences put.
      setSettings((current) => ({ ...current, disabledTools: disabled }));
      await writeDisabledTools(disabled);

      // Enabling a tool that needs a permission requests it here and now. That is the whole point of the page
      // per issue E4: the moment a user says they want a capability is the moment to ask for it, not the
      // moment the agent tries to use it mid-run.
      if (!enabled) return;

      await requestFor(name);
    },
    [settings, requestFor],
  );

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
            accessibilityLabel="Back to settings"
            onPress={onBack}
            style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
            className="items-center justify-center"
          >
            <BackIcon size={20} color={theme.colors.primary} />
          </Pressable>

          <View accessibilityRole="header" className="flex-1">
            <Text className="text-2xl font-bold text-text-primary">Tools</Text>
            <Text className="text-xs text-text-secondary">
              What the agent is allowed to do. A tool switched off is never offered to the AI.
            </Text>
          </View>
        </View>

        {TOOL_GROUPS.map((group) => {
          const names = toolsWithImpact(group.impact);
          if (names.length === 0) return null;

          return (
            <View key={group.impact} style={{ gap: theme.spacing[2] }}>
              <View>
                <Text className="text-sm font-semibold text-text-primary">{group.label}</Text>
                <Text className="mt-0.5 text-xs text-text-muted">{group.explanation}</Text>
              </View>

              {names.map((name) => {
                const capabilityId = TOOL_CAPABILITIES[name];
                const capability =
                  capabilityId === undefined
                    ? undefined
                    : capabilities.find((candidate) => candidate.id === capabilityId);

                return (
                  <ToolRow
                    key={name}
                    name={name}
                    enabled={!settings.disabledTools.includes(name)}
                    permissionMissing={capability !== undefined && !capability.granted}
                    permissionLabel={capability?.title ?? null}
                    onToggle={(enabled) => void onToggle(name, enabled)}
                    onGrant={() => void requestFor(name)}
                  />
                );
              })}
            </View>
          );
        })}

        <Text className="text-xs text-text-muted">
          Newly added tools are on by default, so an update never silently disables something.
        </Text>
      </ScrollView>
    </View>
  );
};

const ToolRow = ({
  name,
  enabled,
  permissionMissing,
  permissionLabel,
  onToggle,
  onGrant,
}: {
  readonly name: ToolName;
  readonly enabled: boolean;
  readonly permissionMissing: boolean;
  readonly permissionLabel: string | null;
  readonly onToggle: (enabled: boolean) => void;
  readonly onGrant: () => void;
}) => {
  const definition = TOOL_DEFINITIONS[name];

  /**
   * On, but unusable.
   *
   * The state device testing exposed. Every tool reads On from a fresh install — which is right, because the
   * stored set is the *disabled* one so a new tool is never silently missing — but a tool whose permission has
   * not been granted cannot actually run. The row said "On" and nothing else, and the only way to trigger a
   * request was to switch it off and on again.
   *
   * So the row states the truth in three parts: the toggle reflects the user's choice, the label says whether
   * it can act on that choice, and Grant is offered from the row itself.
   */
  const blocked = enabled && permissionMissing;

  return (
    <View
      className={`rounded-lg border bg-surface p-3 ${blocked ? 'border-warning' : 'border-border'}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-sm font-medium text-text-primary">{name}</Text>

          {/* The model's own description, shown to the user unchanged. It is written to explain when to use a
              tool, which is also what someone deciding whether to allow it wants to know — and any divergence
              between the two would mean one of them is wrong. */}
          <Text className="mt-1 text-xs leading-4 text-text-secondary">
            {definition.description}
          </Text>

          {blocked && (
            <View className="mt-2 flex-row items-center gap-2">
              <Text className="flex-1 text-xs leading-4 text-warning">
                On, but {permissionLabel ?? 'its permission'} is not granted yet — the agent cannot
                use it.
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Grant the permission ${name} needs`}
                onPress={onGrant}
                style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
                className="rounded-md border border-warning px-3"
              >
                <Text className="text-xs font-semibold text-warning">Grant</Text>
              </Pressable>
            </View>
          )}

          {/* Off and unpermitted: worth mentioning, but not as a problem — nothing is broken until they want it. */}
          {!enabled && permissionMissing && (
            <Text className="mt-1 text-xs text-text-muted">
              Needs {permissionLabel ?? 'a permission'} — switching this on will ask for it.
            </Text>
          )}
        </View>

        {/* A button rather than a Switch: RN's Switch takes a platform tint that fights the theme, and the
            state is stated in words here, which a screen reader can read without inferring from a track. */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={`${name}, ${enabled ? 'on' : 'off'}${
            blocked ? ', permission not granted' : ''
          }`}
          accessibilityState={{ checked: enabled }}
          onPress={() => onToggle(!enabled)}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: 64 }}
          className={`items-center justify-center rounded-full border px-3 ${
            blocked
              ? 'border-warning bg-surface-muted'
              : enabled
                ? 'border-primary bg-primary'
                : 'border-border bg-surface-muted'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              blocked ? 'text-warning' : enabled ? 'text-text-on-primary' : 'text-text-muted'
            }`}
          >
            {enabled ? 'On' : 'Off'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const MIN_TOUCH_TARGET = 48;
