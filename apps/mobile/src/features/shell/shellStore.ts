import { create } from 'zustand';

import {
  type AppMode,
  type ThemePreference,
  readPreferencesSync,
  writeLastMode,
  writeOnboardingComplete,
  writeThemePreference,
} from './preferences';

/**
 * The shell's navigation state.
 *
 * A typed route store rather than react-navigation (ADR 0015). The decisive reason is that
 * ADR 0011 requires the two modes to share no navigation: with one navigator, keeping two
 * parallel stacks honest is a discipline problem, but with a discriminated union per mode an
 * Agent Mode route in Workflow Mode is a **type error**. The rule enforces itself.
 *
 * It also means routing is readable from the overlay windows, which are separate React roots and
 * reach app state only through the store modules they import — a navigator's state lives inside
 * its own React tree, which the overlays are not part of.
 */

/** Where the shell is, at the top level. */
export type ShellRoute =
  | { readonly kind: 'onboarding' }
  /** The mode switcher. This is "home" — where the user returns, not a splash screen. */
  | { readonly kind: 'switcher' }
  | { readonly kind: 'rootSettings' }
  | { readonly kind: 'mode'; readonly mode: AppMode };

/** Routes inside Agent Mode. Step 4 fills these in. */
export type AgentRoute =
  | { readonly kind: 'chat' }
  | { readonly kind: 'sessions' }
  | { readonly kind: 'tools' }
  | { readonly kind: 'settings' };

/** Routes inside Workflow Mode. Steps 6–10 fill these in. */
export type WorkflowRoute =
  | { readonly kind: 'list' }
  | { readonly kind: 'loading'; readonly workflowId: string }
  | { readonly kind: 'canvas' }
  | { readonly kind: 'builderAgent' }
  | { readonly kind: 'runs' }
  | { readonly kind: 'reviewTrace'; readonly traceId: string }
  | { readonly kind: 'settings' };

/** Each mode's home. Entering a mode always lands here. */
export const AGENT_HOME: AgentRoute = { kind: 'chat' };
export const WORKFLOW_HOME: WorkflowRoute = { kind: 'list' };

export type ShellState = {
  readonly route: ShellRoute;
  /** Agent Mode's own route, held even while Workflow Mode is active. */
  readonly agentRoute: AgentRoute;
  readonly workflowRoute: WorkflowRoute;
  readonly onboardingComplete: boolean;
  /** The mode last used, for highlighting on the switcher. Never restored as a route. */
  readonly lastMode: AppMode | null;
  /** An explicit theme choice, or null to follow the system setting. */
  readonly themePreference: ThemePreference;
  /** True while a mode transition animation is running. */
  readonly transitioning: boolean;
};

export type ShellActions = {
  completeOnboarding: () => void;
  /** Re-runs onboarding. Used by "reset" in settings. */
  resetOnboarding: () => void;

  enterMode: (mode: AppMode) => void;
  /** Leaves the current mode for the switcher, resetting that mode's route. */
  goToSwitcher: () => void;
  openRootSettings: () => void;
  /** Switches directly to the other mode, from inside a mode's settings. */
  switchMode: () => void;

  navigateAgent: (route: AgentRoute) => void;
  navigateWorkflow: (route: WorkflowRoute) => void;

  setThemePreference: (theme: ThemePreference) => void;
  setTransitioning: (transitioning: boolean) => void;

  /** Where the Android back button goes, or null when there is nowhere to go. */
  back: () => boolean;
};

/**
 * Seeds from preferences synchronously.
 *
 * A first paint that guesses wrong shows the mode switcher to someone who has granted nothing, or
 * the welcome screen to someone who finished onboarding weeks ago. One blocking read is cheaper
 * than either.
 */
const initialState = (): ShellState => {
  const preferences = readPreferencesSync();

  return {
    route: preferences.onboardingComplete ? { kind: 'switcher' } : { kind: 'onboarding' },
    agentRoute: AGENT_HOME,
    workflowRoute: WORKFLOW_HOME,
    onboardingComplete: preferences.onboardingComplete,
    lastMode: preferences.lastMode,
    themePreference: preferences.themePreference,
    transitioning: false,
  };
};

export const useShellStore = create<ShellState & ShellActions>((set, get) => ({
  ...initialState(),

  completeOnboarding: () => {
    set({ onboardingComplete: true, route: { kind: 'switcher' } });
    // Persisted fire-and-forget: the UI has already moved on, and a failed write means
    // onboarding runs once more rather than anything being lost.
    void writeOnboardingComplete(true);
  },

  resetOnboarding: () => {
    set({ onboardingComplete: false, route: { kind: 'onboarding' } });
    void writeOnboardingComplete(false);
  },

  enterMode: (mode) => {
    // Each mode always opens at its home. The in-mode route is deliberately not restored:
    // reopening into a canvas whose workflow may have changed on disk is a bug waiting to happen.
    set({
      route: { kind: 'mode', mode },
      lastMode: mode,
      agentRoute: mode === 'agent' ? AGENT_HOME : get().agentRoute,
      workflowRoute: mode === 'workflow' ? WORKFLOW_HOME : get().workflowRoute,
    });

    void writeLastMode(mode);
  },

  goToSwitcher: () => {
    const current = get().route;

    // Leaving a mode resets its route, so returning later starts clean rather than in whatever
    // half-finished state it was abandoned in.
    set({
      route: { kind: 'switcher' },
      agentRoute:
        current.kind === 'mode' && current.mode === 'agent' ? AGENT_HOME : get().agentRoute,
      workflowRoute:
        current.kind === 'mode' && current.mode === 'workflow'
          ? WORKFLOW_HOME
          : get().workflowRoute,
    });
  },

  openRootSettings: () => set({ route: { kind: 'rootSettings' } }),

  switchMode: () => {
    const current = get().route;

    // Only meaningful from inside a mode. Called from anywhere else it does nothing rather than
    // guessing which mode to switch away from.
    if (current.kind !== 'mode') return;

    get().enterMode(current.mode === 'agent' ? 'workflow' : 'agent');
  },

  navigateAgent: (route) => set({ agentRoute: route }),

  navigateWorkflow: (route) => set({ workflowRoute: route }),

  setThemePreference: (theme) => {
    set({ themePreference: theme });
    void writeThemePreference(theme);
  },

  setTransitioning: (transitioning) => set({ transitioning }),

  /**
   * Handles the Android back button.
   *
   * Returns whether the press was consumed. Owning this explicitly is the cost of not using a
   * navigator (ADR 0015), and it is the part most likely to be got wrong — so every route says
   * where back goes, and the default is to let the system handle it rather than trap the user.
   */
  back: () => {
    const { route, agentRoute, workflowRoute } = get();

    switch (route.kind) {
      case 'onboarding':
        // Never trap the user in onboarding, but never skip it either: the system default
        // backgrounds the app, which is the honest behaviour.
        return false;

      case 'switcher':
        // Home. Back exits the app.
        return false;

      case 'rootSettings':
        set({ route: { kind: 'switcher' } });
        return true;

      case 'mode': {
        if (route.mode === 'agent') {
          if (agentRoute.kind === AGENT_HOME.kind) {
            get().goToSwitcher();
            return true;
          }
          set({ agentRoute: AGENT_HOME });
          return true;
        }

        if (workflowRoute.kind === WORKFLOW_HOME.kind) {
          get().goToSwitcher();
          return true;
        }
        set({ workflowRoute: WORKFLOW_HOME });
        return true;
      }
    }
  },
}));

/** Narrow selectors, so a screen does not re-render when an unrelated part of the shell changes. */
export const selectRoute = (state: ShellState): ShellRoute => state.route;

export const selectAgentRoute = (state: ShellState): AgentRoute => state.agentRoute;

export const selectWorkflowRoute = (state: ShellState): WorkflowRoute => state.workflowRoute;

/** The mode currently active, or null when the shell is outside a mode. */
export const selectActiveMode = (state: ShellState): AppMode | null =>
  state.route.kind === 'mode' ? state.route.mode : null;
