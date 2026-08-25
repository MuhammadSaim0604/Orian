package com.mobileautomation

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

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
