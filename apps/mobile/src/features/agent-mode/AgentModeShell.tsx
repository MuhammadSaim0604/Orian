import { useCallback, useEffect, useState } from 'react';
import { Animated, Modal, View } from 'react-native';

import { AgentChatScreen } from '../agent/AgentChatScreen';
import { AgentSettingsScreen } from '../agent/AgentSettingsScreen';
import { AgentToolsScreen } from '../agent/AgentToolsScreen';
import { SessionSidebar } from '../agent/SessionSidebar';
import { useSessionStore } from '../agent/sessionStore';
import { PermissionSetupScreen } from '../onboarding/PermissionSetupScreen';
import { ModelPickerSheet } from '../providers/ModelPickerSheet';
import { useShellStore } from '../shell/shellStore';
import { useHorizontalTransition } from '../shell/useHorizontalTransition';

/**
 * Agent Mode.
 *
 * Its own navigation, deliberately separate from Workflow Mode's (ADR 0011). The temptation is one shared stack
 * with a `mode` prop, which rebuilds the tab bar with extra steps and makes the two modes peers again.
 *
 * Screens inside the mode slide **horizontally**, because this is navigation within one product. Entering a mode
 * still rises from the bottom, since that replaces the whole interface — two motions for two kinds of change.
 *
 * Onboarding is a screen, not a dialog, and device testing caught that it was behaving as one: it rose from the
 * bottom with a dimmed status bar above it. It is now a route within the mode, so it slides in horizontally like
 * every other screen and owns the full height including the status bar area.
 *
 * The sidebar and the model picker remain modals, because they genuinely are panels over the conversation.
 * Making either a route would have the Android back button dismiss it by navigating, which would also unmount
 * the chat and lose its scroll position.
 */
export const AgentModeShell = () => {
  const route = useShellStore((state) => state.agentRoute);
  const push = useShellStore((state) => state.pushAgent);
  const back = useShellStore((state) => state.back);
  const navDirection = useShellStore((state) => state.navDirection);

  const initialise = useSessionStore((state) => state.initialise);
  const sidebarOpen = useSessionStore((state) => state.sidebarOpen);
  const setSidebarOpen = useSessionStore((state) => state.setSidebarOpen);

  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  useEffect(() => {
    // Loads the session list and opens the most recent, creating one if there are none. Runs on entering the mode
    // rather than on mounting the chat, so the conversation is ready before the first paint of it.
    void initialise('agent');
  }, [initialise]);

  /**
   * Which way the transition reads, taken from the navigation rather than from the destination.
   *
   * This is the fix for the reported wrong-direction bug. Direction used to be derived from *which screen* was
   * being shown — anything that was not the chat counted as forward — so returning from tools to settings slid
   * in from the right like a push. The store now records what the user did, and a pop is always backward.
   */
  const transition = useHorizontalTransition(route.kind, navDirection);

  const closeSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  /** Opens a screen from the sidebar: dismiss the panel, then push, so back returns to the chat. */
  const openFromSidebar = useCallback(
    (target: 'onboarding' | 'settings') => {
      setSidebarOpen(false);
      push({ kind: target });
    },
    [push, setSidebarOpen],
  );

  return (
    <View className="flex-1 bg-background">
      <Animated.View className="flex-1" style={transition}>
        {route.kind === 'onboarding' ? (
          // A route now, not local state. As state the back button could not see it and fell through to the
          // mode's own case, which sent the user to the switcher — the reported bug.
          //
          // Deliberately **not** `resetOnboarding()`, which would send them through welcome and the mode
          // switcher and lose the conversation they were in.
          <PermissionSetupScreen onContinue={back} onBack={back} />
        ) : route.kind === 'settings' ? (
          <AgentSettingsScreen onBack={back} onOpenTools={() => push({ kind: 'tools' })} />
        ) : route.kind === 'tools' ? (
          <AgentToolsScreen onBack={back} />
        ) : (
          // `sessions` falls through to the chat, because the session list is a panel rather than a screen. The
          // route is kept in the union so a future wide-screen layout could render it inline.
          <AgentChatScreen
            onOpenSessions={() => setSidebarOpen(true)}
            onOpenModelPicker={() => setModelPickerOpen(true)}
          />
        )}
      </Animated.View>

      {/* Transparent, so the sidebar covers part of the screen and the rest stays tappable to dismiss.
          `animationType="none"` because the panel animates itself; letting the modal slide too would produce two
          competing motions.

          **No `statusBarTranslucent`.** That prop does not only affect the modal — React Native applies the flag to
          the host activity's *window*, so the whole app went edge-to-edge the moment the sidebar mounted and the
          chat behind it jumped up under the clock, then dropped back on close. It was the cause of three separate
          reported symptoms: the sidebar overflowing the status bar, the chat overflowing behind it, and the
          status-bar-height jolt when opening settings or onboarding. The app's own theme sets a solid
          `statusBarColor`, so nothing here needs the flag at all. */}
      <Modal visible={sidebarOpen} transparent animationType="none" onRequestClose={closeSidebar}>
        <SessionSidebar
          onClose={closeSidebar}
          onOpenOnboarding={() => openFromSidebar('onboarding')}
          onOpenSettings={() => openFromSidebar('settings')}
        />
      </Modal>

      <ModelPickerSheet visible={modelPickerOpen} onClose={() => setModelPickerOpen(false)} />
    </View>
  );
};
