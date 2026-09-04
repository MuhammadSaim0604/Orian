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
 * ## What changed
 *
 * This used to close itself immediately. That was correct while the assistant role was held only to appear in the
 * picker and there was nothing to show — presenting a UI then would have hijacked the assist gesture for no
 * benefit.
 *
 * Now the gesture is the point. A long-press on home summons Orion Assist over whatever the user is looking at,
 * which is the one thing the assistant role gives us that nothing else can: **a way in from anywhere**, with no
 * overlay permission and no launcher round trip.
 *
 * ## Why the panel is drawn in the session's own window
 *
 * A `VoiceInteractionSession` already owns a system-level window. Drawing into it means the panel appears over any
 * app without `SYSTEM_ALERT_WINDOW`, which is a permission a user may well have declined. The tradeoff is that the
 * window is **transient** — the system may dismiss it, and it is not suitable for anything that must survive a run.
 * That is why the agent status strip stays on `WindowManager` and only this panel lives here.
 *
 * ## Screen context is requested, not assumed
 *
 * `onShow` asks for the structure and the screenshot, but both can arrive null: the user can turn off "Use screen
 * context" in assist settings while leaving this app as their assistant. `AssistContextStore.hasScreenContext()`
 * is what lets the panel tell "the screen was empty" from "we were not shown the screen" — the second is fixable
 * and worth saying so.
 */
class AutomationVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = AutomationSession(this)

    private class AutomationSession(
        context: Context,
    ) : VoiceInteractionSession(context) {
        /** Whether a panel was shown, so `onHide` only tears down what it built. */
        private var showing = false

        override fun onPrepareShow(
            args: Bundle?,
            showFlags: Int,
        ) {
            super.onPrepareShow(args, showFlags)

            // Cleared here rather than in onShow: a previous invocation's screenshot and view tree are the most
            // sensitive things this app holds, and they must not be readable by the next one.
            AssistContextStore.clear()
            AssistContextStore.putInvocation(args)
        }

        override fun onShow(
            args: Bundle?,
            showFlags: Int,
        ) {
            super.onShow(args, showFlags)

            val host = AssistPanelRegistry.hostOrNull()

            if (host == null) {
                // Normal, not exceptional: the assistant can be summoned before the app has ever been opened, so
                // there is no React host to build a surface from. Closing is better than an empty window the user
                // has to work out how to dismiss.
                Log.i(TAG, "No panel host registered; closing the session")
                hide()
                return
            }

            showing = host.show(handle)

            if (!showing) {
                Log.w(TAG, "Panel host declined to show; closing the session")
                hide()
            }
        }

        /**
         * The assist structure and content.
         *
         * Deprecated in favour of `onHandleAssist(AssistState)` from API 30, but the older signature is still
         * called on every version we support and the newer one is not available on our floor of API 26. Overriding
         * this one keeps a single path rather than two that must agree.
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
        }

        override fun onHandleScreenshot(screenshot: Bitmap?) {
            super.onHandleScreenshot(screenshot)

            // Stored, not used here. Whether the panel wants it depends on what the user asks, and capturing a
            // screenshot into JS memory on every summoning would cost megabytes for questions that never need it.
            AssistContextStore.putScreenshot(screenshot)
        }

        override fun onHide() {
            if (showing) {
                AssistPanelRegistry.hostOrNull()?.hide()
                showing = false
            }

            // The exchange ends with the window. This is what "no session" means at the Android level: nothing
            // survives the panel closing.
            AssistContextStore.clear()

            super.onHide()
        }

        /**
         * What the panel is allowed to do to this session.
         *
         * Narrow by design — set a view, ask to close. A session exposes far more, and handing all of it upward
         * would let the panel drive a lifecycle it does not own.
         */
        private val handle =
            object : AssistSessionHandle {
                override fun setContent(view: View) {
                    setContentView(view)
                }

                override fun close() {
                    hide()
                }
            }
    }

    private companion object {
        const val TAG = "AutomationAssistant"
    }
}
