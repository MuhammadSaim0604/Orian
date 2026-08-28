import { Badge, Button, Card, EmptyState } from '@mobile-automation/ui';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAutomationStatus } from '../automation/useAutomationStatus';

import {
  type InspectedElement,
  type InspectedScreen,
  inspectScreen,
  strategyDescription,
} from './inspectScreen';

/**
 * The screen inspector.
 *
 * Its real job is not showing a tree - it is showing the user **how durable each element is to
 * target**. An inspector that just lists elements invites picking whatever is convenient, and
 * the convenient choice is usually coordinates. Naming the strategy on every row is what makes
 * the durable option the obvious one (ADR 0009).
 */
export const ScreenInspectorScreen = () => {
  const { status } = useAutomationStatus();

  const [screen, setScreen] = useState<InspectedScreen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [selected, setSelected] = useState<InspectedElement | null>(null);

  const read = useCallback(() => {
    setReading(true);
    setError(null);

    void inspectScreen()
      .then((result) => {
        setScreen(result);
        setSelected(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The screen could not be read.');
      })
      .finally(() => setReading(false));
  }, []);

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">Screen inspector</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Read what is on screen right now, and see how reliably each element can be targeted.
        </Text>
      </View>

      {!status.isReady && (
        <Card muted>
          <Text className="text-sm font-medium text-text-primary">
            Accessibility service is off
          </Text>
          <Text className="mt-1 text-xs text-text-secondary">
            The screen cannot be read until you enable it in Android settings.
          </Text>
        </Card>
      )}

      <Button
        label="Read the screen"
        busyLabel="Reading…"
        busy={reading}
        disabled={!status.isReady}
        onPress={read}
      />

      <Text className="-mt-1 text-xs text-text-muted">
        Reads this app&apos;s own screen unless you switch to another app first — the service sees
        whatever is in the foreground.
      </Text>

      {error != null && (
        <Card muted>
          <Text className="text-xs text-danger">{error}</Text>
        </Card>
      )}

      {screen?.schemaMismatch != null && (
        <Card muted>
          <Text className="text-xs text-danger">
            The device returned screen data in format v{screen.schemaMismatch}, which this build
            cannot read. Reading it anyway would show elements that are not there.
          </Text>
        </Card>
      )}

      {screen !== null && screen.schemaMismatch === null && (
        <Card
          title={screen.packageName ?? 'Unknown app'}
          subtitle={screen.activityName ?? undefined}
          trailing={<Badge label={`${screen.elements.length} elements`} />}
        >
          {screen.elements.length === 0 ? (
            <Text className="text-xs text-text-secondary">Nothing targetable on this screen.</Text>
          ) : (
            <View className="gap-2">
              {screen.elements.slice(0, 60).map((element) => (
                <Pressable
                  key={element.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${describe(element)}. ${strategyDescription(element.strategy)}`}
                  onPress={() => setSelected(element)}
                  className={[
                    'rounded-md border p-2.5',
                    selected?.id === element.id
                      ? 'border-primary bg-surface-muted'
                      : 'border-border bg-surface',
                  ].join(' ')}
                  // Indented by depth, so the screen's structure is visible without drawing a
                  // tree - which on a phone would cost more width than it explains.
                  style={{ marginLeft: Math.min(element.depth, 6) * 8 }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 pr-2 text-sm text-text-primary" numberOfLines={1}>
                      {describe(element)}
                    </Text>
                    <Badge label={element.strategy} tone={TONE_FOR_STRATEGY[element.strategy]} />
                  </View>

                  <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
                    {element.className ?? 'unknown class'}
                    {element.clickable ? ' · tappable' : ''}
                    {element.editable ? ' · text field' : ''}
                    {element.scrollable ? ' · scrollable' : ''}
                  </Text>
                </Pressable>
              ))}

              {screen.elements.length > 60 && (
                <Text className="text-xs text-text-muted">
                  Showing the first 60 of {screen.elements.length}.
                </Text>
              )}
            </View>
          )}
        </Card>
      )}

      {selected !== null && (
        <Card title="Selected element" subtitle={strategyDescription(selected.strategy)}>
          <Text className="text-xs text-text-secondary">
            {JSON.stringify(selected.selector, null, 2)}
          </Text>
          {selected.bounds != null && (
            <Text className="mt-2 text-xs text-text-muted">
              {selected.bounds.right - selected.bounds.left}×
              {selected.bounds.bottom - selected.bounds.top} at ({selected.bounds.left},{' '}
              {selected.bounds.top})
            </Text>
          )}
        </Card>
      )}

      {screen === null && error === null && (
        <EmptyState
          title="Nothing read yet"
          detail="Read the screen to see its elements and how to target them."
        />
      )}
    </ScrollView>
  );
};

const TONE_FOR_STRATEGY: Record<InspectedElement['strategy'], 'good' | 'warn' | 'bad'> = {
  resourceId: 'good',
  accessibility: 'good',
  text: 'warn',
  structural: 'warn',
  coordinates: 'bad',
};

/** The most recognisable thing about an element. */
const describe = (element: InspectedElement): string =>
  element.text ??
  element.contentDescription ??
  element.resourceId ??
  element.className ??
  'unnamed element';
