package com.mobileautomation.preferences

import android.content.Context
import android.content.SharedPreferences

/**
 * Small, non-secret app preferences.
 *
 * `SharedPreferences` rather than Room, deliberately. These are a handful of scalars read at
 * startup to decide which screen to show; giving them a Room table would mean a schema migration
 * every time a preference is added, and a query on the critical path of the first paint.
 *
 * Nothing sensitive belongs here. `SharedPreferences` is plain XML in app-private storage, which
 * is the right place for "has onboarding finished" and the wrong place for a credential - those
 * live in the Keystore (ADR 0007).
 */
class AppPreferences(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    /** Whether the user has completed onboarding. */
    var onboardingComplete: Boolean
        get() = prefs.getBoolean(KEY_ONBOARDING_COMPLETE, false)
        set(value) = prefs.edit().putBoolean(KEY_ONBOARDING_COMPLETE, value).apply()

    /**
     * The mode the user was last in, or null if they have never chosen one.
     *
     * Stored so a returning user is not made to re-choose, but the shell still opens at the mode
     * switcher - this is a hint for highlighting, not a route to restore.
     */
    var lastMode: String?
        get() = prefs.getString(KEY_LAST_MODE, null)
        set(value) =
            prefs
                .edit()
                .apply { if (value == null) remove(KEY_LAST_MODE) else putString(KEY_LAST_MODE, value) }
                .apply()

    /** Explicit theme choice: "light", "dark", or null to follow the system. */
    var themePreference: String?
        get() = prefs.getString(KEY_THEME, null)
        set(value) =
            prefs
                .edit()
                .apply { if (value == null) remove(KEY_THEME) else putString(KEY_THEME, value) }
                .apply()

    /**
     * Clears everything.
     *
     * Used by "reset the app" in settings. Deliberately does not touch workflows, traces, or the
     * Keystore - a user resetting their preferences has not asked to lose their work.
     */
    fun clear() {
        prefs.edit().clear().apply()
    }

    /**
     * A namespaced string preference.
     *
     * Added for Agent Mode's settings (Step 4): the disabled-tool list and the run bounds are exactly the
     * kind of scalar this file exists for, and giving each one a named property here would mean editing
     * three files to add a setting.
     *
     * Namespaced by convention at the call site (`agent.maxSteps`), and **prefix-guarded** so a caller
     * cannot reach the shell's own keys through this door - a JS bug that wrote `onboarding_complete` as a
     * string would put the app into a state the typed accessors above cannot read.
     */
    fun getNamespaced(
        key: String,
        fallback: String,
    ): String = if (!isNamespaced(key)) fallback else prefs.getString(key, fallback) ?: fallback

    fun putNamespaced(
        key: String,
        value: String,
    ) {
        if (!isNamespaced(key)) return
        prefs.edit().putString(key, value).apply()
    }

    /**
     * Whether a key belongs to a feature namespace rather than to the shell's own scalars.
     *
     * A dot is the marker. The shell's keys use underscores, so the two sets cannot collide by accident.
     */
    private fun isNamespaced(key: String): Boolean = key.contains('.') && key.isNotBlank()

    private companion object {
        const val FILE_NAME = "app_preferences"
        const val KEY_ONBOARDING_COMPLETE = "onboarding_complete"
        const val KEY_LAST_MODE = "last_mode"
        const val KEY_THEME = "theme"
    }
}
