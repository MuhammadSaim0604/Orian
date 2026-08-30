import { useEffect } from 'react';
import { Modal, View } from 'react-native';

import { AgentChatScreen } from '../agent/AgentChatScreen';
import { AgentSettingsScreen } from '../agent/AgentSettingsScreen';
import { AgentToolsScreen } from '../agent/AgentToolsScreen';
import { SessionSidebar } from '../agent/SessionSidebar';
import { useSessionStore } from '../agent/sessionStore';
import { useShellStore } from '../shell/shellStore';

/**
 * Agent Mode.
 *
 * Its own navigation, deliberately separate from Workflow Mode's (ADR 0011). The temptation is one shared
 * stack with a `mode` prop, which rebuilds the tab bar with extra steps and makes the two modes peers again.
 *
 * Step 4 fills in what the mode is meant to be: a chat with persisted sessions, a tools page, and its own
 * settings. The routes already existed in `shellStore`, unrendered, so this adds screens rather than reshaping
 * navigation.
 *
 * The sidebar is a `Modal` rather than a route. It is a panel over the conversation, and making it a route
 * would mean the Android back button dismissed it by navigating — which would also unmount the chat and lose
 * its scroll position.
 */
export const AgentModeShell = () => {
  const route = useShellStore((state) => state.agentRoute);
  const navigate = useShellStore((state) => state.navigateAgent);
  const openRootSettings = useShellStore((state) => state.openRootSettings);

  const initialise = useSessionStore((state) => state.initialise);
  const sidebarOpen = useSessionStore((state) => state.sidebarOpen);
  const setSidebarOpen = useSessionStore((state) => state.setSidebarOpen);

  useEffect(() => {
    // Loads the session list and opens the most recent, creating one if there are none. Runs on entering the
    // mode rather than on mounting the chat, so the conversation is ready before the first paint of it.
    void initialise('agent');
  }, [initialise]);

  return (
    <View className="flex-1 bg-background">
      {route.kind === 'settings' ? (
        <AgentSettingsScreen
          onBack={() => navigate({ kind: 'chat' })}
          onOpenTools={() => navigate({ kind: 'tools' })}
          onOpenProviders={openRootSettings}
        />
      ) : route.kind === 'tools' ? (
        <AgentToolsScreen onBack={() => navigate({ kind: 'settings' })} />
      ) : (
        // `sessions` falls through to the chat, because the session list is a panel rather than a screen. The
        // route is kept in the union so a future wide-screen layout could render it inline.
        <AgentChatScreen
          onOpenSessions={() => setSidebarOpen(true)}
          onOpenSettings={() => navigate({ kind: 'settings' })}
        />
      )}

      <Modal
        visible={sidebarOpen}
        animationType="slide"
        onRequestClose={() => setSidebarOpen(false)}
        transparent={false}
      >
        <SessionSidebar onClose={() => setSidebarOpen(false)} />
      </Modal>
    </View>
  );
};
