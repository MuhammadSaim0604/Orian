package com.mobileautomation.tools

import com.mobileautomation.tools.model.InstalledApp

/**
 * Ranking installed apps against a name a person typed or spoke.
 *
 * Pure, and separate from `AndroidAppManager`, because this is the part with a right and a wrong answer while
 * the rest of that class is `PackageManager` plumbing that can only be exercised on a device. "Open the clock"
 * matching *Alarm Clock* instead of *Clock* is a real failure with a real cause, and it should be provable off
 * a phone.
 *
 * The tiers, strongest first:
 *
 * 1. **An exact label match.** If an app is called what the user said, that is the app.
 * 2. **A label that starts with the query.** "Clock" should beat "Alarm Clock", which merely contains it.
 * 3. **A user-installed app over a preinstalled one.** Someone who installed their own clock app means that
 *    one; the stock app is the fallback.
 * 4. **The shorter label.** "Messages" beats "Messages Backup" - less extra text means a closer match.
 *
 * Ties break on the label and then the package name, so the order is stable rather than dependent on whatever
 * order the package manager happened to return. Two apps with the same label are otherwise separated only by
 * their package, and without that last tier the same goal could open different apps on different runs.
 */
object AppRanking {
    /**
     * [apps] that plausibly match [query], best first.
     *
     * Empty for a blank query rather than everything: "open the app called nothing" is a caller mistake, and
     * returning the whole app list would have the agent launch something arbitrary.
     */
    fun rank(
        apps: List<InstalledApp>,
        query: String,
    ): List<InstalledApp> {
        val needle = query.trim()
        if (needle.isEmpty()) return emptyList()

        return apps
            .filter { it.matches(needle) }
            .sortedWith(
                compareByDescending<InstalledApp> { it.label.equals(needle, ignoreCase = true) }
                    .thenByDescending { it.label.startsWith(needle, ignoreCase = true) }
                    .thenBy { it.isSystemApp }
                    .thenBy { it.label.length }
                    .thenBy { it.label.lowercase() }
                    .thenBy { it.packageName },
            )
    }

    /** The single best match, or null when nothing matched. */
    fun best(
        apps: List<InstalledApp>,
        query: String,
    ): InstalledApp? = rank(apps, query).firstOrNull()
}
