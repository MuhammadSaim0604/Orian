import { act, fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from '../../../test/renderWithTheme';
import { PermissionSetupScreen } from '../../onboarding/PermissionSetupScreen';
import {
  type Capability,
  type CapabilityId,
  type CapabilityTier,
  type GrantMechanism,
} from '../capabilities';
import { useCapabilityStore } from '../capabilityStore';

/**
 * The onboarding permission screen.
 *
 * The behaviour worth protecting is the gate: Continue must not be usable until the required tier is
 * granted, and the screen must say what is still missing rather than presenting a dead button.
 */

const capability = (
  id: CapabilityId,
  tier: CapabilityTier,
  granted: boolean,
  grant: GrantMechanism = 'settings_screen',
): Capability => ({
  id,
  tier,
  grant,
  granted,
  title: `${id} title`,
  explanation: `${id} explanation`,
  consequenceIfDenied: `${id} consequence`,
  requiresSettingsVisit: grant === 'settings_screen',
});

const REQUIRED_IDS: readonly CapabilityId[] = [
  'accessibility',
  'overlay',
  'assistant',
  'usage_access',
  'notifications',
];

const seed = (capabilities: Capability[]) => {
  useCapabilityStore.setState({
    capabilities,
    loading: false,
    requesting: null,
    awaitingSettings: [],
    error: null,
  });
};

const render = async (props?: Partial<Parameters<typeof PermissionSetupScreen>[0]>) => {
  const result = renderWithTheme(
    <PermissionSetupScreen
      onContinue={props?.onContinue ?? jest.fn()}
      onBack={props?.onBack ?? jest.fn()}
    />,
  );

  await act(async () => {
    await Promise.resolve();
  });

  return result;
};

beforeEach(() => useCapabilityStore.getState().reset());

describe('PermissionSetupScreen', () => {
  it('blocks Continue when nothing is granted', async () => {
    seed(REQUIRED_IDS.map((id) => capability(id, 'required', false)));

    const onContinue = jest.fn();
    const { getByLabelText } = await render({ onContinue });

    fireEvent.press(getByLabelText('Continue — allow the required permissions first'));

    expect(onContinue).not.toHaveBeenCalled();
  });

  it('names every permission still missing', async () => {
    seed([
      ...REQUIRED_IDS.slice(0, 3).map((id) => capability(id, 'required', true)),
      capability('usage_access', 'required', false),
      capability('notifications', 'required', false, 'runtime_prompt'),
    ]);

    const { getByText } = await render();

    expect(getByText(/usage_access title, notifications title/)).toBeTruthy();
  });

  it('allows Continue once the required tier is granted', async () => {
    seed(REQUIRED_IDS.map((id) => capability(id, 'required', true)));

    const onContinue = jest.fn();
    const { getByLabelText } = await render({ onContinue });

    fireEvent.press(getByLabelText('Continue to choose a mode'));

    expect(onContinue).toHaveBeenCalled();
  });

  it('does not require optional permissions', async () => {
    seed([
      ...REQUIRED_IDS.map((id) => capability(id, 'required', true)),
      capability('contacts', 'optional', false, 'runtime_prompt'),
    ]);

    const onContinue = jest.fn();
    const { getByLabelText } = await render({ onContinue });

    fireEvent.press(getByLabelText('Continue to choose a mode'));

    expect(onContinue).toHaveBeenCalled();
  });

  it('says optional permissions can be skipped', async () => {
    seed([
      ...REQUIRED_IDS.map((id) => capability(id, 'required', true)),
      capability('contacts', 'optional', false, 'runtime_prompt'),
    ]);

    const { getByText } = await render();

    expect(getByText(/You can skip all of these/)).toBeTruthy();
  });

  it('renders each capability with its own rationale', async () => {
    // The copy comes from the Kotlin registry, so a screen cannot describe a permission differently
    // from the rationale the permission model requires.
    seed([capability('accessibility', 'required', false)]);

    const { getByText } = await render();

    expect(getByText('accessibility title')).toBeTruthy();
    expect(getByText('accessibility explanation')).toBeTruthy();
    expect(getByText('accessibility consequence')).toBeTruthy();
  });

  it('offers a settings route for a capability with no runtime prompt', async () => {
    seed([capability('accessibility', 'required', false)]);

    const { getByLabelText } = await render();

    expect(getByLabelText('Open settings — accessibility title')).toBeTruthy();
  });

  it('offers a plain allow for a runtime-prompted capability', async () => {
    // The wording follows the grant mechanism: "Allow" would be a lie for a settings grant, since
    // pressing it allows nothing.
    seed([capability('contacts', 'optional', false, 'runtime_prompt')]);

    const { getByLabelText } = await render();

    expect(getByLabelText('Allow — contacts title')).toBeTruthy();
  });

  it('offers no action for an already-granted capability', async () => {
    seed([capability('accessibility', 'required', true)]);

    const { queryByLabelText } = await render();

    expect(queryByLabelText('Open settings — accessibility title')).toBeNull();
  });

  it('tells the user to come back after a settings visit', async () => {
    seed([capability('accessibility', 'required', false)]);
    useCapabilityStore.setState({ awaitingSettings: ['accessibility'] });

    const { getByText } = await render();

    expect(getByText(/then come back here/)).toBeTruthy();
  });

  it('reports when permissions cannot be read at all', async () => {
    useCapabilityStore.setState({ error: 'Permissions cannot be read in this build.' });

    const { getByText } = await render();

    expect(getByText('Permissions cannot be read in this build.')).toBeTruthy();
  });
});
