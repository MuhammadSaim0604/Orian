import { Text, View } from 'react-native';

export type PhaseStatus = 'done' | 'in-progress' | 'pending';

export interface PhaseStatusCardProps {
  readonly title: string;
  readonly status: PhaseStatus;
  readonly detail: string;
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: 'Done',
  'in-progress': 'In progress',
  pending: 'Pending',
};

/** Semantic colour class per status - no raw colour values in the component. */
const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: 'text-success',
  'in-progress': 'text-primary',
  pending: 'text-text-muted',
};

/**
 * Small themed card used by the Phase 1 placeholder screen. Kept in the app
 * rather than `packages/ui` because it is scaffolding, not a real primitive.
 */
export const PhaseStatusCard = ({ title, status, detail }: PhaseStatusCardProps) => (
  <View
    accessible
    accessibilityLabel={`${title}. Status: ${STATUS_LABEL[status]}. ${detail}`}
    className="rounded-lg border border-border bg-surface p-4"
  >
    <View className="flex-row items-center justify-between">
      <Text className="flex-1 pr-3 text-base font-semibold text-text-primary">{title}</Text>
      <Text className={`text-xs font-medium uppercase ${STATUS_CLASS[status]}`}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
    <Text className="mt-2 text-sm text-text-secondary">{detail}</Text>
  </View>
);
