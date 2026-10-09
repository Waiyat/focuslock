package com.focuslock.usage

import android.app.usage.UsageEvents
import android.app.usage.UsageEventsQuery
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build

/** Normalized UsageEvents.Event row. */
data class RawEvent(
  val type: Int,
  val packageName: String,
  val time: Long
)

/**
 * Thin, official-API-only wrapper around [UsageStatsManager].
 *
 * - API 30+: filtered `UsageEventsQuery` (package + event-type scoped).
 * - API 24–29: compatible `queryEvents(begin, end)` with local filtering.
 * Requires Usage Access (special access granted via Android Settings).
 */
object UsageQueries {

  /** Event type constants (values stable across supported API levels). */
  object Ev {
    const val RESUMED = UsageEvents.Event.ACTIVITY_RESUMED       // 1
    const val PAUSED = UsageEvents.Event.ACTIVITY_PAUSED         // 2
    const val STOPPED = UsageEvents.Event.ACTIVITY_STOPPED       // 23 (API 29+)
    const val SCREEN_NON_INTERACTIVE = 12                        // API 29+
    const val KEYGUARD_SHOWN = 15                                // API 29+
    const val SCREEN_INTERACTIVE = 11                            // API 29+
    const val KEYGUARD_HIDDEN = 16                               // API 29+
  }

  /** Raw AppOps mode for GET_USAGE_STATS (MODE_ALLOWED / MODE_DEFAULT / MODE_ERRORED). */
  fun usageAccessAppOpsMode(context: Context): Int {
    return try {
      val appOps = context.getSystemService(Context.APP_OPS_SERVICE)
        as android.app.AppOpsManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(
          android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
          android.os.Process.myUid(),
          context.packageName
        )
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(
          android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
          android.os.Process.myUid(),
          context.packageName
        )
      }
    } catch (t: Throwable) {
      ULog.w("Usage", "usageAccessAppOpsMode failed", t)
      android.app.AppOpsManager.MODE_ERRORED
    }
  }

  /**
   * True only when Android confirms the app holds Usage Access.
   *
   * Two-step because several OEM ROMs (Xiaomi/HyperOS, Oppo/Realme, Huawei)
   * report MODE_DEFAULT for GET_USAGE_STATS even after the user has flipped
   * the Usage Access toggle — treating that as "denied" would keep the app in
   * a permanent "not allowed" loop AND prevent the monitor service from ever
   * starting. In that case we verify *by doing*: access is only claimed when
   * the system actually hands back usage data.
   */
  fun isUsageAccessGranted(context: Context): Boolean {
    return try {
      when (usageAccessAppOpsMode(context)) {
        android.app.AppOpsManager.MODE_ALLOWED -> true
        else -> probeUsageDataAvailable(context)
      }
    } catch (t: Throwable) {
      ULog.w("Usage", "isUsageAccessGranted failed", t)
      false
    }
  }

  /**
   * "Verify by doing": usage access is real only if UsageStatsManager returns
   * data. Returns true exclusively on a non-empty answer, so it can never
   * claim granted by accident (an unprivileged caller gets an empty list).
   */
  private fun probeUsageDataAvailable(context: Context): Boolean {
    return try {
      val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val end = System.currentTimeMillis()
      val begin = end - 24 * 60 * 60 * 1000L
      @Suppress("DEPRECATION")
      val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, begin, end)
      !stats.isNullOrEmpty()
    } catch (t: Throwable) {
      ULog.w("Usage", "usage probe failed", t)
      false
    }
  }

  /** Event types the engine cares about for the current device. */
  private fun interestingTypes(): IntArray {
    val base = intArrayOf(Ev.RESUMED, Ev.PAUSED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      return base + intArrayOf(Ev.STOPPED, Ev.SCREEN_NON_INTERACTIVE, Ev.KEYGUARD_SHOWN)
    }
    return base
  }

  /**
   * Queries usage events in `[begin, end)`, optionally restricted to one
   * package. Returns rows in chronological order as reported by the system.
   */
  fun queryEvents(
    context: Context,
    begin: Long,
    end: Long,
    packageFilter: String? = null
  ): List<RawEvent> {
    if (end <= begin || begin < 0) return emptyList()
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val types = interestingTypes()

    val events: UsageEvents = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val builder = UsageEventsQuery.Builder(begin, end).setEventTypes(*types)
      if (packageFilter != null) builder.setPackageNames(packageFilter)
      usm.queryEvents(builder.build()) ?: return emptyList()
    } else {
      @Suppress("DEPRECATION")
      usm.queryEvents(begin, end) ?: return emptyList()
    }

    val out = ArrayList<RawEvent>()
    @Suppress("DEPRECATION")
    while (true) {
      val event = UsageEvents.Event()
      if (!events.getNextEvent(event)) break
      if (!types.contains(event.eventType)) continue
      val pkg = event.packageName ?: continue
      if (packageFilter != null && pkg != packageFilter) continue
      out.add(RawEvent(event.eventType, pkg, event.timeStamp))
    }
    return out
  }

  /**
   * The system's last-used instant for a package within `[begin, end]`
   * (UsageStats fallback used only to clamp sessions missing an end event).
   */
  fun lastTimeUsed(
    context: Context,
    packageName: String,
    begin: Long,
    end: Long
  ): Long? {
    if (end <= begin) return null
    return try {
      val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      @Suppress("DEPRECATION")
      val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, begin, end)
        ?: return null
      var best: Long? = null
      for (s in stats) {
        if (s.packageName == packageName && s.lastTimeUsed in (begin + 1)..end) {
          if (best == null || s.lastTimeUsed > best!!) best = s.lastTimeUsed
        }
      }
      best
    } catch (t: Throwable) {
      ULog.w("Usage", "lastTimeUsed query failed", t)
      null
    }
  }
}
