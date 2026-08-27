package com.mobileautomation.accessibility.service

/**
 * Holds the live accessibility service instance.
 *
 * The system owns the service lifecycle: it constructs the service when the user
 * enables it in Settings and destroys it when they turn it off or the process
 * dies. Nothing in the app can create one on demand, so a process-wide holder is
 * the only way for the rest of the app to reach it.
 *
 * Deliberately narrow: it stores a [ScreenReader] and nothing else, so no caller
 * can reach through it into the raw `AccessibilityService` and bypass the typed
 * API. Thread-safe because the service connects on the main thread while tools
 * may query from a background dispatcher.
 */
object AccessibilityConnection {
    @Volatile
    private var reader: ScreenReader? = null

    @Volatile
    private var actionPerformer: NodeActionPerformer? = null

    private val listeners = mutableListOf<(Boolean) -> Unit>()

    /**
     * Observers of screen changes.
     *
     * The bridge subscribes here rather than the service calling into it, because
     * the accessibility module must not depend on the app layer. Kept separate from
     * [listeners] because these fire far more often and for a different reason.
     */
    private val screenChangeListeners = mutableListOf<(String) -> Unit>()

    /** True when the user has enabled the service and it is connected. */
    val isConnected: Boolean
        get() = reader?.isAvailable == true

    /**
     * The connected reader, or null when the service is not running.
     *
     * Callers must handle null rather than assume: the user can revoke the
     * accessibility grant at any moment, including mid-workflow.
     */
    fun readerOrNull(): ScreenReader? = reader?.takeIf { it.isAvailable }

    /** The action performer, or null when the service is not connected. */
    fun actionPerformerOrNull(): NodeActionPerformer? = actionPerformer?.takeIf { isConnected }

    /** Called by the service from `onServiceConnected`. */
    fun attach(reader: ScreenReader) {
        this.reader = reader
        this.actionPerformer = reader as? NodeActionPerformer
        notifyListeners(true)
    }

    /** Called by the service from `onUnbind`/`onDestroy`. */
    fun detach() {
        reader = null
        actionPerformer = null
        notifyListeners(false)
    }

    /**
     * Observes connection changes so the UI can reflect whether automation is
     * currently possible, and a running workflow can abort promptly if the user
     * revokes the permission.
     */
    fun addConnectionListener(listener: (Boolean) -> Unit) {
        synchronized(listeners) { listeners.add(listener) }
    }

    fun removeConnectionListener(listener: (Boolean) -> Unit) {
        synchronized(listeners) { listeners.remove(listener) }
    }

    /** Test seam: drops the reader and every listener. */
    fun reset() {
        reader = null
        actionPerformer = null
        synchronized(listeners) { listeners.clear() }
        synchronized(screenChangeListeners) { screenChangeListeners.clear() }
    }

    /**
     * Subscribes to screen changes.
     *
     * @param listener receives `window_changed` or `content_changed`. Called on the
     *   service's event thread, so it must not block.
     */
    fun addScreenChangeListener(listener: (String) -> Unit) {
        synchronized(screenChangeListeners) { screenChangeListeners.add(listener) }
    }

    fun removeScreenChangeListener(listener: (String) -> Unit) {
        synchronized(screenChangeListeners) { screenChangeListeners.remove(listener) }
    }

    /** Called by the service on every relevant accessibility event. */
    fun notifyScreenChanged(reason: String) {
        val snapshot = synchronized(screenChangeListeners) { screenChangeListeners.toList() }
        // A throwing listener must not break the service's event callback.
        snapshot.forEach { listener -> runCatching { listener(reason) } }
    }

    private fun notifyListeners(connected: Boolean) {
        val snapshot = synchronized(listeners) { listeners.toList() }
        // A misbehaving listener must not prevent the others from being told, nor
        // break the service lifecycle callback that triggered this.
        snapshot.forEach { listener -> runCatching { listener(connected) } }
    }
}
