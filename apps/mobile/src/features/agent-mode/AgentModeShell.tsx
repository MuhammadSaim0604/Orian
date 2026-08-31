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
 * Its own navigation, deliberately separate from Workflow Mode's (ADR 0011). The temptation is one shared
 * stack with a `mode` prop, which rebuilds the tab bar with extra steps and makes the two modes peers again.
 *
 * Screens inside the mode slide **horizontally**, because this is navigation within one product. Entering a
 * mode still rises from the bottom, since that replaces the whole interface — two motions for two different
 * kinds of change.
 *
 * The sidebar and the model picker are modals rather than routes. Both are panels over the conversation, and
 * making either a route would have the Android back button dismiss it by navigating — which would also unmount
 * the chat and lose its scroll position.
 */
export const AgentModeShell = () => {
  const route = useShellStore((state) => state.agentRoute);
  const navigate = useShellStore((state) => state.navigateAgent);

  const initialise = useSessionStore((state) => state.initialise);
  const sidebarOpen = useSessionStore((state) => state.sidebarOpen);
  const setSidebarOpen = useSessionStore((state) => state.setSidebarOpen);

  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  /**
   * Onboarding shown as a modal rather than by resetting the shell route.
   *
   * `resetOnboarding()` would send the user back through the welcome screen and the mode switcher, losing the
   * conversation they were in. What they asked for from a sidebar labelled "Onboarding" is the permission
   * screen — so that screen is shown over the mode, and closing it returns them exactly where they were.
   */
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    // Loads the session list and opens the most recent, creating one if there are none. Runs on entering the
    // mode rather than on mounting the chat, so the conversation is ready before the first paint of it.
    void initialise('agent');
  }, [initialise]);

  /**
   * Which way a transition should read.
   *
   * Chat is the mode's home, so anything leaving it is going forward and anything returning to it is going back.
   * Getting this the wrong way round is subtle but immediately wrong to use.
   */
  const direction = route.kind === 'chat' || route.kind === 'sessions' ? 'backward' : 'forward';
  const transition = useHorizontalTransition(route.kind, direction);

  const closeSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  return (
    <View className="flex-1 bg-background">
      <Animated.View className="flex-1" style={transition}>
        {route.kind === 'settings' ? (
          <AgentSettingsScreen
            onBack={() => navigate({ kind: 'chat' })}
            onOpenTools={() => navigate({ kind: 'tools' })}
          />
        ) : route.kind === 'tools' ? (
          <AgentToolsScreen onBack={() => navigate({ kind: 'settings' })} />
        ) : (
          // `sessions` falls through to the chat, because the session list is a panel rather than a screen. The
          // route is kept in the union so a future wide-screen layout could render it inline.
          <AgentChatScreen
            onOpenSessions={() => setSidebarOpen(true)}
            onOpenModelPicker={() => setModelPickerOpen(true)}
          />
        )}
      </Animated.View>

      {/* Transparent, so the sidebar can cover part of the screen and leave the conversation visible behind the
          scrim — which is what makes tapping outside to dismiss discoverable. `animationType="none"` because the
          panel animates itself; letting the modal slide too would produce two competing motions. */}
      <Modal
        visible={sidebarOpen}
        transparent
        animationType="none"
        onRequestClose={closeSidebar}
        statusBarTranslucent
      >
        <SessionSidebar
          onClose={closeSidebar}
          onOpenOnboarding={() => setOnboardingOpen(true)}
          onOpenSettings={() => navigate({ kind: 'settings' })}
        />
      </Modal>

      <ModelPickerSheet visible={modelPickerOpen} onClose={() => setModelPickerOpen(false)} />

      {/* The same screen that follows the welcome screen, shown over the mode.

          Not `resetOnboarding()`, which would send the user back through welcome and the mode switcher and lose
          the conversation they were in. What a sidebar entry called "Onboarding" promises is the permission
          screen, so that is what opens - and closing it returns them exactly where they were. */}
      <Modal
        visible={onboardingOpen}
        animationType="slide"
        onRequestClose={() => setOnboardingOpen(false)}
      >
        <PermissionSetupScreen
          onContinue={() => setOnboardingOpen(false)}
          onBack={() => setOnboardingOpen(false)}
        />
      </Modal>
    </View>
  );
};
