package com.mobileautomation.assistant

import android.content.Context
import android.graphics.Bitmap
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log
import android.view.View

/**
 * Produces a session when the assistant is invoked.
 *
 * ## The lifecycle mistake this file used to make
 *
 * A `VoiceInteractionSession` is created **once** and then reused: show, hide, show again all arrive on the same
 * instance. The first version treated each summoning as a fresh start — it built a React surface in `onShow` and
 * stopped it in `onHide`.
 *
 * That worked exactly once. A stopped `ReactSurface` cannot be restarted, so the second summoning had to build a
 * new one, and building a surface races the window that was created back on the first invocation. The panel simply
 * never appeared, with nothing logged to explain it.
 *
 * The documented shape is the one used here: **`onCreateContentView` supplies one long-lived view**, and show and
 * hide are visibility events. The surface is created once per session and released only in `onDestroy`.
 *
 * ## Consequences of one long-lived surface
 *
 * The JS tree survives between summonings, so the panel must be told when it is shown rather than inferring it
 * from mounting. `AssistPanelHost.onShown()` is what clears the previous exchange — without it the second
 * summoning would open on the first one's transcript, which is precisely the session-less promise broken.
 *
 * ## Why the panel is drawn in the session's own window
 *
 * The session already owns a system-level window, so the panel appears over any app without
 * `SYSTEM_ALERT_WINDOW` — a permission the user may well have declined. The tradeoff is that the window is
 * transient and the system may dismiss it, which is why only this panel lives here and the agent status strip
 * stays on `WindowManager`.
 */
class AutomationVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = AutomationSession(this)

    private class AutomationSession(
        context: Context,
    ) : VoiceInteractionSession(context) {
        /** The host that built our content, kept so show and hide can be forwarded to it. */
        private var boundHost: AssistPanelHost? = null

        /**
         * The content view, built once.
         *
         * Called by the platform during session creation, before the first `onShow`. Returning null is legitimate
         * and means there is nothing to display — the assistant can be summoned before the app has ever been
         * opened, so there may be no React host to build a surface from.
         */
        override fun onCreateContentView(): View? {
            val host = AssistPanelRegistry.hostOrNull()

            if (host == null) {
                Log.i(TAG, "No panel host registered; the session has no content")
                return null
            }

            boundHost = host

            return host.createContent(handle).also { view ->
                if (view == null) Log.w(TAG, "Panel host produced no view")
            }
        }

        override fun onPrepareShow(
            args: Bundle?,
            showFlags: Int,
        ) {
            super.onPrepareShow(args, showFlags)

            // Cleared before each summoning rather than after: a previous invocation's screenshot and view tree are
            // the most sensitive things this app holds, and they must not be readable by the next one.
            AssistContextStore.clear()
            AssistContextStore.putInvocation(args)
        }

        override fun onShow(
            args: Bundle?,
            showFlags: Int,
        ) {
            super.onShow(args, showFlags)

            val host = boundHost

            if (host == null) {
                // No content was built, so there is nothing to show. Closing beats an empty window the user has to
                // work out how to dismiss.
                Log.i(TAG, "Nothing to show; closing the session")
                hide()
                return
            }

            // The event that makes each summoning its own exchange. With one long-lived surface the JS tree does not
            // remount, so without this the panel would open on the previous conversation.
            host.onShown(AssistContextStore.hasScreenContext())
        }

        /**
         * The assist structure and content.
         *
         * Deprecated in favour of `onHandleAssist(AssistState)` from API 30, but the older signature is still called
         * on every version we support and the newer one is not available on our floor of API 26. Overriding this one
         * keeps a single path rather than two that must agree.
         */
        @Deprecated("Superseded by onHandleAssist(AssistState) on API 30+, which our minSdk predates.")
        override fun onHandleAssist(
            data: Bundle?,
            structure: android.app.assist.AssistStructure?,
            content: android.app.assist.AssistContent?,
        ) {
            @Suppress("DEPRECATION")
            super.onHandleAssist(data, structure, content)

            AssistContextStore.putAssist(structure, content)

            // Re-announced because assist data arrives *after* onShow: the panel has already been told whether it
            // has screen context, and that answer can change a moment later.
            boundHost?.onScreenContextChanged(AssistContextStore.hasScreenContext())
        }

        override fun onHandleScreenshot(screenshot: Bitmap?) {
            super.onHandleScreenshot(screenshot)

            // Stored, not used here. Whether the panel wants it depends on what the user asks, and pulling a
            // screenshot into JS memory on every summoning would cost megabytes for questions that never need it.
            AssistContextStore.putScreenshot(screenshot)
            boundHost?.onScreenContextChanged(AssistContextStore.hasScreenContext())
        }

        override fun onHide() {
            // Hidden, not destroyed. The surface stays alive for the next summoning; what ends is the exchange.
            boundHost?.onHidden()

            // The screen context ends with the window. This is what "no session" means at the Android level.
            AssistContextStore.clear()

            super.onHide()
        }

        override fun onDestroy() {
            // The only place the surface is released. Doing it in onHide is what broke the second summoning.
            boundHost?.releaseContent()
            boundHost = null

            AssistContextStore.clear()
            super.onDestroy()
        }

        /**
         * What the panel is allowed to do to this session.
         *
         * Narrow by design — ask to close, and report how tall the system bars are. A session exposes far more, and
         * handing all of it upward would let the panel drive a lifecycle it does not own.
         */
        private val handle =
            object : AssistSessionHandle {
                override fun close() {
                    hide()
                }
            }
    }

    private companion object {
        const val TAG = "AutomationAssistant"
    }
}
