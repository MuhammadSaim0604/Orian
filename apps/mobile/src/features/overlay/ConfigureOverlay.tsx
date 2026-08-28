import { Badge, Button, useTheme } from '@mobile-automation/ui';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useCanvasStore } from '../canvas/canvasStore';
import { definitionFor } from '../canvas/registry';
import { strategyDescription } from '../inspector/inspectScreen';

import { type OverlayTool, useOverlayStore, visibleTools } from './overlayStore';
import { useAskAi } from './useAskAi';
import { useOverlayTools } from './useOverlayTools';

/**
 * The floating toolset.
 *
 * Mounted into a `WindowManager` window as its own React root, so it has no access to the app's
 * component tree - the bound node id arrives as an initial prop and shared state comes from the
 * Zustand store module, which both roots import.
 *
 * The layout constraint is the feature: **the overlay must never cover the screen it is
 * configuring against.** Compact shows four tools and one panel; the eye toggle reveals the rest.
 * Anything that wants more room than that has been designed wrong.
 */

export interface ConfigureOverlayProps {
  /** Initial prop from `OverlayReactHost`. The overlay cannot render without it. */
  readonly nodeId: string;
}

export const ConfigureOverlay = ({ nodeId }: ConfigureOverlayProps) => {
  const { theme } = useTheme();

  const bind = useOverlayStore((state) => state.bind);
  const expanded = useOverlayStore((state) => state.expanded);
  const activeTool = useOverlayStore((state) => state.activeTool);
  const selectTool = useOverlayStore((state) => state.selectTool);
  const setExpanded = useOverlayStore((state) => state.setExpanded);

  useEffect(() => {
    // Rebinding on the prop rather than on mount, because the same root can be handed a new node
    // id if the overlay is reopened before the old view is released.
    bind(nodeId);
  }, [bind, nodeId]);

  const tools = visibleTools(expanded);

  return (
    <View
      className="flex-1 overflow-hidden rounded-xl border border-border bg-surface"
      // A hair of transparency so the user retains a sense of what is underneath, without
      // making the text hard to read.
      style={{ opacity: 0.97 }}
      accessibilityLabel="Configure with AI toolset"
    >
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <Text className="flex-1 text-xs font-semibold text-text-primary" numberOfLines={1}>
          {useCanvasStore.getState().nodes[nodeId]?.metadata.label ?? 'Step'}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show fewer tools' : 'Show all tools'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          className="rounded-md border border-border px-2 py-1"
        >
          {/* The "eye" from the plan. A glyph rather than an icon font, so the overlay carries no
              asset dependency into a window that must start instantly. */}
          <Text className="text-sm text-text-primary">{expanded ? '◡' : '◉'}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the toolset"
          onPress={() => {
            void import('@mobile-automation/native-automation').then((module) =>
              module.hideOverlay(),
            );
          }}
          className="rounded-md border border-border px-2 py-1"
        >
          <Text className="text-sm text-text-secondary">✕</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="border-b border-border"
        contentContainerStyle={{ padding: theme.spacing[2], gap: theme.spacing[2] }}
      >
        {tools.map((tool) => (
          <Pressable
            key={tool}
            accessibilityRole="tab"
            accessibilityLabel={TOOL_LABELS[tool]}
            accessibilityState={{ selected: activeTool === tool }}
            onPress={() => selectTool(tool)}
            className={`rounded-md px-2.5 py-1.5 ${
              activeTool === tool ? 'bg-primary' : 'bg-surface-muted'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                activeTool === tool ? 'text-text-on-primary' : 'text-text-secondary'
              }`}
            >
              {TOOL_LABELS[tool]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View className="flex-1 px-3 py-2">
        {activeTool === 'ask' && <AskPanel />}
        {activeTool === 'node' && <NodePanel />}
        {activeTool === 'screen' && <ScreenPanel />}
        {activeTool === 'uiTree' && <UiTreePanel />}
        {activeTool === 'screenshot' && <ScreenshotPanel />}
        {activeTool === 'element' && <ElementPanel />}
        {activeTool === 'coordinate' && <CoordinatePanel />}
        {activeTool === 'test' && <TestPanel />}
      </View>
    </View>
  );
};

const TOOL_LABELS: Record<OverlayTool, string> = {
  ask: 'Ask AI',
  element: 'Element',
  screen: 'Screen',
  node: 'Node',
  uiTree: 'UI tree',
  screenshot: 'Screenshot',
  coordinate: 'Point',
  test: 'Test',
};

/**
 * Ask AI.
 *
 * The proposal is **offered, not applied**. The user is looking at another app and cannot see the
 * node change, so a silent write would leave them unsure whether anything happened - and unable
 * to tell whether what happened was right.
 */
const AskPanel = () => {
  const { theme } = useTheme();
  const [instruction, setInstruction] = useState('');

  const asking = useOverlayStore((state) => state.asking);
  const proposal = useOverlayStore((state) => state.proposal);
  const error = useOverlayStore((state) => state.proposalError);
  const clearProposal = useOverlayStore((state) => state.clearProposal);

  const { ask, accept } = useAskAi();

  return (
    <ScrollView contentContainerStyle={{ gap: 8 }}>
      <TextInput
        accessibilityLabel="What should this step do?"
        className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text-primary"
        placeholder="Return true if the Send button is visible"
        placeholderTextColor={theme.colors.textMuted}
        value={instruction}
        onChangeText={setInstruction}
        editable={!asking}
        multiline
      />

      <Button
        label="Ask AI"
        busyLabel="Thinking…"
        busy={asking}
        size="sm"
        disabled={instruction.trim() === ''}
        // Distinguished from the tool tab of the same name, so a screen reader user is not told
        // "Ask AI" twice with no way to tell which is which.
        accessibilityLabel="Send this instruction to the AI"
        onPress={() => {
          void ask(instruction);
        }}
      />

      {error != null && <Text className="text-xs text-danger">{error}</Text>}

      {proposal != null && (
        <View className="gap-2 rounded-lg border border-primary bg-surface-muted p-2.5">
          <Text className="text-xs font-semibold text-text-primary">{proposal.summary}</Text>
          <Text className="text-xs text-text-secondary">
            {JSON.stringify(proposal.config, null, 2)}
          </Text>

          <View className="flex-row gap-2">
            <Button label="Apply" size="sm" full onPress={accept} />
            <Button label="Discard" size="sm" variant="ghost" full onPress={clearProposal} />
          </View>
        </View>
      )}
    </ScrollView>
  );
};

/** Current Node: what the AI is configuring, so the user can confirm the binding is right. */
const NodePanel = () => {
  const nodeId = useOverlayStore((state) => state.nodeId);

  const node = useCanvasStore((state) => (nodeId === null ? undefined : state.nodes[nodeId]));

  if (node === undefined) {
    return <Text className="text-xs text-danger">This step no longer exists.</Text>;
  }

  const definition = definitionFor(node.type);

  return (
    <ScrollView contentContainerStyle={{ gap: 4 }}>
      <Text className="text-xs font-semibold text-text-primary">{node.metadata.label}</Text>
      <Text className="text-xs text-text-muted">{node.type}</Text>
      {definition != null && (
        <Text className="text-xs text-text-secondary">{definition.display.description}</Text>
      )}
      <Text className="mt-1 text-xs text-text-secondary">
        {JSON.stringify(node.config, null, 2)}
      </Text>
    </ScrollView>
  );
};

/** Screen: which app and activity is in front, which is what scopes every selector. */
const ScreenPanel = () => {
  const reading = useOverlayStore((state) => state.reading);
  const busy = useOverlayStore((state) => state.busy);
  const error = useOverlayStore((state) => state.readingError);

  const { readScreen } = useOverlayTools();

  return (
    <ScrollView contentContainerStyle={{ gap: 8 }}>
      <Button
        label="Read the screen"
        busyLabel="Reading…"
        busy={busy}
        size="sm"
        onPress={() => {
          void readScreen();
        }}
      />

      {error != null && <Text className="text-xs text-danger">{error}</Text>}

      {reading != null && (
        <View className="gap-1">
          <Text className="text-xs font-semibold text-text-primary">
            {reading.packageName ?? 'Unknown app'}
          </Text>
          <Text className="text-xs text-text-muted">
            {reading.activityName ?? 'Unknown screen'}
          </Text>
          <Text className="text-xs text-text-secondary">
            {reading.elements.length} targetable elements
          </Text>
          {reading.schemaMismatch != null && (
            <Text className="text-xs text-danger">
              Screen data is format v{reading.schemaMismatch}, which this build cannot read.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
};

/** UI Tree: the elements, most durable first, so a user can see what is targetable. */
const UiTreePanel = () => {
  const reading = useOverlayStore((state) => state.reading);

  if (reading === null) {
    return <Text className="text-xs text-text-muted">Read the screen first.</Text>;
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 2 }}>
      {reading.elements.slice(0, 40).map((element) => (
        <View key={element.id} style={{ marginLeft: Math.min(element.depth, 4) * 6 }}>
          <Text className="text-xs text-text-secondary" numberOfLines={1}>
            {element.text ?? element.contentDescription ?? element.resourceId ?? element.className}
          </Text>
        </View>
      ))}
      {reading.elements.length > 40 && (
        <Text className="text-xs text-text-muted">Showing 40 of {reading.elements.length}.</Text>
      )}
    </ScrollView>
  );
};

/** Screenshot: captured by path, never as bytes. */
const ScreenshotPanel = () => {
  const path = useOverlayStore((state) => state.screenshotPath);

  const { capture } = useOverlayTools();

  return (
    <ScrollView contentContainerStyle={{ gap: 8 }}>
      <Button
        label="Capture the screen"
        size="sm"
        onPress={() => {
          void capture();
        }}
      />

      {path == null ? (
        <Text className="text-xs text-text-muted">
          A screenshot lets the AI see layout the UI tree cannot describe.
        </Text>
      ) : (
        <Text className="text-xs text-text-secondary" numberOfLines={2}>
          Captured. The AI will be told it is available at {path}.
        </Text>
      )}
    </ScrollView>
  );
};

/**
 * Element Inspector.
 *
 * Each row states how durable it is to target, for the same reason the standalone screen inspector
 * does: without it the convenient choice is coordinates, and the convenient choice is the one that
 * breaks (ADR 0009).
 */
const ElementPanel = () => {
  const reading = useOverlayStore((state) => state.reading);
  const selected = useOverlayStore((state) => state.selectedElement);
  const selectElement = useOverlayStore((state) => state.selectElement);

  const { readScreen } = useOverlayTools();

  if (reading === null) {
    return (
      <View className="gap-2">
        <Text className="text-xs text-text-muted">Read the screen to list its elements.</Text>
        <Button
          label="Read the screen"
          size="sm"
          onPress={() => {
            void readScreen();
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 4 }}>
      {reading.elements.slice(0, 30).map((element) => (
        <Pressable
          key={element.id}
          accessibilityRole="button"
          accessibilityLabel={`${element.text ?? element.className ?? 'element'}. ${strategyDescription(element.strategy)}`}
          accessibilityState={{ selected: selected?.id === element.id }}
          onPress={() => selectElement(element)}
          className={`rounded-md border p-2 ${
            selected?.id === element.id ? 'border-primary bg-surface-muted' : 'border-border'
          }`}
        >
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-2 text-xs text-text-primary" numberOfLines={1}>
              {element.text ?? element.contentDescription ?? element.resourceId ?? 'unnamed'}
            </Text>
            <Badge
              label={element.strategy}
              tone={
                element.strategy === 'resourceId' || element.strategy === 'accessibility'
                  ? 'good'
                  : element.strategy === 'coordinates'
                    ? 'bad'
                    : 'warn'
              }
            />
          </View>
        </Pressable>
      ))}

      {selected != null && (
        <View className="mt-1 rounded-md border border-primary p-2">
          <Text className="text-xs text-text-secondary">{JSON.stringify(selected.selector)}</Text>
          <Text className="mt-1 text-xs text-text-muted">
            {strategyDescription(selected.strategy)}
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

/**
 * Coordinate Inspector.
 *
 * Reports what is at a point, and upgrades it to an element when one is there. A coordinate is the
 * weakest selector available, so the useful thing this tool does is get the user off one.
 */
const CoordinatePanel = () => {
  const { theme } = useTheme();

  const point = useOverlayStore((state) => state.probedPoint);
  const selected = useOverlayStore((state) => state.selectedElement);

  const [x, setX] = useState('');
  const [y, setY] = useState('');

  const { probe } = useOverlayTools();

  return (
    <ScrollView contentContainerStyle={{ gap: 8 }}>
      <View className="flex-row gap-2">
        <TextInput
          accessibilityLabel="X coordinate"
          className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm text-text-primary"
          placeholder="x"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          value={x}
          onChangeText={setX}
        />
        <TextInput
          accessibilityLabel="Y coordinate"
          className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm text-text-primary"
          placeholder="y"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          value={y}
          onChangeText={setY}
        />
      </View>

      <Button
        label="What is here?"
        size="sm"
        onPress={() => {
          void probe(Number.parseInt(x, 10) || 0, Number.parseInt(y, 10) || 0);
        }}
      />

      {point != null && (
        <Text className="text-xs text-text-muted">
          ({point.x}, {point.y})
        </Text>
      )}

      {selected != null ? (
        <Text className="text-xs text-success">
          Found “{selected.text ?? selected.resourceId ?? 'an element'}” there — use that rather
          than the coordinate.
        </Text>
      ) : (
        point != null && (
          <Text className="text-xs text-warning">
            Nothing targetable at that point. A coordinate alone will break if the layout changes.
          </Text>
        )
      )}
    </ScrollView>
  );
};

/**
 * Test Action.
 *
 * Runs the *resolution*, never the action: testing a tap resolves the element rather than tapping
 * it. A test that sent a message would be indefensible - the user is checking a configuration, not
 * asking to act.
 */
const TestPanel = () => {
  const outcome = useOverlayStore((state) => state.lastTest);
  const busy = useOverlayStore((state) => state.busy);
  const proposal = useOverlayStore((state) => state.proposal);

  const { testAction } = useOverlayTools();

  return (
    <ScrollView contentContainerStyle={{ gap: 8 }}>
      <Button
        label="Test this step"
        busyLabel="Testing…"
        busy={busy}
        size="sm"
        onPress={() => {
          void testAction();
        }}
      />

      <Text className="text-xs text-text-muted">
        {proposal == null
          ? 'Checks whether this step can find its target on the screen in front of you.'
          : "Tests the AI's suggestion rather than the saved configuration."}
      </Text>

      {outcome != null && (
        <View className="rounded-md border border-border p-2">
          <Text
            className={`text-xs font-semibold ${
              outcome.succeeded ? 'text-success' : 'text-danger'
            }`}
          >
            {outcome.succeeded ? 'Found it' : 'Did not work'}
          </Text>
          <Text className="mt-0.5 text-xs text-text-secondary">{outcome.detail}</Text>
          <Text className="mt-0.5 text-xs text-text-muted">via {outcome.tool}</Text>
        </View>
      )}
    </ScrollView>
  );
};
