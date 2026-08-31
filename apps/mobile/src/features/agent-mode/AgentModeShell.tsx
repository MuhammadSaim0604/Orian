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
  const navigate = useShellStore((state) => state.navigateAgent);

  const initialise = useSessionStore((state) => state.initialise);
  const sidebarOpen = useSessionStore((state) => state.sidebarOpen);
  const setSidebarOpen = useSessionStore((state) => state.setSidebarOpen);

  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  /**
   * Onboarding, as a screen inside the mode.
   *
   * Local state rather than a shell route, because the shell's `AgentRoute` union is part of the navigation
   * contract and this is a detour rather than a destination — `back()` from here should return to the chat, which
   * is what local state gives without teaching the route store a new case.
   *
   * Deliberately **not** `resetOnboarding()`, which would send the user through welcome and the mode switcher and
   * lose the conversation they were in.
   */
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    // Loads the session list and opens the most recent, creating one if there are none. Runs on entering the mode
    // rather than on mounting the chat, so the conversation is ready before the first paint of it.
    void initialise('agent');
  }, [initialise]);

  /**
   * Which way a transition should read.
   *
   * Chat is the mode's home, so anything leaving it goes forward and anything returning goes back. The onboarding
   * detour is keyed in as its own screen, or moving to it would reuse the chat's transition and not animate.
   */
  const screen = onboardingOpen ? 'onboarding' : route.kind;
  const direction = screen === 'chat' || screen === 'sessions' ? 'backward' : 'forward';
  const transition = useHorizontalTransition(screen, direction);

  const closeSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  return (
    <View className="flex-1 bg-background">
      <Animated.View className="flex-1" style={transition}>
        {onboardingOpen ? (
          <PermissionSetupScreen
            onContinue={() => setOnboardingOpen(false)}
            onBack={() => setOnboardingOpen(false)}
          />
        ) : route.kind === 'settings' ? (
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

      {/* Transparent, so the sidebar covers part of the screen and the rest stays tappable to dismiss.
          `animationType="none"` because the panel animates itself; letting the modal slide too would produce two
          competing motions. `statusBarTranslucent` so the panel can pad itself by the top inset and draw its own
          header there rather than being pushed below the clock. */}
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
    </View>
  );
};
