package com.mobileautomation.assist

import android.util.Log
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
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
 * session in `android/assistant` show a React surface it cannot see. That module must not know React Native exists,
 * so the dependency runs the other way and the app module hands it a host. The same trick `OverlayExclusivity`
 * uses.
 *
 * Registration happens **when the module is constructed**, not when a screen mounts. The assist gesture can be used
 * at any time, including with no activity in the foreground, so the host has to exist before any React tree does.
 *
 * ## Show and hide are events, not mounts
 *
 * The surface is built once per session and outlives each summoning, so the panel is told when it becomes visible
 * rather than inferring it from mounting. `assistPanelShown` is what clears the previous exchange — without it the
 * second summoning would open on the first one's transcript.
 *
 * That event also carries the **window insets**, because the panel is in the session's window rather than the
 * activity's: `react-native-safe-area-context` reads the activity's insets and would report the wrong numbers, or
 * zero, which is what drew the panel under the navigation bar.
 */
class AssistPanelModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val host by lazy { AssistPanelReactHost(reactContext) }

    /** The session currently bound, so `dismiss` from JS can close it. */
    @Volatile
    private var session: AssistSessionHandle? = null

    init {
        AssistPanelRegistry.register(
            object : AssistPanelHost {
                override fun createContent(session: AssistSessionHandle): View? = build(session)

                override fun onShown(hasScreenContext: Boolean) = announceShown(hasScreenContext)

                override fun onScreenContextChanged(hasScreenContext: Boolean) =
                    emit(EVENT_CONTEXT, hasScreenContext)

                override fun onHidden() = announceHidden()

                override fun releaseContent() = tearDown()
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
     * Also delivered as an event, since assist data can arrive after the panel is already showing. This synchronous
     * read is for the first paint.
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
     * Closes the panel.
     *
     * The session is asked to hide rather than the surface being stopped: hiding triggers `onHide`, which ends the
     * exchange *and* clears the stored screenshot and view tree. Stopping the surface here would leave the window
     * open, the context in memory, and — since a stopped surface cannot be restarted — no panel on the next
     * summoning.
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

    private fun build(handle: AssistSessionHandle): View? {
        session = handle

        return try {
            host.create()
        } catch (error: Throwable) {
            Log.w(NAME, "Could not build the assist panel", error)
            null
        }
    }

    private fun announceShown(hasScreenContext: Boolean) {
        // Claimed here rather than at build time, because content is created once while showing happens repeatedly —
        // and it is showing that must evict a visible agent strip.
        OverlayExclusivity.claim(OverlayExclusivity.Kind.ASSIST_PANEL)

        val insets = host.contentOrNull()?.let(WindowInsetsReader::read)

        emit(
            EVENT_SHOWN,
            Arguments.createMap().apply {
                putBoolean("hasScreenContext", hasScreenContext)
                // Sent with the show event rather than fetched by JS, so the very first paint is already inset. A
                // panel that corrects its own padding a frame later is visibly wrong on the way in.
                putInt("topInsetDp", insets?.topDp ?: 0)
                putInt("bottomInsetDp", insets?.bottomDp ?: DEFAULT_BOTTOM_INSET_DP)
            },
        )
    }

    private fun announceHidden() {
        OverlayExclusivity.release(OverlayExclusivity.Kind.ASSIST_PANEL)
        emit(EVENT_HIDDEN, null)
    }

    private fun tearDown() {
        session = null
        host.release()
        OverlayExclusivity.release(OverlayExclusivity.Kind.ASSIST_PANEL)
    }

    private fun emit(
        name: String,
        payload: Any?,
    ) {
        runCatching {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, payload)
        }
    }

    private fun quote(value: String?): String =
        if (value == null) {
            "null"
        } else {
            "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
        }

    companion object {
        const val NAME = "AssistPanel"

        const val EVENT_SHOWN = "assistPanelShown"
        const val EVENT_HIDDEN = "assistPanelHidden"
        const val EVENT_CONTEXT = "assistPanelScreenContext"

        /**
         * Used when the insets cannot be read.
         *
         * Matches `WindowInsetsReader`'s own floor. A wrong zero puts the send button under the navigation bar; a
         * wrong 24 is slightly loose spacing.
         */
        private const val DEFAULT_BOTTOM_INSET_DP = 24
    }
}
