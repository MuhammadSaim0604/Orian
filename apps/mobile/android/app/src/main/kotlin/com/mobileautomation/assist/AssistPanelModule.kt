package com.mobileautomation.assist

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.mobileautomation.assistant.AssistContextStore
import com.mobileautomation.assistant.AssistPanelHost
import com.mobileautomation.assistant.AssistPanelRegistry
import com.mobileautomation.assistant.AssistSessionHandle
import com.mobileautomation.overlays.OverlayExclusivity

/**
 * The Orion Assist panel, surfaced to JS.
 *
 * ## Where the wiring happens
 *
 * This module registers itself with `AssistPanelRegistry` on construction, which is what lets the voice-interaction
 * session in `android/assistant` show a React surface it cannot see. That module must not know React Native exists
 * — it is depended on by the app module only so its three service declarations merge into the manifest — so the
 * dependency runs the other way and the app module hands it a host. The same trick `OverlayExclusivity` uses.
 *
 * Registration happens **when the module is constructed**, not when a screen mounts. The assist gesture can be used
 * at any time, including with no activity in the foreground, so the host has to exist before any React tree does.
 *
 * ## The panel is not a window this module owns
 *
 * Unlike `OverlayModule` and `AgentOverlayModule`, nothing here calls `WindowManager`. The session already owns a
 * system window and the panel is drawn into it, which is exactly why it needs no overlay permission. What this
 * module does own is the surface and the exclusivity claim.
 */
class AssistPanelModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val host by lazy { AssistPanelReactHost(reactContext) }

    /** The session currently showing the panel, so `dismiss` from JS can close it. */
    @Volatile
    private var session: AssistSessionHandle? = null

    init {
        AssistPanelRegistry.register(
            object : AssistPanelHost {
                override fun show(session: AssistSessionHandle): Boolean = present(session)

                override fun hide() = tearDown()
            },
        )

        // Registered so a claim by either other overlay dismisses this panel. The assist panel is transient and the
        // agent strip is not, so being evicted is the correct outcome rather than a lost feature.
        OverlayExclusivity.registerEvictor(OverlayExclusivity.Kind.ASSIST_PANEL) {
            session?.let { active -> runCatching { active.close() } }
        }
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        AssistPanelRegistry.unregister()
        tearDown()
        super.invalidate()
    }

    /**
     * Whether the system gave us screen context this time.
     *
     * Read by the panel to tell "the screen was empty" from "we were not shown the screen". The second is fixable —
     * the user has turned off "Use screen context" in assist settings — and worth saying so rather than letting the
     * assistant look incapable.
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun hasScreenContext(): Boolean = AssistContextStore.hasScreenContext()

    /** The app the user was looking at when they summoned the panel, as JSON. */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getScreenInfo(): String {
        val info = AssistContextStore.screenInfo()

        // Hand-rolled rather than via org.json, matching the rest of the bridge: org.json is stubbed in Android JVM
        // unit tests and returns defaults, so anything built with it cannot be tested off-device.
        return buildString {
            append('{')
            append("\"packageName\":").append(quote(info.packageName)).append(',')
            append("\"activityName\":").append(quote(info.activityName))
            append('}')
        }
    }

    /**
     * Closes the panel from JS.
     *
     * The session is asked to hide rather than the surface being stopped directly: hiding triggers `onHide`, which
     * runs the teardown *and* clears the stored screenshot and view tree. Stopping the surface here would leave the
     * window open and the context in memory.
     */
    @ReactMethod
    fun dismiss(promise: Promise) {
        val active = session

        if (active == null) {
            promise.resolve(false)
            return
        }

        runCatching { active.close() }
        promise.resolve(true)
    }

    /** Shows the panel in [handle]'s window. Returns whether a surface was actually created. */
    private fun present(handle: AssistSessionHandle): Boolean =
        try {
            // Claimed before showing, so a visible agent strip or toolset panel is dismissed first. Without this the
            // user could face two floating windows each with its own stop button.
            OverlayExclusivity.claim(OverlayExclusivity.Kind.ASSIST_PANEL)

            session = handle
            handle.setContent(host.createView(AssistContextStore.hasScreenContext()))
            true
        } catch (error: Throwable) {
            // A failure here means the session is about to close, so the claim must not be left behind — the next
            // overlay to show would otherwise evict a panel that no longer exists.
            Log.w(NAME, "Could not present the assist panel", error)
            tearDown()
            false
        }

    private fun tearDown() {
        session = null
        host.release()
        OverlayExclusivity.release(OverlayExclusivity.Kind.ASSIST_PANEL)
    }

    private fun quote(value: String?): String =
        if (value == null) {
            "null"
        } else {
            "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
        }

    companion object {
        const val NAME = "AssistPanel"
    }
}
