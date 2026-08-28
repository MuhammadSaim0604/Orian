package com.mobileautomation.preferences

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

/**
 * Shell preferences, exposed to React Native.
 *
 * Deliberately tiny. The shell needs to know, before it renders anything, whether onboarding is
 * finished - and a first paint that guesses wrong shows the mode switcher to a user who has never
 * granted a permission, or the welcome screen to one who finished onboarding weeks ago.
 *
 * `getAllSync` exists for exactly that reason: it is the one blocking read the app makes, and it
 * reads a few scalars out of `SharedPreferences`, which is already in memory after the first
 * access. Everything else here is async.
 */
class AppPreferencesModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val preferences = AppPreferences(reactContext)

    override fun getName(): String = NAME

    /**
     * Reads every preference synchronously.
     *
     * Blocking is justified here and nowhere else: the alternative is rendering a placeholder and
     * then replacing it, which for the very first screen reads as a flicker or, worse, as the
     * wrong screen appearing briefly.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getAllSync(): WritableNativeMap =
        WritableNativeMap().apply {
            putBoolean("onboardingComplete", preferences.onboardingComplete)
            putString("lastMode", preferences.lastMode)
            putString("themePreference", preferences.themePreference)
        }

    @ReactMethod
    fun setOnboardingComplete(
        complete: Boolean,
        promise: Promise,
    ) {
        preferences.onboardingComplete = complete
        promise.resolve(null)
    }

    @ReactMethod
    fun setLastMode(
        mode: String?,
        promise: Promise,
    ) {
        preferences.lastMode = mode
        promise.resolve(null)
    }

    @ReactMethod
    fun setThemePreference(
        theme: String?,
        promise: Promise,
    ) {
        preferences.themePreference = theme
        promise.resolve(null)
    }

    /** Resets preferences only. Workflows, traces, and stored credentials are untouched. */
    @ReactMethod
    fun clear(promise: Promise) {
        preferences.clear()
        promise.resolve(null)
    }

    companion object {
        const val NAME = "AppPreferences"
    }
}
