import { act } from '@testing-library/react-native';

import { renderWithTheme } from '../../../test/renderWithTheme';
import { AgentModeShell } from '../../agent-mode/AgentModeShell';
import { AGENT_HOME, WORKFLOW_HOME, useShellStore } from '../../shell/shellStore';
import { WorkflowModeShell } from '../../workflow-mode/WorkflowModeShell';

/**
 * Each mode's settings screen.
 *
 * The requirement being protected is small but explicit: both modes' settings end with _switch to
 * the other mode_ and _back to home_. Those two actions are what make the mode switcher a real
 * destination rather than a one-way door.
 */

/** Renders and lets the capability-status read settle, so no assertion races a pending update. */
const renderSettled = async (element: Parameters<typeof renderWithTheme>[0]) => {
  const result = renderWithTheme(element);
  await act(async () => {
    await Promise.resolve();
  });
  return result;
};

const enterAgentSettings = () => {
  useShellStore.setState({
    route: { kind: 'mode', mode: 'agent' },
    agentRoute: { kind: 'settings' },
    workflowRoute: WORKFLOW_HOME,
    onboardingComplete: true,
    lastMode: 'agent',
    themePreference: null,
    transitioning: false,
  });
};

const enterWorkflowSettings = () => {
  useShellStore.setState({
    route: { kind: 'mode', mode: 'workflow' },
    agentRoute: AGENT_HOME,
    workflowRoute: { kind: 'settings' },
    onboardingComplete: true,
    lastMode: 'workflow',
    themePreference: null,
    transitioning: false,
  });
};

describe('Agent Mode settings', () => {
  beforeEach(enterAgentSettings);

  it('names itself as applying to one mode only', async () => {
    const { getByText } = await renderSettled(<AgentModeShell />);

    expect(getByText('Applies to Agent Mode only')).toBeTruthy();
  });

  it('offers a switch to the other mode, by name', async () => {
    const { getByText } = await renderSettled(<AgentModeShell />);

    expect(getByText('Switch to Workflow Mode')).toBeTruthy();
  });

  it('offers a route back to home', async () => {
    const { getByText } = await renderSettled(<AgentModeShell />);

    expect(getByText('Back to home')).toBeTruthy();
  });

  it('shows automation capability state, which used to be its own tab', async () => {
    // Issue A3: a user whose automation is not running needs to see the missing grant, and mode
    // settings is where they would look.
    const { getByText } = await renderSettled(<AgentModeShell />);

    expect(getByText('Device automation')).toBeTruthy();
  });

  it('points at the shared provider registry rather than duplicating it', async () => {
    // Step 4 replaced the "configured once and shared" note with a route to the registry itself. The registry
    // stays root-level because both modes use it (issue A5), so this screen must link to it and never show a
    // second copy that could disagree.
    const { getByText } = await renderSettled(<AgentModeShell />);

    expect(getByText('Providers')).toBeTruthy();
  });

  it('offers the tools page, so a tool can be switched off', async () => {
    // Issue B4: the user could not previously see which tools existed, let alone disable one.
    const { getByText } = await renderSettled(<AgentModeShell />);

    expect(getByText('Manage tools')).toBeTruthy();
  });

  it('exposes the run limits, which are the user’s protection', async () => {
    // A confused model driving someone's phone is the worst failure this product can have. Steps and time are
    // the two ceilings a person can reason about without knowing anything about the loop.
    const { getByText } = await renderSettled(<AgentModeShell />);

    expect(getByText('Maximum steps')).toBeTruthy();
    expect(getByText('Time limit')).toBeTruthy();
  });
});

describe('Workflow Mode settings', () => {
  beforeEach(enterWorkflowSettings);

  it('names itself as applying to one mode only', async () => {
    const { getByText } = await renderSettled(<WorkflowModeShell />);

    expect(getByText('Applies to Workflow Mode only')).toBeTruthy();
  });

  it('offers a switch to the other mode, by name', async () => {
    const { getByText } = await renderSettled(<WorkflowModeShell />);

    expect(getByText('Switch to Agent Mode')).toBeTruthy();
  });

  it('offers a route back to home', async () => {
    const { getByText } = await renderSettled(<WorkflowModeShell />);

    expect(getByText('Back to home')).toBeTruthy();
  });

  it('shows automation capability state', async () => {
    const { getByText } = await renderSettled(<WorkflowModeShell />);

    expect(getByText('Device automation')).toBeTruthy();
  });
});
