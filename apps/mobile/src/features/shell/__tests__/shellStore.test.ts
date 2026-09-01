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
    agentStack: [],
    workflowStack: [],
    onboardingComplete: false,
    lastMode: null,
    themePreference: null,
    transitioning: false,
    navDirection: 'forward',
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

/**
 * The back stack.
 *
 * Both of these were reported from the device, and both were the absence of a stack rather than a bug in one:
 * back from the tools screen went to the **mode switcher**, and the transition into it animated the wrong way.
 * `back()` reset to home, which is only correct when home is where you came from.
 */
describe('the back stack', () => {
  const enterAgent = () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('agent');
  };

  it('returns from tools to the settings screen it was opened from', () => {
    // The reported case. Settings → tools → back should be settings, not the switcher.
    enterAgent();
    useShellStore.getState().pushAgent({ kind: 'settings' });
    useShellStore.getState().pushAgent({ kind: 'tools' });

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().agentRoute).toEqual({ kind: 'settings' });
  });

  it('then returns from settings to the chat', () => {
    enterAgent();
    useShellStore.getState().pushAgent({ kind: 'settings' });
    useShellStore.getState().pushAgent({ kind: 'tools' });

    useShellStore.getState().back();
    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().agentRoute).toEqual(AGENT_HOME);
  });

  it('returns from onboarding to the chat rather than the switcher', () => {
    // The other reported case. Onboarding is a route now precisely so `back()` can see it — as local component
    // state it was invisible here and the press fell through to the mode case.
    enterAgent();
    useShellStore.getState().pushAgent({ kind: 'onboarding' });

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().agentRoute).toEqual(AGENT_HOME);
    expect(useShellStore.getState().route).toEqual({ kind: 'mode', mode: 'agent' });
  });

  it('leaves the mode only once the stack is empty', () => {
    enterAgent();
    useShellStore.getState().pushAgent({ kind: 'settings' });

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().route).toEqual({ kind: 'mode', mode: 'agent' });

    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().route).toEqual({ kind: 'switcher' });
  });

  it('clears the stack on leaving the mode', () => {
    // A stack that survived would let a later back press walk into a mode the user had left.
    enterAgent();
    useShellStore.getState().pushAgent({ kind: 'settings' });
    useShellStore.getState().goToSwitcher();

    expect(useShellStore.getState().agentStack).toEqual([]);
  });

  it('clears the stack on entering a mode', () => {
    enterAgent();
    useShellStore.getState().pushAgent({ kind: 'settings' });
    useShellStore.getState().enterMode('agent');

    expect(useShellStore.getState().agentStack).toEqual([]);
    expect(useShellStore.getState().agentRoute).toEqual(AGENT_HOME);
  });

  it('does not stack a lateral move', () => {
    // `navigateAgent` replaces rather than pushes, for a move where the screen being left is not somewhere back
    // should return to.
    enterAgent();
    useShellStore.getState().navigateAgent({ kind: 'settings' });

    expect(useShellStore.getState().agentStack).toEqual([]);
  });

  it('keeps a workflow stack of its own', () => {
    // ADR 0011: the two modes share no navigation. One stack would let a back press cross between them.
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('workflow');
    useShellStore.getState().pushWorkflow({ kind: 'canvas' });

    expect(useShellStore.getState().agentStack).toEqual([]);
    expect(useShellStore.getState().back()).toBe(true);
    expect(useShellStore.getState().workflowRoute).toEqual(WORKFLOW_HOME);
  });
});

/**
 * Transition direction.
 *
 * The second reported bug: leaving the tools screen animated right-to-left, like a push. Direction used to be
 * derived from *which* screen was showing — anything that was not home counted as forward — and settings is not
 * home either, so returning to it looked like going deeper.
 */
describe('transition direction', () => {
  it('is forward when pushing', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().pushAgent({ kind: 'settings' });

    expect(useShellStore.getState().navDirection).toBe('forward');
  });

  it('is backward when popping', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().pushAgent({ kind: 'settings' });
    useShellStore.getState().pushAgent({ kind: 'tools' });

    useShellStore.getState().back();

    expect(useShellStore.getState().navDirection).toBe('backward');
  });

  it('is backward when leaving a mode', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().enterMode('agent');
    useShellStore.getState().goToSwitcher();

    expect(useShellStore.getState().navDirection).toBe('backward');
  });

  it('is backward when leaving root settings', () => {
    useShellStore.getState().completeOnboarding();
    useShellStore.getState().openRootSettings();
    expect(useShellStore.getState().navDirection).toBe('forward');

    useShellStore.getState().back();
    expect(useShellStore.getState().navDirection).toBe('backward');
  });
});
