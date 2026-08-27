package com.mobileautomation.tools.android

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.util.Log
import com.mobileautomation.tools.ClipboardTool

/**
 * Clipboard access via `ClipboardManager`.
 *
 * From Android 10 the clipboard is only readable while the app holds focus, which
 * automation running behind another app does not. A read returning null is
 * therefore an expected outcome, not a bug - callers must handle it rather than
 * assume the clipboard was empty.
 */
class AndroidClipboardTool(
    private val context: Context,
) : ClipboardTool {
    private val clipboardManager: ClipboardManager?
        get() = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager

    override fun readClipboard(): String? =
        runCatching {
            val clip = clipboardManager?.primaryClip ?: return null
            if (clip.itemCount == 0) return null
            clip.getItemAt(0)?.coerceToText(context)?.toString()?.takeIf { it.isNotEmpty() }
        }.getOrElse { error ->
            Log.w(TAG, "Clipboard read failed; the app may not have focus", error)
            null
        }

    override fun writeClipboard(text: String): Boolean =
        runCatching {
            clipboardManager?.setPrimaryClip(ClipData.newPlainText(CLIP_LABEL, text)) ?: return false
            true
        }.getOrElse { error ->
            Log.e(TAG, "Clipboard write failed", error)
            false
        }

    override fun clearClipboard() {
        // Overwriting with empty text rather than calling clearPrimaryClip(),
        // which only exists from API 28.
        runCatching { clipboardManager?.setPrimaryClip(ClipData.newPlainText(CLIP_LABEL, "")) }
            .onFailure { Log.w(TAG, "Clipboard clear failed", it) }
    }

    private companion object {
        const val TAG = "AndroidClipboardTool"
        const val CLIP_LABEL = "MobileAutomation"
    }
}
