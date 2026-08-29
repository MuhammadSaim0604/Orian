package com.mobileautomation.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mobileautomation.agentoverlay.AgentOverlayModule
import com.mobileautomation.overlay.OverlayModule
import com.mobileautomation.permissions.PermissionsModule
import com.mobileautomation.preferences.AppPreferencesModule
import com.mobileautomation.settings.ProviderSettingsModule
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
        )

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
