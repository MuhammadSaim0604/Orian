package com.mobileautomation.tools

/**
 * Media playback commands.
 *
 * Scoped deliberately to *control*. Reading what is currently playing needs
 * notification-listener access, and reading media files needs `READ_MEDIA_*`;
 * both are sensitive grants the Phase 2 permission table does not authorise, so
 * they are out of scope rather than quietly added.
 *
 * Control needs no permission at all: the commands are delivered as media key
 * events, exactly as a headset button would.
 */
enum class MediaCommand(val keyCode: Int) {
    PLAY_PAUSE(85),
    PLAY(126),
    PAUSE(127),
    STOP(86),
    NEXT(87),
    PREVIOUS(88),
    FAST_FORWARD(90),
    REWIND(89),
    ;

    companion object {
        val names: List<String> = entries.map { it.name.lowercase() }

        fun fromName(name: String): MediaCommand? = entries.firstOrNull { it.name.equals(name, ignoreCase = true) }
    }
}

/**
 * Direction of a volume adjustment.
 *
 * Relative rather than absolute: setting an absolute level requires
 * `MODIFY_AUDIO_SETTINGS` and overrides what the user chose, while a nudge is
 * what an automation actually wants ("turn it down a bit").
 */
enum class VolumeDirection(val platformDirection: Int) {
    DOWN(-1),
    UP(1),
    ;

    companion object {
        fun fromName(name: String): VolumeDirection? = entries.firstOrNull { it.name.equals(name, ignoreCase = true) }
    }
}

/**
 * Controls media playback on the device.
 *
 * Commands go to whichever app currently holds the media session, which is the
 * behaviour a user expects: "pause" pauses what they are listening to without
 * automation needing to know or name the app.
 */
interface MediaTool {
    /** True when something is currently holding an active media session. */
    val isAnythingPlaying: Boolean

    /**
     * Sends [command] to the active media session.
     *
     * Returns false when nothing is playing, since a play/pause with no session
     * silently does nothing and reporting success would mislead a workflow.
     */
    fun control(command: MediaCommand): Boolean

    /** Nudges the music stream volume one step in [direction]. */
    fun adjustVolume(direction: VolumeDirection): Boolean
}
