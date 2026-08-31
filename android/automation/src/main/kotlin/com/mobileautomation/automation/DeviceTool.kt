package com.mobileautomation.automation

/**
 * The device tool surface exposed by the Automation Runtime.
 *
 * Both engines call these identical tools - the AI agent and the workflow
 * engine (ADR 0008) - and the MCP server exposes the same set to external
 * clients. Names must match `@mobile-automation/tool-sdk` exactly.
 *
 * Implementations land in Phase 2; the bridge that exposes them to React
 * Native is Phase 3.
 */
enum class DeviceTool(val toolName: String) {
    CLICK("click"),
    LONG_PRESS("longPress"),
    SWIPE("swipe"),
    TYPE_TEXT("typeText"),
    FIND_ELEMENT("findElement"),
    WAIT_FOR_ELEMENT("waitForElement"),
    GET_UI_TREE("getUiTree"),
    TAKE_SCREENSHOT("takeScreenshot"),
    PRESS_BACK("pressBack"),
    PRESS_HOME("pressHome"),
    OPEN_APP("openApp"),
    OPEN_APP_BY_NAME("openAppByName"),
    LIST_APPS("listApps"),
    GET_CURRENT_SCREEN("getCurrentScreen"),
    GET_CONTACTS("getContacts"),
    FIND_CONTACTS("findContacts"),
    CREATE_ALARM("createAlarm"),
    READ_CLIPBOARD("readClipboard"),
    WRITE_CLIPBOARD("writeClipboard"),
    SEND_NOTIFICATION("sendNotification"),
    LAUNCH_INTENT("launchIntent"),
    GET_SYSTEM_SETTING("getSystemSetting"),
    CONTROL_MEDIA("controlMedia"),
    ADJUST_VOLUME("adjustVolume"),
    SEND_SMS("sendSms"),
    READ_SMS("readSms"),
    PLACE_CALL("placeCall"),
    END_CALL("endCall"),
    SET_SYSTEM_SETTING("setSystemSetting"),
    SET_RINGER_MODE("setRingerMode"),
    ;

    companion object {
        val toolNames: List<String> = entries.map { it.toolName }

        fun fromToolName(name: String): DeviceTool? = entries.firstOrNull { it.toolName == name }
    }
}
