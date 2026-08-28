import { Button, useTheme } from '@mobile-automation/ui';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentScreen } from '../agent/AgentScreen';
import { ProviderSettingsScreen } from '../agent/ProviderSettingsScreen';
import { CanvasScreen } from '../canvas/CanvasScreen';
import { useCanvasStore } from '../canvas/canvasStore';
import { StatusScreen } from '../home/StatusScreen';
import { ScreenInspectorScreen } from '../inspector/ScreenInspectorScreen';
import { CreateWithAiScreen } from '../workflows/CreateWithAiScreen';
import { saveWorkflow } from '../workflows/storage';
import { WorkflowListScreen } from '../workflows/WorkflowListScreen';

/**
 * The app shell.
 *
 * A tab switch plus one modal route, rather than react-navigation. The app has five
 * destinations and one of them is a full-bleed canvas; a navigator would add a dependency, a
 * native stack, and a set of transition decisions to solve a problem this does not have yet.
 * Worth revisiting when the overlay work in Phase 8 needs real routing.
 */

type Tab = 'workflows' | 'agent' | 'inspector' | 'status' | 'settings';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'workflows', label: 'Workflows' },
  { id: 'agent', label: 'Agent' },
  { id: 'inspector', label: 'Screen' },
  { id: 'status', label: 'Status' },
  { id: 'settings', label: 'Provider' },
];

/** Where the canvas is open over the tabs, since it needs the whole screen. */
type Route =
  | { readonly kind: 'tabs' }
  | { readonly kind: 'canvas' }
  | { readonly kind: 'createWithAi' };

export const RootScreen = () => {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('workflows');
  const [route, setRoute] = useState<Route>({ kind: 'tabs' });

  const dirty = useCanvasStore((state) => state.dirty);
  const markSaved = useCanvasStore((state) => state.markSaved);

  const [saveError, setSaveError] = useState<readonly string[]>([]);

  const save = useCallback(() => {
    const workflow = useCanvasStore.getState().toWorkflow();

    void saveWorkflow(workflow).then((result) => {
      if (result.ok) {
        markSaved();
        setSaveError([]);
        return;
      }

      // Reported rather than silently failing: a user who believes they saved and did not is
      // going to lose work.
      setSaveError(result.issues);
    });
  }, [markSaved]);

  const statusBar = (
    <StatusBar
      barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      backgroundColor={theme.colors.background}
    />
  );

  if (route.kind === 'canvas') {
    return (
      <View className="flex-1 bg-background">
        {statusBar}

        <View
          className="flex-row items-center gap-2 border-b border-border px-4 pb-2"
          style={{ paddingTop: insets.top + theme.spacing[2] }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to workflows"
            onPress={() => setRoute({ kind: 'tabs' })}
            className="px-2 py-1"
          >
            <Text className="text-sm text-primary">Back</Text>
          </Pressable>

          <View className="flex-1" />

          <Button
            label={dirty ? 'Save' : 'Saved'}
            variant={dirty ? 'primary' : 'secondary'}
            size="sm"
            disabled={!dirty}
            onPress={save}
          />
        </View>

        {saveError.length > 0 && (
          <View className="border-b border-danger bg-surface-muted px-4 py-2">
            <Text className="text-xs font-medium text-danger">Could not save:</Text>
            {saveError.slice(0, 3).map((issue) => (
              <Text key={issue} className="mt-0.5 text-xs text-text-secondary">
                • {issue}
              </Text>
            ))}
          </View>
        )}

        <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
          <CanvasScreen />
        </View>
      </View>
    );
  }

  if (route.kind === 'createWithAi') {
    return (
      <View className="flex-1 bg-background">
        {statusBar}
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[6],
            paddingHorizontal: theme.spacing[5],
          }}
        >
          <CreateWithAiScreen
            onCreated={() => setRoute({ kind: 'canvas' })}
            onCancel={() => setRoute({ kind: 'tabs' })}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {statusBar}

      <View
        className="flex-row gap-2 border-b border-border px-4 pb-3"
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
            className={`rounded-md px-2.5 py-2 ${
              tab === entry.id ? 'bg-primary' : 'bg-surface-muted'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                tab === entry.id ? 'text-text-on-primary' : 'text-text-secondary'
              }`}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* The agent screen owns its scrolling, because its log must stay pinned while the goal
          field and stop button remain reachable. */}
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
          {tab === 'workflows' && (
            <WorkflowListScreen
              onOpen={() => setRoute({ kind: 'canvas' })}
              onCreateWithAi={() => setRoute({ kind: 'createWithAi' })}
            />
          )}
          {tab === 'inspector' && <ScreenInspectorScreen />}
          {tab === 'settings' && <ProviderSettingsScreen />}
          {tab === 'status' && <StatusScreen />}
        </ScrollView>
      )}
    </View>
  );
};
