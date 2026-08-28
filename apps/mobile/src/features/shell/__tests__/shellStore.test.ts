import { AGENT_HOME, WORKFLOW_HOME, selectActiveMode, useShellStore } from '../shellStore';

/**
 * The shell's navigation rules.
 *
 * These are the rules that decide what the user sees when they open the app and where they land when
 * they move between modes. Testing them as store assertions rather than through rendering is one of
 * the reasons a route store was chosen over a navigator (ADR 0015).
 *
 * The native preferences module is absent under Jest, so `readPreferencesSync` falls back to
 * defaults — which means every test starts from a fresh install. That is the state most worth
 * getting right.
 */

const reset = () => {
  useShellStore.setState({
    route: { kind: 'onboarding' },
    agentRoute: AGENT_HOME,
    workflowRoute: WORKFLOW_HOME,
    onboardingComplete: false,
    lastMode: null,
    themePreference: null,
    transitioning: false,
  });
};

beforeEach(reset);

describe('the onboarding gate', () => {
  it('starts a fresh install in onboarding, not the canvas', () => {
    // The defect this closes: the old shell opened straight onto the workflow list with no
    // permissions granted and nothing explained.
    expect(useShellStore.getState().route).toEqual({ kind: 'onboarding' });
  });

  it('moves to the mode switcher when onboarding completes', () => {
    useShellStore.getState().completeOnboarding();

    expect(useShellStore.getState().onboardingComplete).toBe(true);
    expect(useShellStore.getState().route).toEqual({ kind: 'switcher' });
  });

  it('can send the user back through onboarding', () => {
    // "Run setup again" in root settings.
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().resetOnboarding();

    expect(useShellStore.getState().onboardingComplete).toBe(false);
    expect(useShellStore.getState().route).toEqual({ kind: 'onboarding' });
  });
});

describe('entering a mode', () => {
  beforeEach(() => useShellStore.getState().completeOnboarding());

  it('replaces the top-level route rather than nesting inside the switcher', () => {
    useShellStore.getState().enterMode('agent');

    expect(useShellStore.getState().route).toEqual({ kind: 'mode', mode: 'agent' });
  });

  it('remembers the mode as last used', () => {
    useShellStore.getState().enterMode('workflow');

    expect(useShellStore.getState().lastMode).toBe('workflow');
  });

  it('always lands on that mode’s home', () => {
    // Deliberately not restored: reopening into a canvas whose workflow may have changed on disk
    // is a bug waiting to happen.
    useShellStore.getState().enterMode('workflow');
    useShellStore.getState().navigateWorkflow({ kind: 'canvas' });
    useShellStore.getState().goToSwitcher();
    useShellStore.getState().enterMode('workflow');

    expect(useShellStore.getState().workflowRoute).toEqual(WORKFLOW_HOME);
  });

  it('does not disturb the other mode’s route', () => {
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().navigateAgent({ kind: 'settings' });
    useShellStore.getState().enterMode('workflow');

    // Held rather than cleared: entering workflow mode says nothing about agent mode.
    expect(useShellStore.getState().agentRoute).toEqual({ kind: 'settings' });
  });

  it('reports the active mode', () => {
    useShellStore.getState().enterMode('agent');

    expect(selectActiveMode(useShellStore.getState())).toBe('agent');
  });

  it('reports no active mode outside a mode', () => {
    expect(selectActiveMode(useShellStore.getState())).toBeNull();
  });
});

describe('leaving a mode', () => {
  beforeEach(() => useShellStore.getState().completeOnboarding());

  it('returns to the switcher', () => {
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().goToSwitcher();

    expect(useShellStore.getState().route).toEqual({ kind: 'switcher' });
  });

  it('resets the route of the mode being left', () => {
    // So returning later starts clean rather than in whatever half-finished state it was
    // abandoned in.
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().navigateAgent({ kind: 'settings' });
    useShellStore.getState().goToSwitcher();

    expect(useShellStore.getState().agentRoute).toEqual(AGENT_HOME);
  });

  it('keeps the last-used mode for the switcher to highlight', () => {
    useShellStore.getState().enterMode('workflow');
    useShellStore.getState().goToSwitcher();

    expect(useShellStore.getState().lastMode).toBe('workflow');
  });
});

describe('switching directly between modes', () => {
  beforeEach(() => useShellStore.getState().completeOnboarding());

  it('goes from agent to workflow', () => {
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().switchMode();

    expect(useShellStore.getState().route).toEqual({ kind: 'mode', mode: 'workflow' });
  });

  it('goes from workflow to agent', () => {
    useShellStore.getState().enterMode('workflow');
    useShellStore.getState().switchMode();

    expect(useShellStore.getState().route).toEqual({ kind: 'mode', mode: 'agent' });
  });

  it('does nothing when not inside a mode', () => {
    // Rather than guessing which mode to switch away from.
    useShellStore.getState().switchMode();

    expect(useShellStore.getState().route).toEqual({ kind: 'switcher' });
  });

  it('lands on the new mode’s home', () => {
    useShellStore.getState().enterMode('workflow');
    useShellStore.getState().navigateWorkflow({ kind: 'canvas' });
    useShellStore.getState().switchMode();
    useShellStore.getState().switchMode();

    expect(useShellStore.getState().workflowRoute).toEqual(WORKFLOW_HOME);
  });
});

describe('root settings', () => {
  it('opens from the switcher', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().openRootSettings();

    expect(useShellStore.getState().route).toEqual({ kind: 'rootSettings' });
  });

  it('records an explicit theme choice', () => {
    useShellStore.getState().setThemePreference('dark');

    expect(useShellStore.getState().themePreference).toBe('dark');
  });

  it('can go back to following the system theme', () => {
    useShellStore.getState().setThemePreference('dark');
    useShellStore.getState().setThemePreference(null);

    expect(useShellStore.getState().themePreference).toBeNull();
  });
});

describe('the Android back button', () => {
  it('is not consumed during onboarding', () => {
    // Never trap the user in onboarding, but never skip it either — the system default
    // backgrounds the app, which is honest.
    expect(useShellStore.getState().back()).toBe(false);
  });

  it('is not consumed at the switcher, so back exits the app', () => {
    useShellStore.getState().completeOnboarding();

    expect(useShellStore.getState().back()).toBe(false);
  });

  it('returns from root settings to the switcher', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().openRootSettings();

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().route).toEqual({ kind: 'switcher' });
  });

  it('returns to a mode’s home from a deeper route', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().navigateAgent({ kind: 'settings' });

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().agentRoute).toEqual(AGENT_HOME);
    expect(useShellStore.getState().route).toEqual({ kind: 'mode', mode: 'agent' });
  });

  it('leaves the mode when already at its home', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('agent');

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().route).toEqual({ kind: 'switcher' });
  });

  it('does the same for workflow mode', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('workflow');
    useShellStore.getState().navigateWorkflow({ kind: 'canvas' });

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().workflowRoute).toEqual(WORKFLOW_HOME);

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().route).toEqual({ kind: 'switcher' });
  });
});

describe('in-mode navigation', () => {
  it('carries a trace id rather than a trace object', () => {
    // So arriving from Agent Mode does not push a large object through shell state, and a trace
    // deleted in between reports "no longer exists" instead of showing stale content.
    useShellStore.getState().navigateWorkflow({ kind: 'reviewTrace', traceId: 'trace_1' });

    expect(useShellStore.getState().workflowRoute).toEqual({
      kind: 'reviewTrace',
      traceId: 'trace_1',
    });
  });

  it('carries a workflow id into the loading route', () => {
    useShellStore.getState().navigateWorkflow({ kind: 'loading', workflowId: 'wf_1' });

    expect(useShellStore.getState().workflowRoute).toEqual({
      kind: 'loading',
      workflowId: 'wf_1',
    });
  });
});
