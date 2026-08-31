package com.mobileautomation.automation

import com.mobileautomation.accessibility.model.UiTree
import com.mobileautomation.accessibility.service.GlobalAction
import com.mobileautomation.accessibility.service.NodeActionPerformer
import com.mobileautomation.accessibility.service.ScreenReader
import com.mobileautomation.screen.CaptureResult
import com.mobileautomation.screen.ScreenCapture
import com.mobileautomation.tools.AlarmTool
import com.mobileautomation.tools.AppManager
import com.mobileautomation.tools.ClipboardTool
import com.mobileautomation.tools.ContactsReader
import com.mobileautomation.tools.IntentRequest
import com.mobileautomation.tools.IntentTool
import com.mobileautomation.tools.MediaCommand
import com.mobileautomation.tools.MediaTool
import com.mobileautomation.tools.MissingPermissionException
import com.mobileautomation.tools.NotificationTool
import com.mobileautomation.tools.PhoneTool
import com.mobileautomation.tools.RingerMode
import com.mobileautomation.tools.RingerTool
import com.mobileautomation.tools.SensitiveCapability
import com.mobileautomation.tools.SmsTool
import com.mobileautomation.tools.SystemSettingsReader
import com.mobileautomation.tools.SystemSettingsWriter
import com.mobileautomation.tools.VolumeDirection
import com.mobileautomation.tools.model.AlarmRequest
import com.mobileautomation.tools.model.Contact
import com.mobileautomation.tools.model.CurrentScreen
import com.mobileautomation.tools.model.InstalledApp
import com.mobileautomation.tools.model.SmsMessage

/**
 * Fakes for every capability the runtime composes.
 *
 * Together these make the runtime fully unit-testable: the resolve-then-act
 * sequence at the heart of the product can be exercised without an emulator, and
 * failure paths that are hard to provoke on a device - a secure window, a revoked
 * permission, a field that rejects text - become ordinary test cases.
 */

class FakeScreenReader(
    override var isAvailable: Boolean = true,
    var tree: UiTree? = null,
    private val packageName: String? = "com.whatsapp",
    private val activityName: String? = "com.whatsapp.Conversation",
) : ScreenReader {
    var captureCount: Int = 0
        private set

    override fun captureUiTree(): UiTree? {
        captureCount++
        return tree
    }

    override fun currentPackageName(): String? = packageName

    override fun currentActivityName(): String? = activityName
}

class FakeNodeActionPerformer(
    var setTextSucceeds: Boolean = true,
    var clickSucceeds: Boolean = true,
) : NodeActionPerformer {
    val setTextCalls = mutableListOf<Pair<String, String>>()
    val clickCalls = mutableListOf<String>()
    val focusCalls = mutableListOf<String>()

    override fun setText(
        structuralPath: String,
        text: String,
    ): Boolean {
        setTextCalls.add(structuralPath to text)
        return setTextSucceeds
    }

    override fun performClick(structuralPath: String): Boolean {
        clickCalls.add(structuralPath)
        return clickSucceeds
    }

    override fun performFocus(structuralPath: String): Boolean {
        focusCalls.add(structuralPath)
        return true
    }
}

class FakeScreenCapture(
    var result: CaptureResult = CaptureResult.ConsentRequired,
    override var isReady: Boolean = true,
) : ScreenCapture {
    var released: Boolean = false
        private set

    override suspend fun capture(): CaptureResult = result

    override fun release() {
        released = true
    }
}

class FakeAppManager(
    private val apps: List<InstalledApp> = emptyList(),
    var openSucceeds: Boolean = true,
    private val currentScreen: CurrentScreen = CurrentScreen("com.whatsapp", "com.whatsapp.Conversation"),
) : AppManager {
    val opened = mutableListOf<String>()

    override fun openApp(packageName: String): Boolean {
        opened.add(packageName)
        return openSucceeds && apps.any { it.packageName == packageName }
    }

    override fun openAppByName(query: String): InstalledApp? {
        val match = findApps(query).firstOrNull() ?: return null
        return if (openApp(match.packageName)) match else null
    }

    override fun listApps(includeSystem: Boolean): List<InstalledApp> = apps.filter { includeSystem || !it.isSystemApp }

    override fun findApps(query: String): List<InstalledApp> = apps.filter { it.matches(query) }

    override fun currentScreen(): CurrentScreen = currentScreen
}

class FakeContactsReader(
    private val contacts: List<Contact> = emptyList(),
    /** When set, every call throws as though the permission were revoked. */
    private val missingPermission: SensitiveCapability? = null,
) : ContactsReader {
    override fun getContacts(limit: Int): List<Contact> {
        missingPermission?.let { throw MissingPermissionException(it) }
        return contacts.take(limit)
    }

    override fun findContacts(
        query: String,
        limit: Int,
    ): List<Contact> {
        missingPermission?.let { throw MissingPermissionException(it) }
        return contacts.filter { it.matches(query) }.take(limit)
    }
}

class FakeClipboardTool(
    var content: String? = null,
    var writeSucceeds: Boolean = true,
) : ClipboardTool {
    override fun readClipboard(): String? = content

    override fun writeClipboard(text: String): Boolean {
        if (!writeSucceeds) return false
        content = text
        return true
    }

    override fun clearClipboard() {
        content = null
    }
}

class FakeAlarmTool(
    var succeeds: Boolean = true,
) : AlarmTool {
    val created = mutableListOf<AlarmRequest>()

    override fun createAlarm(request: AlarmRequest): Boolean {
        created.add(request)
        return succeeds
    }
}

class FakeNotificationTool(
    var succeeds: Boolean = true,
) : NotificationTool {
    val posted = mutableListOf<Pair<String, String>>()

    override fun sendNotification(
        title: String,
        body: String,
        channelId: String,
    ): Boolean {
        posted.add(title to body)
        return succeeds
    }
}

class FakeIntentTool(
    var succeeds: Boolean = true,
) : IntentTool {
    val launched = mutableListOf<IntentRequest>()

    override fun launchIntent(request: IntentRequest): Boolean {
        launched.add(request)
        return succeeds
    }
}

class FakeSystemSettingsReader(
    private val settings: Map<String, String> = emptyMap(),
) : SystemSettingsReader {
    override fun getSystemSetting(key: String): String? = settings[key]

    override fun isAirplaneModeOn(): Boolean = settings["airplane_mode_on"] == "1"

    override fun screenBrightness(): Int? = settings["screen_brightness"]?.toIntOrNull()
}

/** Records global actions and reports a scripted outcome. */
class RecordingGlobalActionPerformer(
    private val succeeds: Boolean = true,
) : (GlobalAction) -> Boolean {
    val performed = mutableListOf<GlobalAction>()

    override fun invoke(action: GlobalAction): Boolean {
        performed.add(action)
        return succeeds
    }
}

class FakeMediaTool(
    override var isAnythingPlaying: Boolean = true,
    var controlSucceeds: Boolean = true,
    var volumeSucceeds: Boolean = true,
) : MediaTool {
    val commands = mutableListOf<MediaCommand>()
    val volumeChanges = mutableListOf<VolumeDirection>()

    override fun control(command: MediaCommand): Boolean {
        commands.add(command)
        return controlSucceeds
    }

    override fun adjustVolume(direction: VolumeDirection): Boolean {
        volumeChanges.add(direction)
        return volumeSucceeds
    }
}

/**
 * Records sends and returns scripted messages.
 *
 * [permitted] models the permission rather than a `PermissionGate`, because what the runtime has to get
 * right is turning a `MissingPermissionException` into a typed error - so the fake throws the real
 * exception the real tool throws.
 */
class FakeSmsTool(
    var permitted: Boolean = true,
    var sendSucceeds: Boolean = true,
    private val messages: List<SmsMessage> = emptyList(),
) : SmsTool {
    val sent = mutableListOf<Pair<String, String>>()
    val reads = mutableListOf<Pair<Int, String?>>()

    override fun sendSms(
        phoneNumber: String,
        body: String,
    ): Boolean {
        if (!permitted) throw MissingPermissionException(SensitiveCapability.SMS)
        sent.add(phoneNumber to body)
        return sendSucceeds
    }

    override fun readRecentSms(
        limit: Int,
        fromNumber: String?,
    ): List<SmsMessage> {
        if (!permitted) throw MissingPermissionException(SensitiveCapability.SMS)
        reads.add(limit to fromNumber)
        return messages
    }
}

class FakePhoneTool(
    var permitted: Boolean = true,
    var callSucceeds: Boolean = true,
    var dialerSucceeds: Boolean = true,
    var endSucceeds: Boolean = true,
    override var isCallInProgress: Boolean = false,
) : PhoneTool {
    val calls = mutableListOf<String>()
    val dialed = mutableListOf<String>()
    var endedCalls: Int = 0
        private set

    override fun placeCall(phoneNumber: String): Boolean {
        if (!permitted) throw MissingPermissionException(SensitiveCapability.PHONE)
        calls.add(phoneNumber)
        return callSucceeds
    }

    override fun openDialer(phoneNumber: String): Boolean {
        // Deliberately ungated: the no-permission fallback is the whole reason this exists.
        dialed.add(phoneNumber)
        return dialerSucceeds
    }

    override fun endCall(): Boolean {
        if (!permitted) throw MissingPermissionException(SensitiveCapability.PHONE)
        endedCalls++
        return endSucceeds
    }
}

class FakeSystemSettingsWriter(
    var permitted: Boolean = true,
    var writeSucceeds: Boolean = true,
    private val allowed: Set<String> = setOf("screen_brightness", "screen_off_timeout"),
) : SystemSettingsWriter {
    val writes = mutableListOf<Pair<String, String>>()

    override fun putSystemSetting(
        key: String,
        value: String,
    ): Boolean {
        if (!permitted) throw MissingPermissionException(SensitiveCapability.WRITE_SETTINGS)
        require(key in allowed) { "$key is not a writable setting" }
        writes.add(key to value)
        return writeSucceeds
    }

    override fun writableKeys(): List<String> = allowed.toList()
}

class FakeRingerTool(
    var permitted: Boolean = true,
    var setSucceeds: Boolean = true,
    private var current: RingerMode? = RingerMode.NORMAL,
) : RingerTool {
    val modes = mutableListOf<RingerMode>()

    override fun setRingerMode(mode: RingerMode): Boolean {
        // Only silent and vibrate need policy access, mirroring the real tool - a phone being returned to
        // normal should never fail for want of a permission.
        if (mode.requiresPolicyAccess && !permitted) {
            throw MissingPermissionException(SensitiveCapability.DO_NOT_DISTURB)
        }

        modes.add(mode)
        if (setSucceeds) current = mode
        return setSucceeds
    }

    override fun currentRingerMode(): RingerMode? = current
}
