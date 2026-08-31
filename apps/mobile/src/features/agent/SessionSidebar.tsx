import {
  DeleteIcon,
  ForwardIcon,
  IconBadge,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  CloseIcon,
  useTheme,
} from '@mobile-automation/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type SessionSummary } from './sessionStorage';
import { useSessionStore } from './sessionStore';
import { useGroupedSessions } from './useSessionViews';

/**
 * The session sidebar.
 *
 * Slides in from the left and covers part of the screen, because that is what a sidebar is.
 *
 * Two things device testing caught, both about the panel's edges rather than its contents:
 *
 * - **It ran under the status bar.** The panel is inside a `statusBarTranslucent` modal, so it draws behind the
 *   clock and the notification icons unless it pads itself by the top inset. `SafeAreaView` would have worked for
 *   the panel alone, but the padding has to be on the animated container, so the inset is applied directly.
 * - **The dimmed strip beside it is gone.** A scrim is the usual way to say "this is temporary", but it was read
 *   as a shadow rather than as an affordance. The uncovered strip is still tappable to dismiss — it just is not
 *   tinted, so the boundary is the panel's own border.
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
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const groups = useGroupedSessions();
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const open = useSessionStore((state) => state.open);
  const startNew = useSessionStore((state) => state.startNew);
  const remove = useSessionStore((state) => state.remove);

  const [busy, setBusy] = useState(false);

  const width = Math.min(
    Math.round(Dimensions.get('window').width * WIDTH_FRACTION),
    MAX_SIDEBAR_WIDTH,
  );

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
      {/* The modal is translucent over the status bar, so the bar's own content has to be legible against the
          panel rather than against whatever was behind it. */}
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      />

      <Animated.View
        style={{
          width,
          // The fix for the overflow: without this the panel's header sits under the clock.
          paddingTop: insets.top + theme.spacing[2],
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) },
          ],
        }}
        className="border-r border-border bg-background"
      >
        <View className="flex-row items-center gap-2 border-b border-border px-3 pb-3">
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
            paddingBottom: insets.bottom + theme.spacing[6],
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
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                Recent chats
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start a new conversation"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void onNew()}
                style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}
                className="items-center justify-center"
              >
                <PlusIcon size={18} color={busy ? theme.colors.textMuted : theme.colors.primary} />
              </Pressable>
            </View>

            {groups.length === 0 ? (
              <Text className="py-4 text-center text-xs text-text-muted">
                No conversations yet.
              </Text>
            ) : (
              groups.map((group) => (
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
