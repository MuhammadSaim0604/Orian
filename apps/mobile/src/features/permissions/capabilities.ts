import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * Capabilities: what the app can do, and what the user still has to allow.
 *
 * One list, read live from the Kotlin capability registry. The registry decides tier, rationale, and
 * grant mechanism; this is the typed view of it, plus the two things the UI needs that the registry
 * cannot express — an event when state changes, and helpers for the settings round trip.
 *
 * **Never cache a grant.** Every read goes to the platform, because the user can revoke a permission
 * from system settings at any moment, and the whole flow here sends them to system settings.
 */

/** Every capability id, mirroring `SensitiveCapability` in `android/tools`. */
export const CAPABILITY_IDS = [
  'accessibility',
  'overlay',
  'assistant',
  'usage_access',
  'notifications',
  'foreground_service',
  'screen_capture',
  'contacts',
  'exact_alarm',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

/** Whether the product works at all without this. Drives the onboarding gate. */
export type CapabilityTier = 'required' | 'optional';

/**
 * How a capability is granted. Four genuinely different flows.
 *
 * `settings_screen` is the one that shapes the UI: it has **no result to await**, so a screen must
 * open settings and re-read state on resume rather than showing a spinner.
 */
export type GrantMechanism =
  | 'runtime_prompt'
  | 'settings_screen'
  | 'session_consent'
  | 'install_time';

export type Capability = {
  readonly id: CapabilityId;
  readonly tier: CapabilityTier;
  readonly grant: GrantMechanism;
  readonly granted: boolean;
  readonly title: string;
  readonly explanation: string;
  /** What stops working without it, so a refusal is informed rather than blind. */
  readonly consequenceIfDenied: string;
  readonly requiresSettingsVisit: boolean;
};

/** What happened when a capability was requested. */
export type RequestOutcome =
  | 'granted'
  | 'denied'
  /** The user is in system settings. Nothing will resolve — re-read state on resume. */
  | 'settings_opened'
  /** Screen capture: use the MediaProjection consent flow instead. */
  | 'session_consent'
  | 'unsupported';

type PermissionsNative = {
  getCapabilityStates: () => Promise<Capability[]>;
  areRequiredCapabilitiesGranted: () => Promise<boolean>;
  requestCapability: (id: string) => Promise<string>;
  openSettingsFor: (id: string) => Promise<boolean>;
  openAppSettings: () => Promise<boolean>;
  refresh: () => Promise<Capability[]>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

/**
 * Looked up defensively.
 *
 * `NativeModules.X` validates the module's whole method table on first access and throws if any
 * signature is unparseable — at module-evaluation time, before any error boundary exists. A crash on
 * startup is a much worse failure than a missing permissions screen, so absence is treated as a
 * normal state (as it already is in a build without the module).
 */
const native = ((): PermissionsNative | undefined => {
  try {
    return (NativeModules as { Permissions?: PermissionsNative }).Permissions;
  } catch {
    return undefined;
  }
})();

export const arePermissionsAvailable = (): boolean => native !== undefined;

const isCapabilityId = (value: string): value is CapabilityId =>
  (CAPABILITY_IDS as readonly string[]).includes(value);

const isTier = (value: string): value is CapabilityTier =>
  value === 'required' || value === 'optional';

const isGrant = (value: string): value is GrantMechanism =>
  value === 'runtime_prompt' ||
  value === 'settings_screen' ||
  value === 'session_consent' ||
  value === 'install_time';

/**
 * Narrows what crossed the bridge.
 *
 * A row with an unrecognised id or tier is **dropped rather than coerced**. The alternative is a
 * screen rendering a capability it cannot request, with a button that does nothing — and since the
 * native side is the source of truth, an unknown value means the two sides have drifted, which is a
 * bug to notice rather than paper over.
 */
const narrow = (rows: readonly Capability[]): readonly Capability[] =>
  rows.filter(
    (row) =>
      typeof row.id === 'string' &&
      isCapabilityId(row.id) &&
      isTier(row.tier) &&
      isGrant(row.grant),
  );

export const readCapabilities = async (): Promise<readonly Capability[]> => {
  if (native === undefined) return [];

  try {
    return narrow(await native.getCapabilityStates());
  } catch {
    return [];
  }
};

/**
 * Whether onboarding can complete.
 *
 * False when the module is missing, which is the safe answer: a build that cannot read permissions
 * has certainly not been granted them.
 */
export const areRequiredCapabilitiesGranted = async (): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    return await native.areRequiredCapabilitiesGranted();
  } catch {
    return false;
  }
};

export const requestCapability = async (id: CapabilityId): Promise<RequestOutcome> => {
  if (native === undefined) return 'unsupported';

  try {
    const outcome = await native.requestCapability(id);

    return outcome === 'granted' ||
      outcome === 'denied' ||
      outcome === 'settings_opened' ||
      outcome === 'session_consent'
      ? outcome
      : 'unsupported';
  } catch {
    return 'unsupported';
  }
};

/** Opens the settings page for a capability without requesting it. For the overview screen. */
export const openSettingsFor = async (id: CapabilityId): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    return await native.openSettingsFor(id);
  } catch {
    return false;
  }
};

/** This app's own settings page — the fallback when a specific screen cannot be reached. */
export const openAppSettings = async (): Promise<boolean> => {
  if (native === undefined) return false;

  try {
    return await native.openAppSettings();
  } catch {
    return false;
  }
};

/**
 * Re-reads every capability and emits the change event.
 *
 * The other half of a settings grant. There is no callback from a settings screen, so the app has to
 * look again when the user comes back.
 */
export const refreshCapabilities = async (): Promise<readonly Capability[]> => {
  if (native === undefined) return [];

  try {
    return narrow(await native.refresh());
  } catch {
    return [];
  }
};

export const onCapabilitiesChanged = (
  listener: (capabilities: readonly Capability[]) => void,
): { remove: () => void } => {
  if (native === undefined) return { remove: () => undefined };

  const emitter = new NativeEventEmitter(native as never);

  const subscription = emitter.addListener('capabilitiesChanged', (rows: Capability[]) => {
    listener(narrow(rows));
  });

  return { remove: () => subscription.remove() };
};

/** The required capabilities still missing, for a screen that explains what remains. */
export const missingRequired = (capabilities: readonly Capability[]): readonly Capability[] =>
  capabilities.filter((capability) => capability.tier === 'required' && !capability.granted);

export const requiredCapabilities = (capabilities: readonly Capability[]): readonly Capability[] =>
  capabilities.filter((capability) => capability.tier === 'required');

export const optionalCapabilities = (capabilities: readonly Capability[]): readonly Capability[] =>
  capabilities.filter((capability) => capability.tier === 'optional');
