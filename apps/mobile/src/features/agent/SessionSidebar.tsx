import {
  CloseIcon,
  DeleteIcon,
  ForwardIcon,
  IconBadge,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  useTheme,
} from '@mobile-automation/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type SessionSummary } from './sessionStorage';
import { useSessionStore } from './sessionStore';
import { useGroupedSessions } from './useSessionViews';

/**
 * The session sidebar.
 *
 * Slides in from the left and covers part of the screen, because that is what a sidebar is.
 *
 * **Its modal is not `statusBarTranslucent`, and that matters.** That prop applies the flag to the host
 * activity's window rather than to the modal alone, so the whole app went edge-to-edge while the sidebar was
 * open — the panel ran under the clock, the chat behind it jumped up, and closing it dropped everything back.
 * Three reported symptoms, one cause. Without the flag the modal starts below the status bar, which is where a
 * panel belongs, and `SafeAreaView` handles the bottom edge so the last conversation is not sitting under the
 * navigation buttons.
 */

export interface SessionSidebarProps {
  readonly onClose: () => void;
  /** Opens the permission screen — the same one that follows the welcome screen. */
  readonly onOpenOnboarding: () => void;
  readonly onOpenSettings: () => void;
}

export const SessionSidebar = ({
  onClose,
  onOpenOnboarding,
  onOpenSettings,
}: SessionSidebarProps) => {
  const { theme } = useTheme();

  const groups = useGroupedSessions();
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const open = useSessionStore((state) => state.open);
  const startNew = useSessionStore((state) => state.startNew);
  const remove = useSessionStore((state) => state.remove);

  const [busy, setBusy] = useState(false);

  /**
   * Search, when the user asks for it.
   *
   * Not a permanently visible field: with a handful of conversations it would be dead weight above the list it
   * filters. Opening it replaces the section's header row rather than pushing it down, so the list does not move
   * under the finger that just tapped.
   */
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const width = Math.min(
    Math.round(Dimensions.get('window').width * WIDTH_FRACTION),
    MAX_SIDEBAR_WIDTH,
  );

  /**
   * The groups the list actually shows.
   *
   * Filtered here rather than in `useGroupedSessions`, because the grouping hook is shared and a search term is
   * this panel's concern. Empty groups are dropped, so a search never leaves a bare "Today" heading with nothing
   * under it.
   */
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return groups;

    return groups
      .map((group) => ({
        ...group,
        sessions: group.sessions.filter((session) => session.title.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.sessions.length > 0);
  }, [groups, query]);

  /** Slid in on mount. Mounted only while open, so this runs exactly when the panel appears. */
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: SLIDE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  /** Slides out before unmounting, so dismissal is a movement rather than a disappearance. */
  const close = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: SLIDE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose, progress]);

  const onSelect = useCallback(
    async (sessionId: string) => {
      if (sessionId !== activeSessionId) await open(sessionId);
      close();
    },
    [activeSessionId, close, open],
  );

  const onNew = useCallback(async () => {
    // Guarded because creating a session writes to the database, and two taps would leave an empty conversation
    // behind for the user to delete.
    if (busy) return;
    setBusy(true);

    try {
      await startNew();
      close();
    } finally {
      setBusy(false);
    }
  }, [busy, close, startNew]);

  /**
   * Deletes after confirming.
   *
   * A conversation is not recoverable — its messages cascade with it — and a mis-tap in a list is easy. The
   * dialog names what is being deleted rather than saying "this item", so the user can tell they tapped the row
   * they meant.
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
    <View className="flex-1 flex-row">
      <Animated.View
        style={{
          width,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) },
          ],
        }}
        className="border-r border-border bg-background"
      >
        {/* `edges` names top and bottom explicitly: the panel is flush to the left screen edge, and asking for a
            left inset would indent it away from that edge on a device with a cutout there. */}
        <SafeAreaView edges={['top', 'bottom']} className="flex-1">
          <View className="flex-row items-center gap-2 border-b border-border px-3 pb-3 pt-2">
            <View accessibilityRole="header" className="flex-1">
              {/* Two weights in one line rather than a single bold string: the product's name should read as a
                wordmark, and "Orion" carrying the weight is what makes it one. */}
              <Text className="text-lg tracking-tight text-text-primary">
                <Text className="font-bold">Orion</Text>
                <Text className="font-light text-text-secondary"> Agent</Text>
              </Text>

              <Text className="text-[10px] uppercase tracking-widest text-text-muted">
                Automation
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the sidebar"
              onPress={close}
              style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
              className="items-center justify-center"
            >
              <CloseIcon size={18} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingBottom: theme.spacing[6],
              paddingHorizontal: theme.spacing[3],
              paddingTop: theme.spacing[3],
              gap: theme.spacing[4],
            }}
          >
            {/* Section one: what the app can do for you, as opposed to what you have already asked it. */}
            <View style={{ gap: theme.spacing[1] }}>
              <ActionRow
                label="Onboarding"
                hint="Permissions and setup"
                onPress={() => {
                  close();
                  onOpenOnboarding();
                }}
                // A filled badge, and the trailing arrow: this row leads to a whole flow, which is what the arrow
                // is for. Settings deliberately has neither, so the two do not read as the same kind of thing.
                badge
                trailingArrow
                icon={(color) => <ShieldCheckIcon size={15} color={color} />}
              />

              <ActionRow
                label="Settings"
                hint="Model, tools, run limits"
                onPress={() => {
                  close();
                  onOpenSettings();
                }}
                icon={(color) => <SettingsIcon size={18} color={color} />}
              />
            </View>

            {/* Section two: the conversations. */}
            <View style={{ gap: theme.spacing[2] }}>
              {searching ? (
                /* The search field replaces the header row rather than appearing above it, so opening search does not
                 push the list down under the finger that just tapped. */
                <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface px-2.5">
                  <SearchIcon size={15} color={theme.colors.textMuted} />

                  <TextInput
                    accessibilityLabel="Search conversations"
                    autoFocus
                    className="flex-1 py-2 text-sm text-text-primary"
                    style={{ minHeight: MIN_TOUCH_TARGET - 8 }}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search chats"
                    placeholderTextColor={theme.colors.textMuted}
                  />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Stop searching"
                    onPress={() => {
                      setSearching(false);
                      setQuery('');
                    }}
                    style={{ minHeight: MIN_TOUCH_TARGET - 8, minWidth: 32 }}
                    className="items-center justify-center"
                  >
                    <CloseIcon size={15} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: theme.spacing[2] }}>
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                      Recent chats
                    </Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Search conversations"
                      onPress={() => setSearching(true)}
                      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
                      className="items-center justify-center"
                    >
                      <SearchIcon size={17} color={theme.colors.textSecondary} />
                    </Pressable>
                  </View>

                  {/* A labelled button rather than a bare plus. "New chat" is the most common action in this panel,
                    and an icon alone made the primary action the least legible thing in it. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start a new conversation"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() => void onNew()}
                    style={{ minHeight: MIN_TOUCH_TARGET }}
                    className={`flex-row items-center justify-center gap-2 rounded-xl border border-primary ${
                      busy ? 'opacity-50' : 'active:opacity-70'
                    }`}
                  >
                    <PlusIcon size={16} color={theme.colors.primary} />
                    <Text className="text-sm font-semibold text-primary">New chat</Text>
                  </Pressable>
                </View>
              )}

              {visibleGroups.length === 0 ? (
                <Text className="py-4 text-center text-xs text-text-muted">
                  {query.trim() === '' ? 'No conversations yet.' : `Nothing matches “${query}”.`}
                </Text>
              ) : (
                visibleGroups.map((group) => (
                  <View key={group.label} style={{ gap: theme.spacing[1] }}>
                    <Text className="text-xs text-text-muted">{group.label}</Text>

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
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>

      {/* The uncovered strip. Tappable to dismiss, and deliberately **untinted** — the dim overlay was read as a
          shadow rather than as a boundary, and the panel's own border already draws the edge. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close the sidebar"
        onPress={close}
        className="flex-1"
      />
    </View>
  );
};

/**
 * One action row.
 *
 * The badge and the trailing arrow are both optional and both meaningful. Onboarding gets the filled badge and the
 * arrow because it opens a flow; settings gets a plain icon and no arrow because it is one screen. Giving them the
 * same treatment would say they are the same kind of destination, which is the asymmetry device testing asked for.
 */
const ActionRow = ({
  label,
  hint,
  onPress,
  icon,
  badge = false,
  trailingArrow = false,
}: {
  readonly label: string;
  readonly hint: string;
  readonly onPress: () => void;
  readonly icon: (color: string) => React.ReactElement;
  readonly badge?: boolean;
  readonly trailingArrow?: boolean;
}) => {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-2.5 active:opacity-70"
    >
      {badge ? (
        // `textPrimary` on `background` is white-on-dark in dark mode and black-on-light in light, because the
        // palette itself inverts between schemes. Naming the roles rather than the colours is what makes one
        // expression correct in both (ADR 0004).
        <IconBadge size={28} background={theme.colors.textPrimary}>
          {icon(theme.colors.background)}
        </IconBadge>
      ) : (
        <View className="h-7 w-7 items-center justify-center">
          {icon(theme.colors.textSecondary)}
        </View>
      )}

      <View className="flex-1 py-2">
        <Text numberOfLines={1} className="text-sm text-text-primary">
          {label}
        </Text>
        <Text numberOfLines={1} className="text-xs text-text-muted">
          {hint}
        </Text>
      </View>

      {trailingArrow && <ForwardIcon size={15} color={theme.colors.textMuted} />}
    </Pressable>
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
}) => {
  const { theme } = useTheme();

  return (
    <View
      className={`flex-row items-center rounded-lg border bg-surface ${
        active ? 'border-primary' : 'border-border'
      }`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open “${session.title}”`}
        accessibilityState={{ selected: active }}
        onPress={onSelect}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className="flex-1 justify-center px-2 py-1"
      >
        <Text numberOfLines={1} className="text-sm text-text-primary">
          {session.title}
        </Text>
        <Text className="text-xs text-text-muted">
          {session.messageCount === 0
            ? 'Empty'
            : `${session.messageCount} message${session.messageCount === 1 ? '' : 's'}`}
        </Text>
      </Pressable>

      {/* Its own target rather than a swipe or long-press: both are discoverable only by accident, and deleting
          by accident is exactly what must not happen. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete “${session.title}”`}
        onPress={onDelete}
        style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
        className="items-center justify-center"
      >
        <DeleteIcon size={16} color={theme.colors.danger} />
      </Pressable>
    </View>
  );
};

/** Most of the width, but never all of it — the uncovered strip is how the panel is dismissed. */
const WIDTH_FRACTION = 0.82;

/** A ceiling for tablets, where 82% would be an absurdly wide column of chat titles. */
const MAX_SIDEBAR_WIDTH = 360;

const SLIDE_DURATION_MS = 220;

const MIN_TOUCH_TARGET = 48;
