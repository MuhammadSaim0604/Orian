import { Card } from '@mobile-automation/ui';
import { Text, View } from 'react-native';

import { AutomationStatusPanel } from '../automation/AutomationStatusPanel';

import { PhaseStatusCard } from './PhaseStatusCard';

/**
 * Build and capability status.
 *
 * Kept because the permission rows are genuinely useful - a user whose automation is not
 * working needs to see which grant is missing, and that is not obvious from a failed run.
 * The phase list is scaffolding and goes when the product ships.
 */
export const StatusScreen = () => (
  <>
    <View accessibilityRole="header">
      <Text className="text-2xl font-bold text-text-primary">Mobile Automation</Text>
      <Text className="mt-1 text-sm text-text-secondary">
        An AI agent and a visual workflow engine sharing one Android device runtime.
      </Text>
    </View>

    <AutomationStatusPanel />

    <PhaseStatusCard
      title="Phases 0–5 — Foundation, Kotlin core, bridge, node system, engine"
      status="done"
      detail="Monorepo and CI, the accessibility service and selector resolver, a typed native bridge, the Zod workflow schema, 28 node types, and the DAG executor."
    />
    <PhaseStatusCard
      title="Phase 7 — AI agent engine"
      status="done"
      detail="Bounded agent loop, Chat Completions client, prompt engine, and the recorder seam."
    />
    <PhaseStatusCard
      title="Phase 6 — Workflow builder"
      status="done"
      detail="Skia canvas, schema-driven node editor, execution debugger, screen inspector, and workflow persistence."
    />
    <PhaseStatusCard
      title="Phases 8–10 — Overlay, recorder, MCP"
      status="pending"
      detail="Configure-with-AI overlay, execution recording into workflows, and the MCP server."
    />

    <Card muted>
      <Text className="text-xs text-text-secondary">
        Every colour on these screens comes from the shared design tokens, so light and dark follow
        the system setting without any screen knowing about it.
      </Text>
    </Card>
  </>
);
