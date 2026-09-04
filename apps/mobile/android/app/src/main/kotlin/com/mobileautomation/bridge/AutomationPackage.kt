package com.mobileautomation.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mobileautomation.agentoverlay.AgentOverlayModule
import com.mobileautomation.assist.AssistPanelModule
import com.mobileautomation.assist.AssistSpeechModule
import com.mobileautomation.assist.AssistSpeechOutModule
import com.mobileautomation.assist.WakeWordModule
import com.mobileautomation.keepalive.RunKeepAliveModule
import com.mobileautomation.overlay.OverlayModule
import com.mobileautomation.permissions.PermissionsModule
import com.mobileautomation.preferences.AppPreferencesModule
import com.mobileautomation.settings.ProviderRegistryModule
import com.mobileautomation.settings.ProviderSettingsModule
import com.mobileautomation.storage.SessionStorageModule
import com.mobileautomation.storage.WorkflowStorageModule

/**
 * Registers the app's native modules with React Native.
 *
 * Listed explicitly in `MainApplication.getPackages()` rather than autolinked: these
 * modules live in the app itself rather than in an npm package, so there is no
 * `react-native.config.js` for the CLI to discover.
 */
class AutomationPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(
            AutomationModule(reactContext),
            // Phase 7: the AI provider credential, held in the Android Keystore rather
            // than anywhere JavaScript can read it casually (ADR 0007).
            ProviderSettingsModule(reactContext),
            // Phase 6: Room-backed workflow storage (ADR 0005).
            WorkflowStorageModule(reactContext),
            // Phase 8: the Configure-with-AI floating window, which has to be a real
            // WindowManager overlay because a modal dies the moment the user switches apps.
            OverlayModule(reactContext),
            // Step 1: shell preferences. Read synchronously at startup so the first paint
            // shows the right screen rather than guessing and correcting itself.
            AppPreferencesModule(reactContext),
            // Step 2: the capability registry surfaced to JS. Separate from AutomationModule
            // because capability state must be readable when the accessibility service is
            // off - which is exactly when the user is being asked to turn it on.
            PermissionsModule(reactContext),
            // Step 3: the agent status overlay, and the route by which the notification's
            // stop action reaches the run controller. A separate window from the node
            // toolset because the two belong to different modes and must never coexist.
            AgentOverlayModule(reactContext),
            // Step 3 fix: holds a headless task for the duration of a run, because
            // JavaTimerManager clears the timer choreographer callback on activity pause -
            // so setTimeout stops firing and the loop freezes, foreground service or not.
            RunKeepAliveModule(reactContext),
            // Step 4: chat sessions, and the provider registry that replaces the single
            // base-URL-and-model arrangement. Both are shared surfaces rather than Agent
            // Mode's own - the registry is root-level (issue A5) and the session table is
            // scoped by mode so the workflow builder agent can use it too (ADR 0014).
            SessionStorageModule(reactContext),
            ProviderRegistryModule(reactContext),
            // Orion Assist: the panel the assist gesture opens, plus speech in and out.
            //
            // AssistPanelModule registers itself with AssistPanelRegistry on construction rather
            // than when a screen mounts, because the gesture can be used with no activity in the
            // foreground - so the host has to exist before any React tree does.
            AssistPanelModule(reactContext),
            AssistSpeechModule(reactContext),
            AssistSpeechOutModule(reactContext),
            // The "Hey Orion" wake word. Opt-in and off by default, because it is a
            // foreground service holding a recogniser rather than the DSP hotword API -
            // AlwaysOnHotwordDetector needs a vendor-enrolled keyphrase, and no vendor
            // enrols ours.
            WakeWordModule(reactContext),
        )

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
