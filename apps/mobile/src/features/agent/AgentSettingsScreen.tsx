import { useTheme } from '@mobile-automation/ui';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackgroundExecutionCard } from '../agent-mode/BackgroundExecutionCard';
import { AutomationStatusPanel } from '../automation/AutomationStatusPanel';
import { useProviderStore } from '../providers/providerStore';
import { ModeSettingsFooter } from '../shell/ModeSettingsFooter';

import {
  type AgentSettings,
  DEFAULT_DEADLINE_MS,
  DEFAULT_MAX_STEPS,
  MAX_MAX_STEPS,
  MIN_MAX_STEPS,
  readAgentSettings,
  writeDeadlineMs,
  writeMaxSteps,
  writeRecordTraces,
} from './agentSettings';

/**
 * Agent Mode's own settings.
 *
 * Each mode has its own settings screen and both end with the same two fixed actions — switch to the other
 * mode, and back to the switcher (issue A5). What is *not* here is the provider registry: that is a root-level
 * concern shared with Workflow Mode, so this screen points at it rather than duplicating it.
 *
 * The run bounds are exposed rather than hidden because they are the user's protection. A confused model
 * driving someone's phone is the worst failure this product can have, and "how many steps" and "for how long"
 * are the two limits a person can reason about without knowing anything about the loop.
 */

export interface AgentSettingsScreenProps {
  readonly onBack: () => void;
  readonly onOpenTools: () => void;
  readonly onOpenProviders: () => void;
}

/**
 * Selectable step ceilings.
 *
 * Discrete choices rather than a free number field: the useful range is narrow, a slider on a phone is
 * imprecise, and a text field invites someone to type 5000 and wonder why their battery died.
 */
const STEP_CHOICES = [10, 20, DEFAULT_MAX_STEPS, 80] as const;

/** Wall-clock ceilings, in minutes. A step is not a fixed cost — a wait can take thirty seconds. */
const DEADLINE_CHOICES_MINUTES = [2, 5, 10, 30] as const;

export const AgentSettingsScreen = ({
  onBack,
  onOpenTools,
  onOpenProviders,
}: AgentSettingsScreenProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<AgentSettings>(readAgentSettings);

  const providers = useProviderStore((state) => state.providers);
  const refreshProviders = useProviderStore((state) => state.refresh);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const active = providers.find((provider) => provider.isActive) ?? null;

  const setSteps = useCallback(async (maxSteps: number) => {
    setSettings((current) => ({ ...current, maxSteps }));
    await writeMaxSteps(maxSteps);
  }, []);

  const setDeadline = useCallback(async (minutes: number) => {
    const deadlineMs = minutes * 60_000;
    setSettings((current) => ({ ...current, deadlineMs }));
    await writeDeadlineMs(deadlineMs);
  }, []);

  const setRecording = useCallback(async (recordTraces: boolean) => {
    setSettings((current) => ({ ...current, recordTraces }));
    await writeRecordTraces(recordTraces);
  }, []);

  const disabledCount = settings.disabledTools.length;

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
            onPress={onBack}
            className="px-1 py-1"
          >
            <Text className="text-sm text-primary">Back</Text>
          </Pressable>

          <View accessibilityRole="header" className="flex-1">
            <Text className="text-2xl font-bold text-text-primary">Agent settings</Text>
            <Text className="text-xs text-text-secondary">Applies to Agent Mode only</Text>
          </View>
        </View>

        {/* The model in use, and a route to change it. The registry itself lives in root settings because both
            modes share it — showing it twice would invite two screens disagreeing. */}
        <Section title="Model">
          <Row
            label={active?.label ?? 'No provider configured'}
            detail={active?.model ?? 'Choose one in provider settings'}
            actionLabel="Providers"
            onPress={onOpenProviders}
          />
        </Section>

        <Section
          title="Tools"
          hint="A tool switched off is never offered to the AI, so it cannot try to use it."
        >
          <Row
            label="Manage tools"
            detail={
              disabledCount === 0
                ? 'All tools available'
                : `${disabledCount} tool${disabledCount === 1 ? '' : 's'} switched off`
            }
            actionLabel="Open"
            onPress={onOpenTools}
          />
        </Section>

        <Section
          title="Run limits"
          hint="Two independent ceilings. Whichever is reached first ends the run."
        >
          <Choices
            label="Maximum steps"
            options={STEP_CHOICES.map((steps) => ({ value: steps, label: String(steps) }))}
            selected={settings.maxSteps}
            onSelect={(value) => void setSteps(value)}
          />

          <Choices
            label="Time limit"
            options={DEADLINE_CHOICES_MINUTES.map((minutes) => ({
              value: minutes * 60_000,
              label: `${minutes} min`,
            }))}
            selected={settings.deadlineMs}
            onSelect={(value) => void setDeadline(value / 60_000)}
          />

          {(settings.maxSteps !== DEFAULT_MAX_STEPS ||
            settings.deadlineMs !== DEFAULT_DEADLINE_MS) && (
            <Text className="text-xs text-text-muted">
              Defaults are {DEFAULT_MAX_STEPS} steps and {DEFAULT_DEADLINE_MS / 60_000} minutes.
            </Text>
          )}

          {settings.maxSteps <= MIN_MAX_STEPS && (
            <Text className="text-xs text-warning">
              A very low ceiling will stop most tasks before they finish.
            </Text>
          )}

          {settings.maxSteps >= MAX_MAX_STEPS && (
            <Text className="text-xs text-warning">
              A very high ceiling means a confused run can go on for a long time.
            </Text>
          )}
        </Section>

        <Section
          title="Recording"
          hint="Recorded runs can be compiled into reusable workflows. They include screenshots, kept on this device."
        >
          <Toggle
            label="Record what the agent does"
            enabled={settings.recordTraces}
            onToggle={(enabled) => void setRecording(enabled)}
          />
        </Section>

        {/* Capability state belongs in each mode's settings rather than on a tab of its own (issue A3). A user
            whose automation is not running needs to see which grant is missing, and this is where they look. */}
        <AutomationStatusPanel />

        {/* Whether the run survived being backgrounded. The one measurement that says whether ADR 0012's
            corrected assumption holds on this device. */}
        <BackgroundExecutionCard />

        <ModeSettingsFooter mode="agent" />
      </ScrollView>
    </View>
  );
};

const Section = ({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) => {
  const { theme } = useTheme();

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <View>
        <Text className="text-base font-semibold text-text-primary">{title}</Text>
        {hint != null && <Text className="mt-0.5 text-xs text-text-muted">{hint}</Text>}
      </View>
      {children}
    </View>
  );
};

const Row = ({
  label,
  detail,
  actionLabel,
  onPress,
}: {
  readonly label: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${label}. ${detail}`}
    onPress={onPress}
    style={{ minHeight: MIN_TOUCH_TARGET }}
    className="flex-row items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
  >
    <View className="flex-1">
      <Text className="text-sm text-text-primary">{label}</Text>
      <Text numberOfLines={1} className="mt-0.5 text-xs text-text-muted">
        {detail}
      </Text>
    </View>

    <Text className="text-xs font-medium text-primary">{actionLabel}</Text>
  </Pressable>
);

const Choices = <T extends number>({
  label,
  options,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly selected: number;
  readonly onSelect: (value: T) => void;
}) => (
  <View>
    <Text className="mb-1 text-sm text-text-primary">{label}</Text>

    <View className="flex-row gap-2">
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${option.label}`}
          accessibilityState={{ selected: option.value === selected }}
          onPress={() => onSelect(option.value)}
          style={{ minHeight: MIN_TOUCH_TARGET }}
          className={`flex-1 items-center justify-center rounded-lg border ${
            option.value === selected ? 'border-primary bg-surface' : 'border-border bg-surface'
          }`}
        >
          <Text
            className={`text-xs ${
              option.value === selected ? 'font-semibold text-primary' : 'text-text-secondary'
            }`}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
);

const Toggle = ({
  label,
  enabled,
  onToggle,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
}) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityLabel={`${label}, ${enabled ? 'on' : 'off'}`}
    accessibilityState={{ checked: enabled }}
    onPress={() => onToggle(!enabled)}
    style={{ minHeight: MIN_TOUCH_TARGET }}
    className="flex-row items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
  >
    <Text className="flex-1 text-sm text-text-primary">{label}</Text>

    <View
      className={`items-center justify-center rounded-full border px-3 py-1 ${
        enabled ? 'border-primary bg-primary' : 'border-border bg-surface-muted'
      }`}
    >
      <Text
        className={`text-xs font-semibold ${enabled ? 'text-text-on-primary' : 'text-text-muted'}`}
      >
        {enabled ? 'On' : 'Off'}
      </Text>
    </View>
  </Pressable>
);

const MIN_TOUCH_TARGET = 48;
