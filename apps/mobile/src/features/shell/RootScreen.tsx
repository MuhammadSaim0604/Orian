import { useTheme } from '@mobile-automation/ui';
import { useEffect } from 'react';
import { BackHandler, StatusBar, View } from 'react-native';

import { AgentModeShell } from '../agent-mode/AgentModeShell';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { WorkflowModeShell } from '../workflow-mode/WorkflowModeShell';

import { ModeSwitcherScreen } from './ModeSwitcherScreen';
import { ModeTransition } from './ModeTransition';
import { RootSettingsScreen } from './RootSettingsScreen';
import { useShellStore } from './shellStore';

/**
 * The app shell.
 *
 * Four top-level destinations — onboarding, the mode switcher, root settings, and a mode — rendered
 * from `shellStore` rather than a navigator (ADR 0015). Each mode owns its own navigation inside its
 * shell, and the two share none of it (ADR 0011).
 *
 * This component does three things and nothing else: it renders the current route, it plays the mode
 * transition, and it owns the Android back button. Everything else belongs to a screen.
 */
export const RootScreen = () => {
  const { theme, scheme } = useTheme();

  const route = useShellStore((state) => state.route);
  const completeOnboarding = useShellStore((state) => state.completeOnboarding);

  useEffect(() => {
    /**
     * The back button is ours to wire, which is the price of not using a navigator.
     *
     * `back()` returns whether it consumed the press; returning false lets Android do its default
     * thing, which is what should happen at the switcher and during onboarding. Trapping the user
     * would be worse than an early exit.
     */
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      useShellStore.getState().back(),
    );

    return () => subscription.remove();
  }, []);

  const statusBar = (
    <StatusBar
      barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      backgroundColor={theme.colors.background}
    />
  );

  return (
    <View className="flex-1 bg-background">
      {statusBar}
      {renderRoute()}
    </View>
  );

  function renderRoute() {
    switch (route.kind) {
      case 'onboarding':
        return <OnboardingFlow onComplete={completeOnboarding} />;

      case 'switcher':
        return <ModeSwitcherScreen />;

      case 'rootSettings':
        return <RootSettingsScreen />;

      case 'mode':
        return (
          // Keyed on the mode so switching replays the animation. Without that, moving between
          // modes would look like a tab switch — which is precisely the impression ADR 0011
          // exists to avoid.
          <ModeTransition transitionKey={route.mode}>
            {route.mode === 'agent' ? <AgentModeShell /> : <WorkflowModeShell />}
          </ModeTransition>
        );
    }
  }
};
