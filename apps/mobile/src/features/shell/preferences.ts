import { NativeModules } from 'react-native';

/**
 * Shell preferences.
 *
 * Three scalars that decide what the app shows first: whether onboarding is finished, which mode
 * the user was last in, and an explicit theme choice. Backed by `SharedPreferences` rather than
 * Room, because a Room table would mean a migration every time a preference is added and a query
 * on the critical path of the first paint.
 *
 * `readPreferencesSync` is the one blocking native call the app makes. It is justified because the
 * alternative is rendering a placeholder and correcting it, which for the very first screen reads
 * as a flicker — or worse, as the welcome screen appearing briefly to someone who finished
 * onboarding weeks ago.
 *
 * Nothing sensitive belongs here. The provider key lives in the Keystore.
 */

export type AppMode = 'agent' | 'workflow';

export type ThemePreference = 'light' | 'dark' | null;

export type ShellPreferences = {
  readonly onboardingComplete: boolean;
  /** The mode last used, or null if never chosen. A hint for the switcher, not a route. */
  readonly lastMode: AppMode | null;
  readonly themePreference: ThemePreference;
};

type PreferencesNative = {
  getAllSync: () => {
    onboardingComplete: boolean;
    lastMode: string | null;
    themePreference: string | null;
  };
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  setLastMode: (mode: string | null) => Promise<void>;
  setThemePreference: (theme: string | null) => Promise<void>;
  clear: () => Promise<void>;
};

const native = (NativeModules as { AppPreferences?: PreferencesNative }).AppPreferences;

export const arePreferencesAvailable = (): boolean => native !== undefined;

export const DEFAULT_PREFERENCES: ShellPreferences = {
  onboardingComplete: false,
  lastMode: null,
  themePreference: null,
};

/** Narrows an arbitrary stored string, so a corrupt value cannot become an invalid mode. */
const asMode = (value: string | null): AppMode | null =>
  value === 'agent' || value === 'workflow' ? value : null;

const asTheme = (value: string | null): ThemePreference =>
  value === 'light' || value === 'dark' ? value : null;

/**
 * Reads every preference synchronously.
 *
 * Falls back to defaults rather than throwing when the native module is absent, so the app still
 * boots in a build without it — into onboarding, which is the safe assumption.
 */
export const readPreferencesSync = (): ShellPreferences => {
  if (native === undefined) return DEFAULT_PREFERENCES;

  try {
    const raw = native.getAllSync();

    return {
      onboardingComplete: raw.onboardingComplete,
      lastMode: asMode(raw.lastMode),
      themePreference: asTheme(raw.themePreference),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

export const writeOnboardingComplete = async (complete: boolean): Promise<void> => {
  await native?.setOnboardingComplete(complete);
};

export const writeLastMode = async (mode: AppMode | null): Promise<void> => {
  await native?.setLastMode(mode);
};

export const writeThemePreference = async (theme: ThemePreference): Promise<void> => {
  await native?.setThemePreference(theme);
};

/** Resets preferences only. Workflows, traces, and stored credentials are untouched. */
export const clearPreferences = async (): Promise<void> => {
  await native?.clear();
};
