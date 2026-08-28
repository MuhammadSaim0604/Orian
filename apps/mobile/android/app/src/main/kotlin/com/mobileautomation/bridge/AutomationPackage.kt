package com.mobileautomation.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
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
        )

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
