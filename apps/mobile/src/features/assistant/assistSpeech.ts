import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';

/**
 * Speech in and out for Orion Assist, and the panel's own controls.
 *
 * Three native modules behind one file, because from the panel's point of view they are one capability: hear the
 * user, answer, speak. Splitting them across three files would mean three defensive lookups and three sets of the
 * same availability handling.
 *
 * ## Every lookup is defensive
 *
 * `NativeModules.X` under the new architecture is a host-object getter that validates the module's whole method
 * table on first access, and a missing module throws rather than returning undefined. This app has already shipped
 * a launch crash from exactly that, so nothing here assumes a module is present — an older build, or a JS bundle
 * loaded before native registration, must degrade rather than crash.
 */

type PanelModule = {
  hasScreenContext: () => boolean;
  getScreenInfo: () => string;
  dismiss: () => Promise<boolean>;
};

type SpeechInModule = {
  hasMicrophonePermission: () => boolean;
  isSpeechAvailable: () => boolean;
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<boolean>;
  cancelListening: () => Promise<boolean>;
};

type SpeechOutModule = {
  isReady: () => boolean;
  prepare: () => Promise<boolean>;
  speak: (text: string) => Promise<boolean>;
  stop: () => Promise<boolean>;
};

const lookup = <T>(name: string): T | undefined => {
  try {
    return (NativeModules as Record<string, T | undefined>)[name];
  } catch {
    // A throwing getter means the module failed signature validation. Reported as absent so the panel still opens.
    return undefined;
  }
};

const panel = lookup<PanelModule>('AssistPanel');
const speechIn = lookup<SpeechInModule>('AssistSpeech');
const speechOut = lookup<SpeechOutModule>('AssistSpeechOut');

/** Whether the panel's native side is available at all. */
export const isAssistAvailable = (): boolean => panel !== undefined;

/**
 * Whether the system handed us the screen this time.
 *
 * False is a real state rather than an error: the user can turn off "Use screen context" in assist settings while
 * leaving this app as their assistant. The panel says so, because that is fixable and otherwise the assistant
 * simply looks incapable of reading a screen it can plainly see.
 */
export const hasScreenContext = (): boolean => {
  try {
    return panel?.hasScreenContext() ?? false;
  } catch {
    return false;
  }
};

export type AssistScreenInfo = {
  readonly packageName: string | null;
  readonly activityName: string | null;
};

/** Which app the user was looking at when they summoned the panel. */
export const readScreenInfo = (): AssistScreenInfo => {
  try {
    const raw = panel?.getScreenInfo();
    if (raw === undefined) return { packageName: null, activityName: null };

    const parsed = JSON.parse(raw) as AssistScreenInfo;

    return {
      packageName: typeof parsed.packageName === 'string' ? parsed.packageName : null,
      activityName: typeof parsed.activityName === 'string' ? parsed.activityName : null,
    };
  } catch {
    return { packageName: null, activityName: null };
  }
};

/**
 * Closes the panel.
 *
 * Asks the **session** to hide rather than stopping the surface, which matters: hiding is what clears the stored
 * screenshot and view tree of whatever app the user was looking at. Tearing down the React side alone would leave
 * the most sensitive thing this app holds in memory.
 */
export const dismissPanel = async (): Promise<void> => {
  try {
    await panel?.dismiss();
  } catch {
    // Already gone. Nothing to do, and nothing worth telling the user.
  }
};

// --- speech in ---------------------------------------------------------------

export const hasMicrophonePermission = (): boolean => {
  try {
    return speechIn?.hasMicrophonePermission() ?? false;
  } catch {
    return false;
  }
};

/** Whether any recogniser exists. Some devices genuinely have none, and the mic button should not offer to fail. */
export const isSpeechAvailable = (): boolean => {
  try {
    return speechIn?.isSpeechAvailable() ?? false;
  } catch {
    return false;
  }
};

export const startListening = async (): Promise<void> => {
  if (speechIn === undefined) throw new Error('Speech input is not available in this build.');
  await speechIn.startListening();
};

/** Stops and keeps what was heard. */
export const stopListening = async (): Promise<void> => {
  try {
    await speechIn?.stopListening();
  } catch {
    // Nothing listening. Harmless.
  }
};

/** Abandons what was heard, for a dismissed panel. */
export const cancelListening = async (): Promise<void> => {
  try {
    await speechIn?.cancelListening();
  } catch {
    // As above.
  }
};

/**
 * Why listening failed, as something the panel can act on.
 *
 * Mapped natively to these codes rather than passed through as platform ints, because the response differs per
 * case: a permission problem needs a prompt, a network problem needs "try again", and no-speech needs "I did not
 * catch that". An int at this boundary would put that decision in the wrong place.
 */
export const ASSISTANT_SPEECH_ERRORS = [
  'no_speech',
  'microphone_denied',
  'network',
  'busy',
  'failed',
] as const;

export type AssistantSpeechError = (typeof ASSISTANT_SPEECH_ERRORS)[number];

const emitter = new NativeEventEmitter();

/** Words as they are spoken, so the panel can show them appearing. */
export const onSpeechPartial = (listener: (text: string) => void): EmitterSubscription =>
  emitter.addListener('assistSpeechPartial', listener);

/** The final transcript. */
export const onSpeechResult = (listener: (text: string) => void): EmitterSubscription =>
  emitter.addListener('assistSpeechResult', listener);

export const onSpeechError = (
  listener: (error: AssistantSpeechError) => void,
): EmitterSubscription =>
  emitter.addListener('assistSpeechError', (code: string) => {
    listener(
      (ASSISTANT_SPEECH_ERRORS as readonly string[]).includes(code)
        ? (code as AssistantSpeechError)
        : 'failed',
    );
  });

/** Microphone level, for the listening indicator. */
export const onSpeechLevel = (listener: (level: number) => void): EmitterSubscription =>
  emitter.addListener('assistSpeechLevel', listener);

export const onSpeechEnd = (listener: () => void): EmitterSubscription =>
  emitter.addListener('assistSpeechEnd', listener);

// --- speech out --------------------------------------------------------------

/**
 * Starts the text-to-speech engine.
 *
 * Called when the panel opens rather than at app startup: initialising it spins up a service and loads voice data,
 * which is worth paying for when the user has just summoned a voice assistant and wasteful on every cold start of
 * an app they may only ever type into.
 */
export const prepareSpeech = async (): Promise<void> => {
  try {
    await speechOut?.prepare();
  } catch {
    // A device with no speech data is legitimate. The panel still shows the answer.
  }
};

/**
 * Speaks an answer.
 *
 * The caller strips markdown first (`stripMarkdown`). Doing it here would hide the decision: the panel shows the
 * rendered version and speaks the plain one, and those are two different strings by design.
 */
export const speak = async (text: string): Promise<void> => {
  try {
    await speechOut?.speak(text);
  } catch {
    // Silent failure is correct — the answer is on screen either way.
  }
};

/**
 * Stops speaking immediately.
 *
 * Called on dismissal and before a new answer. A voice that carries on after the panel has gone is the single most
 * irritating thing this feature could do.
 */
export const stopSpeaking = async (): Promise<void> => {
  try {
    await speechOut?.stop();
  } catch {
    // Nothing speaking.
  }
};

export const onSpeakStart = (listener: () => void): EmitterSubscription =>
  emitter.addListener('assistSpeakStart', listener);

export const onSpeakDone = (listener: () => void): EmitterSubscription =>
  emitter.addListener('assistSpeakDone', listener);
