import { act } from '@testing-library/react-native';
import { colorScheme } from 'nativewind';

import App from '../../../App';
import { renderWithTheme } from '../../../test/renderWithTheme';
import { RootSettingsScreen } from '../RootSettingsScreen';
import { AGENT_HOME, WORKFLOW_HOME, useShellStore } from '../shellStore';

/**
 * The theme choice.
 *
 * This exists because of a real defect. The preference was applied only to `ThemeProvider`, which
 * feeds `useTheme()` — but nearly every visible colour comes from a `className`, and those resolve
 * through NativeWind's own `colorScheme` observable, which follows the OS until something sets it.
 * So the buttons recorded a choice, the store was correct, and the screen did not change.
 *
 * The assertion that matters is therefore not "the store updated" but **"both systems were told"**.
 */

jest.mock('nativewind', () => ({
  colorScheme: { set: jest.fn(), get: jest.fn(() => 'light') },
}));

const reset = () => {
  useShellStore.setState({
    route: { kind: 'rootSettings' },
    agentRoute: AGENT_HOME,
    workflowRoute: WORKFLOW_HOME,
    onboardingComplete: true,
    lastMode: null,
    themePreference: null,
    transitioning: false,
  });
};

beforeEach(() => {
  reset();
  jest.clearAllMocks();
});

const render = async () => {
  const result = renderWithTheme(<RootSettingsScreen />);

  await act(async () => {
    await Promise.resolve();
  });

  return result;
};

describe('the appearance setting', () => {
  it('offers system, light, and dark', async () => {
    const { getByLabelText } = await render();

    expect(getByLabelText('Follow the system theme')).toBeTruthy();
    expect(getByLabelText('Use the light theme')).toBeTruthy();
    expect(getByLabelText('Use the dark theme')).toBeTruthy();
  });

  it('marks the current choice as selected', async () => {
    useShellStore.setState({ themePreference: 'dark' });

    const { getByLabelText } = await render();

    expect(getByLabelText('Use the dark theme').props.accessibilityState.selected).toBe(true);
  });

  it('defaults to following the system', async () => {
    const { getByLabelText } = await render();

    expect(getByLabelText('Follow the system theme').props.accessibilityState.selected).toBe(true);
  });
});

describe('applying a choice', () => {
  it('records it in the store', () => {
    useShellStore.getState().setThemePreference('dark');

    expect(useShellStore.getState().themePreference).toBe('dark');
  });

  it('can return to following the system', () => {
    useShellStore.getState().setThemePreference('dark');
    useShellStore.getState().setThemePreference(null);

    expect(useShellStore.getState().themePreference).toBeNull();
  });
});

describe('App wiring', () => {
  it('tells NativeWind about the choice, not just ThemeProvider', async () => {
    // The regression. `className` colours ignore ThemeProvider entirely, so a preference applied to
    // only one of the two systems changes almost nothing on screen.
    useShellStore.setState({ themePreference: 'dark' });

    renderWithTheme(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(colorScheme.set).toHaveBeenCalledWith('dark');
  });

  it('passes "system" through rather than a null', async () => {
    // NativeWind expects the literal 'system'; null would be ignored and the choice lost.
    useShellStore.setState({ themePreference: null });

    renderWithTheme(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(colorScheme.set).toHaveBeenCalledWith('system');
  });
});
