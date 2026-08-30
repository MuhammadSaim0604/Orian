import { useTheme } from '@mobile-automation/ui';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type SessionSummary } from './sessionStorage';
import { useSessionStore } from './sessionStore';
import { useGroupedSessions } from './useSessionViews';

/**
 * The session sidebar.
 *
 * Sessions grouped by age rather than listed with timestamps, because "3 days ago" is something a person has
 * to decode while a heading they can skim is not. Titles come from each conversation's first message, so the
 * list reads as a list of tasks rather than "New chat, New chat, New chat".
 *
 * Rendered as a panel over the chat rather than a drawer that pushes it aside: on a phone there is no room
 * for both, and a persistent sidebar would leave the conversation too narrow to read.
 */

export interface SessionSidebarProps {
  readonly onClose: () => void;
}

export const SessionSidebar = ({ onClose }: SessionSidebarProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const groups = useGroupedSessions();
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const open = useSessionStore((state) => state.open);
  const startNew = useSessionStore((state) => state.startNew);
  const remove = useSessionStore((state) => state.remove);

  const [busy, setBusy] = useState(false);

  const onSelect = useCallback(
    async (sessionId: string) => {
      if (sessionId !== activeSessionId) await open(sessionId);
      onClose();
    },
    [activeSessionId, onClose, open],
  );

  const onNew = useCallback(async () => {
    // Guarded because creating a session writes to the database and two taps would leave an empty
    // conversation behind that the user then has to delete.
    if (busy) return;
    setBusy(true);

    try {
      await startNew();
      onClose();
    } finally {
      setBusy(false);
    }
  }, [busy, onClose, startNew]);

  /**
   * Deletes after confirming.
   *
   * Confirmed because a conversation is not recoverable — its messages cascade with it — and because a
   * mis-tap in a list is easy. The dialog names what is being deleted rather than saying "this item", so the
   * user can tell they tapped the row they meant.
   */
  const onDelete = useCallback(
    (session: SessionSummary) => {
      Alert.alert(
        'Delete this conversation?',
        `“${session.title}” and its ${session.messageCount} message${
          session.messageCount === 1 ? '' : 's'
        } will be removed. This cannot be undone.`,
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void remove(session.id);
            },
          },
        ],
      );
    },
    [remove],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + theme.spacing[2] }}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 pb-2">
        <View accessibilityRole="header" className="flex-1">
          <Text className="text-lg font-bold text-text-primary">Conversations</Text>
          <Text className="text-xs text-text-secondary">Each one keeps its own memory</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close conversations"
          onPress={onClose}
          className="px-2 py-2"
        >
          <Text className="text-sm text-primary">Done</Text>
        </Pressable>
      </View>

      <View className="px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new conversation"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void onNew()}
          style={{ minHeight: MIN_TOUCH_TARGET }}
          className={`items-center justify-center rounded-lg ${
            busy ? 'bg-surface-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          <Text
            className={`text-sm font-semibold ${busy ? 'text-text-muted' : 'text-text-on-primary'}`}
          >
            New conversation
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + theme.spacing[6],
          paddingHorizontal: theme.spacing[4],
        }}
      >
        {groups.length === 0 ? (
          <Text className="py-6 text-center text-sm text-text-muted">No conversations yet.</Text>
        ) : (
          groups.map((group) => (
            <View key={group.label} className="mb-4">
              <Text className="mb-1 text-xs font-medium uppercase text-text-muted">
                {group.label}
              </Text>

              {group.sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  onSelect={() => void onSelect(session.id)}
                  onDelete={() => onDelete(session)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const SessionRow = ({
  session,
  active,
  onSelect,
  onDelete,
}: {
  readonly session: SessionSummary;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
}) => (
  <View
    className={`mb-1 flex-row items-center rounded-lg border ${
      active ? 'border-primary bg-surface' : 'border-border bg-surface'
    }`}
  >
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open “${session.title}”`}
      accessibilityState={{ selected: active }}
      onPress={onSelect}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className="flex-1 justify-center px-3 py-2"
    >
      <Text numberOfLines={1} className="text-sm text-text-primary">
        {session.title}
      </Text>
      <Text className="mt-0.5 text-xs text-text-muted">
        {session.messageCount === 0
          ? 'Empty'
          : `${session.messageCount} message${session.messageCount === 1 ? '' : 's'}`}
      </Text>
    </Pressable>

    {/* A separate target rather than a swipe or long-press: both are discoverable only by accident, and
        deleting by accident is exactly what must not happen. */}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Delete “${session.title}”`}
      onPress={onDelete}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
      className="items-center justify-center"
    >
      <Text className="text-xs font-medium text-danger">Delete</Text>
    </Pressable>
  </View>
);

const MIN_TOUCH_TARGET = 48;
