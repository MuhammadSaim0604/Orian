package com.mobileautomation.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers the automation module with React Native.
 *
 * Listed explicitly in `MainApplication.getPackages()` rather than autolinked: the
 * module lives in the app itself rather than in an npm package, so there is no
 * `react-native.config.js` for the CLI to discover.
 */
class AutomationPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(AutomationModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
