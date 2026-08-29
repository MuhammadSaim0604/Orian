import {
  type Capability,
  type CapabilityId,
  type GrantMechanism,
  type CapabilityTier,
} from '../capabilities';
import {
  selectIsGranted,
  selectMissingRequired,
  selectOptional,
  selectRequired,
  selectRequiredGranted,
  useCapabilityStore,
} from '../capabilityStore';

/**
 * The capability store's rules.
 *
 * What matters here is the logic that decides whether a user is let past the permission screen and
 * what the app believes it is allowed to do. Both are easy to get subtly wrong in a direction nobody
 * notices: a permissive default lets someone through onboarding having granted nothing, and a stale
 * snapshot makes a feature act on a permission that was revoked.
 *
 * The native module is absent under Jest, so `readCapabilities` returns an empty list — which makes
 * the empty-snapshot cases the default rather than an afterthought.
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

const allRequired = (granted: boolean): Capability[] =>
  REQUIRED_IDS.map((id) => capability(id, 'required', granted));

const seed = (capabilities: Capability[]) => {
  useCapabilityStore.setState({
    capabilities,
    loading: false,
    requesting: null,
    awaitingSettings: [],
    error: null,
  });
};

beforeEach(() => useCapabilityStore.getState().reset());

describe('the onboarding gate', () => {
  it('refuses to pass an empty snapshot', () => {
    // The decisive case. An empty list means nothing has been read yet, not that everything is
    // granted — and reading it the permissive way would walk a user straight past the permission
    // screen on a slow first load.
    expect(selectRequiredGranted(useCapabilityStore.getState())).toBe(false);
  });

  it('refuses while any required capability is missing', () => {
    seed([...allRequired(true).slice(0, 4), capability('notifications', 'required', false)]);

    expect(selectRequiredGranted(useCapabilityStore.getState())).toBe(false);
  });

  it('passes when every required capability is granted', () => {
    seed(allRequired(true));

    expect(selectRequiredGranted(useCapabilityStore.getState())).toBe(true);
  });

  it('ignores optional capabilities entirely', () => {
    // Making someone grant contacts to reach the app they downloaded is what the permission model
    // exists to prevent.
    seed([...allRequired(true), capability('contacts', 'optional', false, 'runtime_prompt')]);

    expect(selectRequiredGranted(useCapabilityStore.getState())).toBe(true);
  });

  it('names what is still missing', () => {
    seed([
      ...allRequired(true).slice(0, 3),
      capability('usage_access', 'required', false),
      capability('notifications', 'required', false),
      capability('contacts', 'optional', false, 'runtime_prompt'),
    ]);

    expect(selectMissingRequired(useCapabilityStore.getState()).map((c) => c.id)).toEqual([
      'usage_access',
      'notifications',
    ]);
  });
});

describe('reading a single capability', () => {
  it('reports a granted capability', () => {
    seed([capability('contacts', 'optional', true, 'runtime_prompt')]);

    expect(selectIsGranted('contacts')(useCapabilityStore.getState())).toBe(true);
  });

  it('reports an unknown capability as not granted', () => {
    // Fails closed. A capability the snapshot has never heard of must not read as available.
    seed([]);

    expect(selectIsGranted('contacts')(useCapabilityStore.getState())).toBe(false);
  });

  it('separates the two tiers', () => {
    seed([...allRequired(false), capability('contacts', 'optional', false, 'runtime_prompt')]);

    expect(selectRequired(useCapabilityStore.getState())).toHaveLength(5);
    expect(selectOptional(useCapabilityStore.getState())).toHaveLength(1);
  });
});

describe('the settings round trip', () => {
  it('remembers that the user was sent to settings', () => {
    // A settings grant has no callback, so the UI needs to know it is waiting on a round trip rather
    // than appearing to hang.
    useCapabilityStore.setState({ awaitingSettings: ['accessibility'] });

    expect(useCapabilityStore.getState().awaitingSettings).toContain('accessibility');
  });

  it('stops awaiting a capability once it is granted', () => {
    useCapabilityStore.setState({ awaitingSettings: ['accessibility', 'overlay'] });

    useCapabilityStore.getState().apply([capability('accessibility', 'required', true)]);

    expect(useCapabilityStore.getState().awaitingSettings).toEqual(['overlay']);
  });

  it('keeps awaiting a capability that is still not granted', () => {
    useCapabilityStore.setState({ awaitingSettings: ['accessibility'] });

    useCapabilityStore.getState().apply([capability('accessibility', 'required', false)]);

    expect(useCapabilityStore.getState().awaitingSettings).toEqual(['accessibility']);
  });

  it('clears an awaited capability granted by some other route', () => {
    // From a notification, or in a previous session. Clearing on the *value* rather than on the
    // return from Settings is what makes this correct.
    useCapabilityStore.setState({ awaitingSettings: ['notifications'] });

    useCapabilityStore
      .getState()
      .apply([capability('notifications', 'required', true, 'runtime_prompt')]);

    expect(useCapabilityStore.getState().awaitingSettings).toEqual([]);
  });
});

describe('requesting a capability without the native module', () => {
  it('reports unsupported rather than throwing', async () => {
    const outcome = await useCapabilityStore.getState().request('contacts');

    expect(outcome).toBe('unsupported');
  });

  it('explains why nothing happened', async () => {
    await useCapabilityStore.getState().request('contacts');

    expect(useCapabilityStore.getState().error).toMatch(/cannot be requested/i);
  });

  it('clears the in-flight marker even when the request fails', async () => {
    // Otherwise a failed request would leave a button spinning forever.
    await useCapabilityStore.getState().request('contacts');

    expect(useCapabilityStore.getState().requesting).toBeNull();
  });
});

describe('applying a snapshot', () => {
  it('replaces rather than merges', () => {
    // The native side is the source of truth. Merging would keep a capability the platform no longer
    // reports, which is how a revoked permission stays "granted" in the UI.
    seed(allRequired(true));

    useCapabilityStore.getState().apply([capability('accessibility', 'required', false)]);

    expect(useCapabilityStore.getState().capabilities).toHaveLength(1);
    expect(selectRequiredGranted(useCapabilityStore.getState())).toBe(false);
  });
});
