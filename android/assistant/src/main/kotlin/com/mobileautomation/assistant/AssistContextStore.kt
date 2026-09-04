package com.mobileautomation.assistant

import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.graphics.Bitmap
import android.os.Bundle

/**
 * What the system handed us when the assistant was summoned.
 *
 * Held in an object rather than passed along, because the session receives these on separate callbacks at times
 * it does not control, while the React panel asks for them later — after its window has appeared and its JS has
 * mounted. Without somewhere to park them the panel would routinely ask before they arrived.
 *
 * **Cleared when the session closes.** These are a screenshot and a full view tree of whatever app the user was
 * looking at: the most sensitive things this app ever holds. Keeping them past the exchange they belong to would
 * mean a later invocation could read the screen from an earlier one.
 *
 * The bitmap is deliberately **not** recycled here. The platform owns it and may still be using it; recycling a
 * bitmap the system handed us is how a `Canvas: trying to use a recycled bitmap` crash happens.
 */
object AssistContextStore {
    /** Screen identity at the moment of summoning, for the panel's header. */
    data class ScreenInfo(
        val packageName: String?,
        val activityName: String?,
    )

    @Volatile
    private var structure: AssistStructure? = null

    @Volatile
    private var content: AssistContent? = null

    @Volatile
    private var screenshot: Bitmap? = null

    @Volatile
    private var invocation: Bundle? = null

    fun putAssist(
        newStructure: AssistStructure?,
        newContent: AssistContent?,
    ) {
        structure = newStructure
        content = newContent
    }

    fun putScreenshot(bitmap: Bitmap?) {
        screenshot = bitmap
    }

    fun putInvocation(args: Bundle?) {
        invocation = args
    }

    fun structureOrNull(): AssistStructure? = structure

    fun screenshotOrNull(): Bitmap? = screenshot

    /**
     * Whether the system actually gave us screen context.
     *
     * Both null is a real and common state, not an error: the user can turn off "Use screen context" in assist
     * settings while still leaving this app as their assistant. The panel needs to know the difference between
     * "the screen was empty" and "we were not shown the screen", because the second is fixable and the first
     * is not.
     */
    fun hasScreenContext(): Boolean = structure != null || screenshot != null

    /**
     * The app the user was looking at, read from the assist structure.
     *
     * Read here rather than in the panel because `AssistStructure` is an Android type that must not cross the
     * bridge — and because reading it requires knowing that `getActivityComponent()` can be null even when the
     * structure is not.
     */
    fun screenInfo(): ScreenInfo {
        val component = runCatching { structure?.activityComponent }.getOrNull()

        return ScreenInfo(
            packageName = component?.packageName,
            activityName = component?.className,
        )
    }

    fun clear() {
        structure = null
        content = null
        // Not recycled: the platform owns this bitmap and may still be reading it.
        screenshot = null
        invocation = null
    }
}
