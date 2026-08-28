import { Button, Card, useTheme } from '@mobile-automation/ui';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { useCanvasStore } from '../canvas/canvasStore';
import { useExecutionStore } from '../canvas/executionStore';
import { useSelectionStore } from '../canvas/selectionStore';

import { useWorkflowGeneration } from './useWorkflowGeneration';

/**
 * Create by AI.
 *
 * The generated workflow is loaded onto the canvas **unsaved**, and that is the important
 * behaviour: the user reviews and edits it before it becomes durable. Saving it automatically
 * would fill their library with plausible-looking workflows nobody has checked, and this one
 * drives their phone.
 */

export interface CreateWithAiScreenProps {
  readonly onCreated: () => void;
  readonly onCancel: () => void;
}

const EXAMPLES = [
  'Open WhatsApp, search for Robert, and send him a message',
  'Set an alarm for 7am on weekdays',
  'Take a screenshot and put the time on the clipboard',
];

export const CreateWithAiScreen = ({ onCreated, onCancel }: CreateWithAiScreenProps) => {
  const { theme } = useTheme();

  const [goal, setGoal] = useState('');

  const { generating, error, issues, generate } = useWorkflowGeneration();

  const load = useCanvasStore((state) => state.load);
  const clearExecution = useExecutionStore((state) => state.clear);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const create = () => {
    void generate(goal).then((workflow) => {
      if (workflow === null) return;

      clearExecution();
      clearSelection();
      load(workflow);
      onCreated();
    });
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
      <View accessibilityRole="header">
        <Text className="text-2xl font-bold text-text-primary">Create with AI</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Describe the task. The AI builds the steps, and you review them before anything runs.
        </Text>
      </View>

      <TextInput
        accessibilityLabel="What should the workflow do?"
        className="rounded-lg border border-border bg-surface px-3 py-3 text-base text-text-primary"
        placeholder="Open WhatsApp and send Robert a message"
        placeholderTextColor={theme.colors.textMuted}
        value={goal}
        onChangeText={setGoal}
        editable={!generating}
        multiline
      />

      <Button
        label="Build the workflow"
        busyLabel="Thinking…"
        busy={generating}
        disabled={goal.trim() === ''}
        onPress={create}
      />

      <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={generating} />

      {error != null && (
        <Card muted>
          <Text className="text-xs text-danger">{error}</Text>
        </Card>
      )}

      {issues.length > 0 && error == null && (
        <Card muted>
          <Text className="text-xs text-text-secondary">
            The first attempt was not valid ({issues[0]}). Trying again.
          </Text>
        </Card>
      )}

      <Card title="Examples" muted>
        <View className="gap-2">
          {EXAMPLES.map((example) => (
            <Text
              key={example}
              className="text-xs text-text-secondary"
              onPress={() => setGoal(example)}
              accessibilityRole="button"
              accessibilityLabel={`Use example: ${example}`}
            >
              • {example}
            </Text>
          ))}
        </View>
      </Card>

      <Text className="px-1 text-xs text-text-muted">
        Nothing is saved and nothing runs until you say so. A generated workflow is a draft — check
        the steps, especially anything that sends a message or changes a setting.
      </Text>
    </ScrollView>
  );
};
