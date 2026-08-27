package com.mobileautomation.tools.android

import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.util.Log
import com.mobileautomation.tools.AlarmTool
import com.mobileautomation.tools.model.AlarmRequest

/**
 * Creates alarms by handing an `AlarmClock` intent to the user's clock app.
 *
 * Deliberately not implemented with `AlarmManager`: an alarm this app scheduled
 * itself would only fire while the app survives, would not appear in the user's
 * clock app, and could not be edited or cancelled there. Delegating means the
 * alarm behaves exactly like one the user set by hand.
 */
class AndroidAlarmTool(
    private val context: Context,
) : AlarmTool {
    override fun createAlarm(request: AlarmRequest): Boolean {
        val intent =
            Intent(AlarmClock.ACTION_SET_ALARM).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(AlarmClock.EXTRA_HOUR, request.hour)
                putExtra(AlarmClock.EXTRA_MINUTES, request.minute)
                request.label?.let { putExtra(AlarmClock.EXTRA_MESSAGE, it) }

                // skipUi sets the alarm without opening the clock app. Honoured as
                // a hint only: some clock apps ignore it and show their UI anyway,
                // which is their prerogative.
                putExtra(AlarmClock.EXTRA_SKIP_UI, request.skipUi)

                if (request.isRecurring) {
                    // AlarmClock uses java.util.Calendar day constants where
                    // Sunday is 1, while the request models ISO days with Monday
                    // as 1. Translating here keeps the model standard.
                    putExtra(AlarmClock.EXTRA_DAYS, ArrayList(request.repeatDays.map { it.toCalendarDay() }))
                }
            }

        return runCatching {
            // No clock app is guaranteed to exist, e.g. on a stripped-down ROM.
            if (intent.resolveActivity(context.packageManager) == null) {
                Log.w(TAG, "No app on this device handles ACTION_SET_ALARM")
                return false
            }
            context.startActivity(intent)
            true
        }.getOrElse { error ->
            Log.e(TAG, "Failed to create alarm at ${request.formattedTime()}", error)
            false
        }
    }

    /** ISO day (Mon=1..Sun=7) to Calendar day (Sun=1..Sat=7). */
    private fun Int.toCalendarDay(): Int = if (this == 7) 1 else this + 1

    private companion object {
        const val TAG = "AndroidAlarmTool"
    }
}
