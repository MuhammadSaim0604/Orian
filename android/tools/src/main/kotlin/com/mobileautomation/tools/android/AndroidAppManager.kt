package com.mobileautomation.tools.android

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.util.Log
import com.mobileautomation.tools.AppManager
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

    override fun openApp(packageName: String): Boolean {
        val launchIntent =
            packageManager.getLaunchIntentForPackage(packageName)
                ?: return false.also { Log.w(TAG, "No launch intent for $packageName") }

        // NEW_TASK is mandatory when starting an activity from a service or
        // application context, which is where automation runs from.
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        return runCatching {
            context.startActivity(launchIntent)
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to launch $packageName", error)
            false
        }
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
                // An app with no launcher entry cannot be opened, so listing it
                // would offer the user a target that never works.
                .filter { includeSystem || packageManager.getLaunchIntentForPackage(it.packageName) != null }
                .map { it.toInstalledApp() }
                .sortedBy { it.label.lowercase() }
                .toList()
        }.getOrElse { error ->
            Log.e(TAG, "Failed to list installed apps", error)
            emptyList()
        }

    override fun findApps(query: String): List<InstalledApp> {
        val needle = query.trim()
        if (needle.isEmpty()) return emptyList()

        return listApps(includeSystem = false)
            .filter { it.matches(needle) }
            // An exact label match is what the user meant; rank it first, then
            // prefer shorter labels so "Messages" beats "Messages Backup".
            .sortedWith(
                compareByDescending<InstalledApp> { it.label.equals(needle, ignoreCase = true) }
                    .thenBy { it.label.length },
            )
    }

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
    }
}
