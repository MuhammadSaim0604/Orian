import { type ToolName } from '@mobile-automation/tool-sdk';
import {
  BackIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  useTheme,
} from '@mobile-automation/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { animateNextLayout } from '../agent/animateLayout';
import { type Capability, type CapabilityId } from '../permissions/capabilities';
import { useCapabilityStore } from '../permissions/capabilityStore';
import { type ToolGroup, toolGroups, toolLabel } from '../permissions/toolCapabilities';

import {
  type AgentSettings,
  readAgentSettings,
  toggleTool,
  writeDisabledTools,
} from './agentSettings';

/**
 * Tools, grouped by the permission they need.
 *
 * The previous version was twenty-four rows with a toggle and a Grant button each, and device testing was
 * clear about the problem: it answered "is this tool on" when the question a user has is "what have I allowed
 * this app to do". A permission is the unit of consent, so it is the unit of the page.
 *
 * Each card is one permission: a toggle on the right that grants it, a chevron on the **left** of that toggle
 * so the affordance sits next to the thing it opens, and inside, the tools that permission enables with a
 * checkbox each. Names only — a description per row turned the page into prose nobody reads.
 *
 * ## Two different switches, deliberately
 *
 * The card's toggle is the **permission**: turning it on asks Android, and Android's answer is the state.
 * Nothing in this app can force it, so the toggle reflects rather than commands — and when the permission is
 * already granted it simply reads as on.
 *
 * A tool's checkbox is the **user's choice**, stored locally. That distinction is why they look different: a
 * checkbox that behaved like a permission (or the reverse) would make one of them feel broken.
 *
 * A checkbox reaches the prompt. `enabledToolNames` feeds `runAgent`'s `allowedTools`, which filters the tool
 * list the model is given as well as the validator — so a disabled tool is not merely blocked, the model never
 * learns it exists. A tool advertised and then refused mid-run reads as the agent malfunctioning.
 */

export interface AgentToolsScreenProps {
  readonly onBack: () => void;
}

export const AgentToolsScreen = ({ onBack }: AgentToolsScreenProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<AgentSettings>(readAgentSettings);

  const capabilities = useCapabilityStore((state) => state.capabilities);
  const request = useCapabilityStore((state) => state.request);
  const refreshCapabilities = useCapabilityStore((state) => state.refresh);

  /**
   * Which cards are open.
   *
   * A set rather than one id, because closing a card to open another would hide something the user was
   * comparing against. Nothing is open initially: the point of the grouping is that the page fits on a screen.
   */
  const [expanded, setExpanded] = useState<readonly string[]>([]);

  useEffect(() => {
    void refreshCapabilities();
  }, [refreshCapabilities]);

  const groups = useMemo(() => toolGroups(), []);

  const toggleCard = useCallback((key: string) => {
    animateNextLayout();
    setExpanded((current) =>
      current.includes(key) ? current.filter((id) => id !== key) : [...current, key],
    );
  }, []);

  /**
   * Turns a tool on or off.
   *
   * Optimistic: a toggle that waited for a write would feel unresponsive, and the write is a
   * SharedPreferences put that does not fail in practice.
   */
  const onToggleTool = useCallback(
    async (name: ToolName, enabled: boolean) => {
      const disabled = toggleTool(settings, name, enabled);

      setSettings((current) => ({ ...current, disabledTools: disabled }));
      await writeDisabledTools(disabled);
    },
    [settings],
  );

  /**
   * Asks Android for a permission.
   *
   * Only ever *requests*. There is no way to revoke a permission from inside the app, so the toggle cannot
   * turn one off — attempting it and silently doing nothing would be worse than saying so, which is what the
   * card does when it is already granted.
   */
  const onRequestCapability = useCallback(
    async (id: CapabilityId) => {
      await request(id);
    },
    [request],
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing[4],
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[4],
          gap: theme.spacing[3],
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
              Grouped by what you have allowed. A tool switched off is never offered to the AI.
            </Text>
          </View>
        </View>

        {groups.map((group) => {
          const key = group.capability ?? 'none';

          return (
            <PermissionCard
              key={key}
              group={group}
              capability={
                group.capability === null
                  ? null
                  : (capabilities.find((candidate) => candidate.id === group.capability) ?? null)
              }
              expanded={expanded.includes(key)}
              disabledTools={settings.disabledTools}
              onToggleCard={() => toggleCard(key)}
              onRequest={() => {
                if (group.capability !== null) void onRequestCapability(group.capability);
              }}
              onToggleTool={(name, enabled) => void onToggleTool(name, enabled)}
            />
          );
        })}

        <Text className="text-xs leading-4 text-text-muted">
          Newly added tools are on by default, so an update never silently disables something.
        </Text>
      </ScrollView>
    </View>
  );
};

const PermissionCard = ({
  group,
  capability,
  expanded,
  disabledTools,
  onToggleCard,
  onRequest,
  onToggleTool,
}: {
  readonly group: ToolGroup;
  /** Null for the no-permission group, and while the snapshot is still loading. */
  readonly capability: Capability | null;
  readonly expanded: boolean;
  readonly disabledTools: readonly ToolName[];
  readonly onToggleCard: () => void;
  readonly onRequest: () => void;
  readonly onToggleTool: (name: ToolName, enabled: boolean) => void;
}) => {
  const { theme } = useTheme();

  const needsPermission = group.capability !== null;
  const granted = !needsPermission || capability?.granted === true;

  return (
    <View
      className={`overflow-hidden rounded-xl border bg-surface ${
        needsPermission && !granted ? 'border-warning' : 'border-border'
      }`}
    >
      <View className="flex-row items-center gap-2 px-3 py-2">
        {/* The chevron leads the row and sits immediately left of the toggle, as asked. It is its own target
            rather than part of the toggle: one press must not do both things. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} the ${group.title} tools`}
          accessibilityState={{ expanded }}
          onPress={onToggleCard}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: 32 }}
          className="items-center justify-center"
        >
          {expanded ? (
            <ChevronUpIcon size={16} color={theme.colors.textSecondary} />
          ) : (
            <ChevronDownIcon size={16} color={theme.colors.textSecondary} />
          )}
        </Pressable>

        {/* Tapping the text expands too — a card whose only open affordance is a 32dp chevron is a page that
            feels stuck. */}
        <Pressable onPress={onToggleCard} className="flex-1 py-1">
          <Text className="text-sm font-semibold text-text-primary">{group.title}</Text>
          <Text className="mt-0.5 text-xs leading-4 text-text-muted">{group.summary}</Text>
        </Pressable>

        {needsPermission ? (
          <PermissionToggle
            granted={granted}
            title={group.title}
            requiresSettingsVisit={capability?.requiresSettingsVisit === true}
            onRequest={onRequest}
          />
        ) : (
          // Nothing to grant, so nothing to toggle. Said in words rather than shown as a disabled switch,
          // which would read as a permission the user had turned off.
          <Text className="text-xs text-text-muted">Always</Text>
        )}
      </View>

      {expanded && (
        <View className="border-t border-border">
          {group.tools.map((name) => (
            <ToolCheckbox
              key={name}
              name={name}
              enabled={!disabledTools.includes(name)}
              blocked={!granted}
              onToggle={(enabled) => onToggleTool(name, enabled)}
            />
          ))}
        </View>
      )}
    </View>
  );
};

/**
 * The permission switch.
 *
 * A track-and-knob switch rather than RN's `Switch`, whose platform tint fights the theme, and rather than a
 * word: this is the one control on the page that is a *state of the device*, so it should look like a switch
 * and the tool checkboxes should not.
 *
 * Granted is terminal. There is no API to revoke a permission from inside the app, so pressing an on switch
 * does nothing and says so through its accessibility state rather than pretending to turn off.
 */
const PermissionToggle = ({
  granted,
  title,
  requiresSettingsVisit,
  onRequest,
}: {
  readonly granted: boolean;
  readonly title: string;
  readonly requiresSettingsVisit: boolean;
  readonly onRequest: () => void;
}) => {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={
        granted
          ? `${title} is allowed`
          : requiresSettingsVisit
            ? `Allow ${title}. Opens system settings`
            : `Allow ${title}`
      }
      accessibilityState={{ checked: granted, disabled: granted }}
      disabled={granted}
      onPress={onRequest}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      <View
        style={{
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: granted ? theme.colors.success : theme.colors.surfaceMuted,
          borderWidth: 1,
          borderColor: granted ? theme.colors.success : theme.colors.border,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: KNOB_DIAMETER,
            height: KNOB_DIAMETER,
            borderRadius: KNOB_DIAMETER / 2,
            marginLeft: granted ? TRACK_WIDTH - KNOB_DIAMETER - 3 : 3,
            backgroundColor: granted ? theme.colors.textOnPrimary : theme.colors.textMuted,
          }}
        />
      </View>
    </Pressable>
  );
};

/**
 * One tool, with a checkbox.
 *
 * A box rather than a switch, because it is a choice within a group rather than a device state — and because
 * the device pass asked for exactly this shape.
 *
 * `blocked` dims the row and says why once at the bottom of the group rather than on every line. A user can
 * still tick a tool whose permission is missing: the choice is theirs to record now and grant later, and
 * disabling the checkbox would make the page argue with them.
 */
const ToolCheckbox = ({
  name,
  enabled,
  blocked,
  onToggle,
}: {
  readonly name: ToolName;
  readonly enabled: boolean;
  readonly blocked: boolean;
  readonly onToggle: (enabled: boolean) => void;
}) => {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={toolLabel(name)}
      accessibilityHint={blocked ? 'Its permission is not allowed yet' : undefined}
      accessibilityState={{ checked: enabled }}
      onPress={() => onToggle(!enabled)}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className="flex-row items-center gap-3 px-3"
    >
      <View
        style={{
          width: CHECKBOX_SIZE,
          height: CHECKBOX_SIZE,
          borderRadius: 5,
          borderWidth: enabled ? 0 : 1.5,
          borderColor: theme.colors.border,
          backgroundColor: enabled ? theme.colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {enabled && <CheckIcon size={13} color={theme.colors.textOnPrimary} thickness={3} />}
      </View>

      <Text
        className={`flex-1 text-sm ${blocked ? 'text-text-muted' : 'text-text-primary'}`}
        numberOfLines={1}
      >
        {toolLabel(name)}
      </Text>
    </Pressable>
  );
};

const MIN_TOUCH_TARGET = 48;

/** Switch geometry. Sized so the knob clears the track by 3dp on both sides. */
const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const KNOB_DIAMETER = 20;

const CHECKBOX_SIZE = 20;
