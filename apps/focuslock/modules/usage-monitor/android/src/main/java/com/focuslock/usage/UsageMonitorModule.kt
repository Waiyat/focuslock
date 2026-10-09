package com.focuslock.usage

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Small React Native bridge over the Android usage engine.
 *
 * Read APIs return ONLY real device data (UsageStatsManager-backed). Complex
 * configuration travels as JSON (setLimits). Enforcement stays native — JS
 * receives events + status, it never drives enforcement itself.
 */
class UsageMonitorModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("FocusLockUsage")

    Events(
      "onUsageUpdated",
      "onLimitWarning",
      "onLimitReached",
      "onLockTriggered"
    )

    OnStartObserving {
      Engine.listener = { name, payload ->
        mainHandler.post { sendEvent(name, payload) }
      }
    }
    OnStopObserving {
      Engine.listener = null
    }

    // ---- Special-access states (never faked) -------------------------------

    AsyncFunction("isUsageAccessGranted") {
      appContext.reactContext?.let { UsageQueries.isUsageAccessGranted(it) } ?: false
    }

    AsyncFunction("isOverlayGranted") {
      appContext.reactContext?.let { AppLockManager.isOverlayGranted(it) } ?: false
    }

    AsyncFunction("canEnforce") {
      appContext.reactContext?.let { AppLockManager.canEnforce(it) } ?: false
    }

    AsyncFunction("openUsageAccessSettings") {
      appContext.reactContext?.let { openUsageAccessSettings(it) }
    }

    AsyncFunction("openOverlaySettings") {
      appContext.reactContext?.let { AppLockManager.openOverlaySettings(it) }
    }

    // ---- Foreground / events ----------------------------------------------

    AsyncFunction("getCurrentForegroundApp") {
      Engine.currentForeground()
    }

    // ---- Usage & session reads (real Android data) -------------------------

    AsyncFunction("getTodayUsage") { packageName: String ->
      Engine.todayUsage(packageName)
    }

    AsyncFunction("getUsageForRange") { packageName: String, start: Long, end: Long ->
      Engine.usageForRange(packageName, start, end)
    }

    AsyncFunction("getUsageEvents") { packageName: String, start: Long, end: Long ->
      Engine.usageEvents(packageName, start, end)
    }

    // ---- Analytics reads (additive, read-only; called ONLY from the
    //      Analytics tab on open/range-change/manual refresh — never on the
    //      enforcement tick or app-foreground path). ---------------------------

    AsyncFunction("getTotalUsageForRange") { start: Long, end: Long ->
      Engine.totalUsageForRange(start, end)
    }

    AsyncFunction("getPerAppUsageForRange") { start: Long, end: Long, topN: Int ->
      Engine.perAppUsageForRange(start, end, topN)
    }

    AsyncFunction("getDailyUsageHistory") { days: Int ->
      Engine.dailyUsageHistory(days)
    }

    AsyncFunction("getHourlyUsageForRange") { start: Long, end: Long ->
      Engine.hourlyUsageForRange(start, end)
    }

    AsyncFunction("getSessionsForDay") { packageName: String, dayStartMs: Long ->
      Engine.sessionsForDay(packageName, dayStartMs)
    }

    AsyncFunction("getRecentSessions") { packageName: String, limit: Int ->
      Engine.recentSessions(packageName, limit)
    }

    AsyncFunction("getTodayStats") { packageName: String ->
      Engine.todayStats(packageName)
    }

    // ---- Limit configuration & lock states ---------------------------------

    /**
     * Syncs the existing `app_limits` model down to the native engine
     * (packageName identity) and starts/stops monitoring accordingly.
     * Payload: [{packageName, appName, dailyLimitMs, warningThresholdMs, enabled}]
     */
    AsyncFunction("setLimits") { limitsJson: String ->
      val ctx = appContext.reactContext
      val count = Engine.setLimitsFromJson(ctx, limitsJson)
      if (ctx != null) {
        if (count > 0) {
          Engine.setMonitoringEnabled(ctx, true)
          if (UsageQueries.isUsageAccessGranted(ctx)) {
            MonitorService.start(ctx)
          } else {
            ULog.w("Bridge", "setLimits: Usage Access not granted — monitor NOT started")
          }
        } else {
          Engine.setMonitoringEnabled(ctx, false)
          MonitorService.stop(ctx)
        }
      }
      count
    }

    AsyncFunction("getLimits") { Engine.getLimitsJson() }

    AsyncFunction("getLockStates") { Engine.activeLockStates() }

    AsyncFunction("consumeLockTrigger") { Engine.consumeLockTrigger() }

    // ---- Monitoring control ------------------------------------------------

    AsyncFunction("startMonitoring") {
      val ctx = appContext.reactContext
      if (ctx == null) {
        false
      } else {
        Engine.setMonitoringEnabled(ctx, true)
        val granted = UsageQueries.isUsageAccessGranted(ctx)
        if (granted && Engine.shouldMonitor(ctx)) {
          MonitorService.start(ctx)
        }
        granted
      }
    }

    AsyncFunction("stopMonitoring") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        Engine.setMonitoringEnabled(ctx, false)
        MonitorService.stop(ctx)
        true
      } else {
        false
      }
    }

    // ---- Diagnostics / test helpers ---------------------------------------

    AsyncFunction("getEngineStatus") {
      appContext.reactContext?.let { Engine.engineStatus(it) } ?: emptyMap<String, Any?>()
    }

    AsyncFunction("rebuildUsageState") {
      Engine.rebuildNow()
      true
    }
  }
}

/**
 * Opens the most specific Settings screen this device offers for granting
 * Usage Access.
 *
 * The stock `ACTION_USAGE_ACCESS_SETTINGS` activity does not exist on every
 * OEM ROM (Xiaomi/HyperOS, Oppo/Realme ColorOS, Huawei EMUI, some Android Go
 * builds), and on a few of those it resolves to a list that hides
 * third-party apps. Walking a fallback chain — ending on FocusLock's own
 * App-info page, which always resolves — means the button always lands
 * somewhere the user can act, instead of silently dropping them on the
 * Settings home screen where they conclude the app "isn't allowing" it.
 */
private fun openUsageAccessSettings(ctx: Context) {
  val attempts: List<() -> Intent> = listOf(
    // 1. Stock AOSP "Usage access" app list.
    { Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS) },
    // 2. AOSP App Ops screen — resolves on many ROMs where (1) is missing.
    { Intent("android.settings.APP_OPS_SETTINGS") },
    // 3. Xiaomi / MIUI / HyperOS permission editor.
    {
      Intent("miui.intent.action.APP_PERM_EDITOR")
        .setPackage("com.miui.securitycenter")
        .putExtra("extra_pkgname", ctx.packageName)
    },
    // 4. Generic "Apps" list.
    { Intent(Settings.ACTION_APPLICATION_SETTINGS) },
    // 5. Always resolves: FocusLock's own App-info page.
    {
      Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.parse("package:${ctx.packageName}")
      )
    }
  )

  for (attempt in attempts) {
    try {
      ctx.startActivity(attempt().addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      return
    } catch (t: Throwable) {
      ULog.w("Bridge", "usage-access settings intent unavailable — trying next", t)
    }
  }
}

