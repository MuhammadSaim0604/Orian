package com.mobileautomation.tools.android

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.util.Log
import com.mobileautomation.tools.AppManager
import com.mobileautomation.tools.AppRanking
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp

/**
 * [AppManager] backed by `PackageManager`.
 *
 * The foreground screen is not read here. Since API 21 an app cannot query which
 * app is in front, so the accessibility service is the only legitimate source;
 * it is injected as [currentPackageProvider] rather than reached for directly,
 * keeping the dependency pointing the right way.
 */
class AndroidAppManager(
    private val context: Context,
    private val currentPackageProvider: () -> String? = { null },
    private val currentActivityProvider: () -> String? = { null },
) : AppManager {
    private val packageManager: PackageManager get() = context.packageManager

    /**
     * Launches [packageName] and confirms it actually started.
     *
     * `startActivity` not throwing is not the same as the app opening: a background start can be blocked
     * outright on API 29+, and the system reports that by ignoring the call rather than by throwing. The
     * old version returned true regardless, so a launch that never happened was reported as done and the
     * agent went on to look for elements on a screen it had not reached.
     *
     * So the foreground package is polled briefly afterwards. When the foreground cannot be read at all
     * the launch is trusted, because the accessibility service being off is not evidence the app failed
     * to open - and refusing then would break `openApp` for the one case it is most needed in.
     */
    override fun openApp(packageName: String): Boolean {
        val launchIntent =
            packageManager.getLaunchIntentForPackage(packageName)
                ?: return false.also { Log.w(TAG, "No launch intent for $packageName") }

        // NEW_TASK is mandatory when starting an activity from a service or
        // application context, which is where automation runs from.
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        val started =
            runCatching {
                context.startActivity(launchIntent)
                true
            }.getOrElse { error ->
                Log.e(TAG, "Failed to launch $packageName", error)
                false
            }

        if (!started) return false

        return confirmForeground(packageName)
    }

    /**
     * Waits briefly for [packageName] to reach the foreground.
     *
     * Returns true when it does, and also when the foreground is unknowable - see [openApp]. A blocking
     * poll is acceptable here because every caller is already a suspending tool running off the main
     * thread, and the alternative (returning immediately) is the bug being fixed.
     */
    private fun confirmForeground(packageName: String): Boolean {
        if (currentPackageProvider() == null) {
            Log.i(TAG, "Cannot read the foreground app; trusting the launch of $packageName")
            return true
        }

        var waited = 0L
        while (waited < LAUNCH_CONFIRM_TIMEOUT_MS) {
            if (currentPackageProvider() == packageName) return true
            Thread.sleep(LAUNCH_POLL_INTERVAL_MS)
            waited += LAUNCH_POLL_INTERVAL_MS
        }

        // One last read, in case it arrived on the final interval.
        if (currentPackageProvider() == packageName) return true

        Log.w(TAG, "$packageName did not reach the foreground within ${LAUNCH_CONFIRM_TIMEOUT_MS}ms")
        return false
    }

    override fun openAppByName(query: String): InstalledApp? {
        val candidate = findApps(query).firstOrNull() ?: return null
        return if (openApp(candidate.packageName)) candidate else null
    }

    override fun listApps(includeSystem: Boolean): List<InstalledApp> =
        runCatching {
            packageManager
                .getInstalledApplications(PackageManager.GET_META_DATA)
                .asSequence()
                .filter { includeSystem || !it.isSystem() }
                // An app with no launcher entry cannot be opened, so listing it would offer the user a
                // target that never works. Applied unconditionally, unlike before: the filter was gated on
                // `includeSystem` being false, so asking for system apps also asked for every unlaunchable
                // service package on the device - hundreds of rows, none of them openable.
                .filter { packageManager.getLaunchIntentForPackage(it.packageName) != null }
                .map { it.toInstalledApp() }
                .sortedBy { it.label.lowercase() }
                .toList()
        }.getOrElse { error ->
            Log.e(TAG, "Failed to list installed apps", error)
            emptyList()
        }

    /**
     * Apps matching [query] by label or package.
     *
     * **Includes system apps.** It used to search `includeSystem = false`, which meant
     * `openAppByName("Settings")` could never find anything - Settings, Clock, Phone, Messages, Camera and
     * the browser are all system packages on a stock device, and they are precisely the apps a spoken goal
     * names. The launcher-entry filter in [listApps] is what keeps this list to things that can actually be
     * opened.
     *
     * Ranking lives in [AppRanking], which is pure and unit-tested: "open the clock" matching *Alarm Clock*
     * rather than *Clock* is a real failure with a real cause, and it should be provable without a device.
     */
    override fun findApps(query: String): List<InstalledApp> = AppRanking.rank(listApps(includeSystem = true), query)

    override fun currentScreen(): CurrentScreen =
        CurrentScreen(
            packageName = currentPackageProvider(),
            activityName = currentActivityProvider(),
        )

    private fun ApplicationInfo.isSystem(): Boolean =
        (flags and ApplicationInfo.FLAG_SYSTEM) != 0 ||
            (flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0

    private fun ApplicationInfo.toInstalledApp(): InstalledApp =
        InstalledApp(
            packageName = packageName,
            label = packageManager.getApplicationLabel(this).toString(),
            isSystemApp = isSystem(),
            versionName =
                runCatching {
                    @Suppress("DEPRECATION")
                    packageManager.getPackageInfo(packageName, 0).versionName
                }.getOrNull(),
        )

    private companion object {
        const val TAG = "AndroidAppManager"

        /**
         * How long to wait for a launched app to reach the foreground.
         *
         * A cold start on a slow device can take over a second, and reporting failure for an app that was
         * merely slow is worse than waiting - the agent would try a different approach to something that
         * had already worked.
         */
        const val LAUNCH_CONFIRM_TIMEOUT_MS = 2_500L
        const val LAUNCH_POLL_INTERVAL_MS = 150L
    }
}
