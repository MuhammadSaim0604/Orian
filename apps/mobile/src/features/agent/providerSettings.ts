import { NativeModules } from 'react-native';

/**
 * AI provider settings, backed by the Android Keystore.
 *
 * The asymmetry here is deliberate and load-bearing. The app can write the API key and
 * ask whether one exists, but `readApiKey` is called only by the provider client at the
 * moment of a request - never held in React state, never rendered, never logged, never
 * put in a prompt (ADR 0007).
 *
 * That is why `ProviderSettings` returns `hasApiKey` rather than the key: a settings
 * screen needs to show whether one is configured, and giving it the value would invite
 * putting it in a text field where it would end up in a component tree, a redux devtools
 * snapshot, or a crash report.
 */

type ProviderSettingsNative = {
  getSettings: () => Promise<{
    baseUrl: string | null;
    model: string | null;
    hasApiKey: boolean;
  }>;
  setBaseUrl: (baseUrl: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setApiKey: (apiKey: string | null) => Promise<boolean>;
  getApiKey: () => Promise<string | null>;
  clear: () => Promise<void>;
};

const native = (NativeModules as { ProviderSettings?: ProviderSettingsNative }).ProviderSettings;

/** Whether the native settings module is present in this build. */
export const isProviderSettingsAvailable = (): boolean => native !== undefined;

/** What a settings screen may know. Note the absence of the key itself. */
export type ProviderSettings = {
  readonly baseUrl: string;
  readonly model: string;
  readonly hasApiKey: boolean;
};

/**
 * A sensible starting point.
 *
 * Points at OpenAI because it is the reference implementation of the protocol, but the
 * whole point of ADR 0007 is that a local gateway on `http://localhost:1234/v1` works
 * identically with no code change.
 */
export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  hasApiKey: false,
};

export const loadProviderSettings = async (): Promise<ProviderSettings> => {
  if (native === undefined) return DEFAULT_PROVIDER_SETTINGS;

  const stored = await native.getSettings();

  return {
    baseUrl: stored.baseUrl ?? DEFAULT_PROVIDER_SETTINGS.baseUrl,
    model: stored.model ?? DEFAULT_PROVIDER_SETTINGS.model,
    hasApiKey: stored.hasApiKey,
  };
};

export const saveBaseUrl = async (baseUrl: string): Promise<void> => {
  await native?.setBaseUrl(baseUrl.trim());
};

export const saveModel = async (model: string): Promise<void> => {
  await native?.setModel(model.trim());
};

/**
 * Stores the API key.
 *
 * Resolves false when the keystore refused, so the UI can say the key was not saved.
 * Silently succeeding would leave the user believing they had configured a provider.
 */
export const saveApiKey = async (apiKey: string): Promise<boolean> => {
  if (native === undefined) return false;
  return native.setApiKey(apiKey.trim() === '' ? null : apiKey.trim());
};

/**
 * Reads the key for a request.
 *
 * Called by the provider client only. Returning an empty string rather than null when the
 * module is absent would be wrong: null means "not configured", and the agent must be able
 * to tell that apart from a local gateway that legitimately needs no key.
 */
export const readApiKey = async (): Promise<string | null> => {
  if (native === undefined) return null;
  return native.getApiKey();
};

/** Forgets everything, for a user who wants their credential gone. */
export const clearProviderSettings = async (): Promise<void> => {
  await native?.clear();
};
