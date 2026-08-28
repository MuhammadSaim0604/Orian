import { act, cleanup, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '../../../test/renderWithTheme';
import { AGENT_HOME, WORKFLOW_HOME, useShellStore } from '../../shell/shellStore';
import { RootScreen } from '../RootScreen';

/**
 * The shell's rendering.
 *
 * What matters here is which screen a given state produces — particularly that a fresh install
 * cannot reach a mode, and that the two modes render genuinely different interfaces rather than one
 * parameterised screen.
 */

/**
 * Renders and lets pending effects settle.
 *
 * Workflow Mode's home reads saved workflows on mount, and the mode transition schedules a timer.
 * Both resolve after the initial render, so without flushing them every assertion races an
 * unfinished update and Jest reports an `act` warning that has nothing to do with the test.
 */
const renderShell = async () => {
  const result = renderWithTheme(<RootScreen />);

  // Two flushes: the first settles the storage read, the second settles any state change that read
  // triggers. One is not enough, and a fixed delay would make the suite slower for no benefit.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return result;
};

const setRoute = (state: Partial<ReturnType<typeof useShellStore.getState>>) => {
  useShellStore.setState({
    route: { kind: 'onboarding' },
    agentRoute: AGENT_HOME,
    workflowRoute: WORKFLOW_HOME,
    onboardingComplete: false,
    lastMode: null,
    themePreference: null,
    transitioning: false,
    ...state,
  });
};

afterEach(() => {
  // Renders are torn down explicitly. A screen left mounted keeps its store subscription, so the
  // next test's `setRoute` updates a component nobody is asserting on — which surfaces as an `act`
  // warning attributed to whichever test happens to run next.
  cleanup();
});

describe('RootScreen', () => {
  it('shows the welcome screen on a fresh install', async () => {
    setRoute({});

    const { getByText } = await renderShell();

    expect(getByText('Automate your phone')).toBeTruthy();
  });

  it('never shows a mode before onboarding is done', async () => {
    setRoute({});

    const { queryByText } = await renderShell();

    expect(queryByText('Workflows')).toBeNull();
    expect(queryByText('Agent')).toBeNull();
  });

  it('shows the mode switcher once onboarding is complete', async () => {
    setRoute({ onboardingComplete: true, route: { kind: 'switcher' } });

    const { getByText } = await renderShell();

    expect(getByText('Agent Mode')).toBeTruthy();
    expect(getByText('Workflow Mode')).toBeTruthy();
  });

  it('offers settings from the switcher', async () => {
    setRoute({ onboardingComplete: true, route: { kind: 'switcher' } });

    const { getByLabelText } = await renderShell();

    expect(getByLabelText('Open settings')).toBeTruthy();
  });

  it('marks the mode the user was last in', async () => {
    // Continuity without routing them automatically.
    setRoute({ onboardingComplete: true, route: { kind: 'switcher' }, lastMode: 'workflow' });

    const { getByText } = await renderShell();

    expect(getByText('Last used')).toBeTruthy();
  });

  it('renders Agent Mode', async () => {
    setRoute({ onboardingComplete: true, route: { kind: 'mode', mode: 'agent' } });

    const { getByLabelText } = await renderShell();

    await waitFor(() => expect(getByLabelText('Agent settings')).toBeTruthy());
  });

  it('renders Workflow Mode', async () => {
    setRoute({ onboardingComplete: true, route: { kind: 'mode', mode: 'workflow' } });

    const { getByLabelText } = await renderShell();

    await waitFor(() => expect(getByLabelText('Workflow settings')).toBeTruthy());
  });

  it('renders two different interfaces, not one parameterised screen', async () => {
    setRoute({ onboardingComplete: true, route: { kind: 'mode', mode: 'agent' } });
    const agent = await renderShell();
    expect(agent.queryByLabelText('Workflow settings')).toBeNull();

    // Unmounted before switching. The shell subscribes to the store, so changing the route while
    // the first render is still mounted updates a component this test is no longer asserting on.
    agent.unmount();

    setRoute({ onboardingComplete: true, route: { kind: 'mode', mode: 'workflow' } });
    const workflow = await renderShell();
    expect(workflow.queryByLabelText('Agent settings')).toBeNull();
  });

  it('has no Status tab', async () => {
    // Deleted in Step 1 — it exposed internal phase state to the user (issue A3).
    setRoute({ onboardingComplete: true, route: { kind: 'switcher' } });

    const { queryByLabelText } = await renderShell();

    expect(queryByLabelText('Status')).toBeNull();
  });

  it('has no Screen Inspector tab', async () => {
    // Deleted because from inside the app it reads our own screen (issue A4).
    setRoute({ onboardingComplete: true, route: { kind: 'mode', mode: 'workflow' } });

    const { queryByLabelText } = await renderShell();

    expect(queryByLabelText('Screen')).toBeNull();
  });

  it('shows root settings', async () => {
    setRoute({ onboardingComplete: true, route: { kind: 'rootSettings' } });

    const { getByText } = await renderShell();

    expect(getByText('Shared by both modes')).toBeTruthy();
  });
});
