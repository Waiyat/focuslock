package com.focuslock.usage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo

/**
 * DEVELOPER-ONLY test plumbing for on-device verification.
 *
 * Lets adb configure/query the native engine directly so limits, real usage
 * measurement, sessions, locks and redirect enforcement can be exercised
 * without driving the full authenticated UI:
 *
 *   adb shell am broadcast -a com.focuslock.usage.DEV_SET_LIMITS \
 *     --es limits '[{"packageName":"com.android.chrome","appName":"Chrome","dailyLimitMs":30000,"enabled":true}]'
 *   adb shell am broadcast -a com.focuslock.usage.DEV_DUMP_STATUS
 *   adb shell am broadcast -a com.focuslock.usage.DEV_DUMP_USAGE --es pkg com.android.chrome
 *   adb shell am broadcast -a com.focuslock.usage.DEV_DUMP_EVENTS --es pkg com.android.chrome
 *   adb shell am broadcast -a com.focuslock.usage.DEV_REBUILD
 *
 * Every action refuses to run outside DEBUGGABLE builds — this is never a
 * production code path. It can only CONFIGURE limits (exactly what the UI
 * does); it can never bypass or unlock a lock.
 */
class DevTestReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val debuggable =
      (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    if (!debuggable) {
      ULog.w("DevTest", "Ignoring ${intent.action} — not a debuggable build")
      return
    }

    when (intent.action) {
      ACTION_SET_LIMITS -> {
        val limitsJson = intent.getStringExtra(EXTRA_LIMITS) ?: "[]"
        val count = Engine.setLimitsFromJson(context, limitsJson)
        Engine.setMonitoringEnabled(context, count > 0)
        val granted = UsageQueries.isUsageAccessGranted(context)
        if (count > 0 && granted) {
          MonitorService.start(context)
        } else if (count == 0) {
          MonitorService.stop(context)
        }
        ULog.i("DevTest", "SET_LIMITS count=$count usageAccessGranted=$granted")
      }

      ACTION_DUMP_STATUS -> {
        ULog.i("DevTest", "STATUS ${Engine.engineStatus(context)}")
      }

      ACTION_DUMP_USAGE -> {
        val pkg = intent.getStringExtra(EXTRA_PACKAGE)
        if (pkg.isNullOrEmpty()) {
          ULog.w("DevTest", "DUMP_USAGE requires --es pkg <package>")
          return
        }
        val now = System.currentTimeMillis()
        val usage = Engine.todayUsage(pkg)
        val sessions = Engine.sessionsForDay(pkg, startOfLocalDay(now))
        ULog.i("DevTest", "USAGE pkg=$pkg todayUsageMs=$usage sessions=$sessions")
      }

      ACTION_DUMP_EVENTS -> {
        val pkg = intent.getStringExtra(EXTRA_PACKAGE)
        if (pkg.isNullOrEmpty()) {
          ULog.w("DevTest", "DUMP_EVENTS requires --es pkg <package>")
          return
        }
        val end = System.currentTimeMillis()
        val events = Engine.usageEvents(pkg, end - 30 * 60 * 1000L, end)
        ULog.i("DevTest", "EVENTS pkg=$pkg rows=$events")
      }

      ACTION_REBUILD -> {
        Engine.rebuildNow()
        ULog.i("DevTest", "REBUILD complete — ${Engine.engineStatus(context)}")
      }
    }
  }

  companion object {
    const val ACTION_SET_LIMITS = "com.focuslock.usage.DEV_SET_LIMITS"
    const val ACTION_DUMP_STATUS = "com.focuslock.usage.DEV_DUMP_STATUS"
    const val ACTION_DUMP_USAGE = "com.focuslock.usage.DEV_DUMP_USAGE"
    const val ACTION_DUMP_EVENTS = "com.focuslock.usage.DEV_DUMP_EVENTS"
    const val ACTION_REBUILD = "com.focuslock.usage.DEV_REBUILD"
    const val EXTRA_LIMITS = "limits"
    const val EXTRA_PACKAGE = "pkg"
  }
}
