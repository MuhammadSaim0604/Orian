package com.mobileautomation

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
    /**
     * Must match the name passed to `AppRegistry.registerComponent`
     * in `apps/mobile/index.js`.
     */
    override fun getMainComponentName(): String = "MobileAutomation"

    /**
     * Passing null defeats Android's fragment-state restoration.
     *
     * Required by react-native-gesture-handler: on a configuration change Android
     * restores fragment state before React Native has re-created the view tree, and
     * the restored state refers to views that no longer exist. The crash presents as
     * an obscure fragment exception on rotation, far from its cause.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
