package com.focuslock.usage

import android.content.Context
import org.json.JSONArray

/**
 * Singleton usage-engine orchestrator. Owns the pipeline from the product spec:
 *
 * UsageStatsManager → SessionProcessor → UsageRepository → LimitEvaluator →
 * LockManager → AppLockManager → FocusLock UI (via events + LockActivity).
 *
 * Everything runs under one global lock: the monitor's tick thread, module
 * bridge calls, and the LockActivity all observe consistent state.
 * Usage/session data NEVER leaves the device (no backend upload).
 */
object Engine {
  private const val AREA = "Usage"
  private const val TICK_WINDOW_OVERLAP_MS = 500L
  private const val STALE_REBUILD_MS = 60_000L
  private const val ENFORCE_COOLDOWN_MS = 2_500L

  private val lock = Any()
  private var appContext: Context? = null
  private var store: UsageStore? = null
  private var repo: UsageRepository? = null
  private var lockManager: LockManager? = null
  private var limits: List<LimitConfig> = emptyList()
  private var enforceCooldownUntil = 0L

  /** Wired by the Expo module; payloads are delivered to JS asynchronously. */
  var listener: ((String, Map<String, Any?>) -> Unit)? = null

  private fun emit(name: String, payload: Map<String, Any?>) {
    try {
      listener?.invoke(name, payload)
    } catch (t: Throwable) {
      ULog.w(AREA, "Event delivery failed: $name", t)
    }
  }

  private fun requireContext(context: Context?): Context =
    context ?: appContext ?: throw IllegalStateException("Engine not initialized")

  private fun ensureInitialized(context: Context?) {
    if (store != null) return
    val seed = context ?: appContext ?: return
    ULog.init(seed)
    val app = seed.applicationContext
    appContext = app
    val s = UsageStore(app)
    store = s
    lockManager = LockManager(s)
    repo = UsageRepository(app, s) { session ->
      emit(
        "onUsageUpdated",
        mapOf(
          "packageName" to session.packageName,
          "reason" to "session_end",
          "sessionDurationMs" to session.durationMs
        )
      )
    }
    limits = s.getLimits()
    ULog.i(AREA, "Engine initialized (limits=${limits.size}, monitoring=${s.monitoringEnabled})")
  }

  /**
   * Re-derives truth from UsageStatsManager when: the local day changed,
   * the device clock went backwards, or the watermark is stale (monitor was
   * dead). Also sweeps expired daily locks.
   */
  private fun ensureFresh(now: Long) {
    val s = store ?: return
    val r = repo ?: return
    val dayStart = startOfLocalDay(now)
    val dayChanged = s.processedDayStart != 0L && s.processedDayStart != dayStart
    val clockBack = now < s.watermarkMs - 5_000L
    val stale = s.watermarkMs == 0L || now - s.watermarkMs > STALE_REBUILD_MS

    if (dayChanged || clockBack) {
      lockManager?.sweepExpired(now)
    }
    if (dayChanged || clockBack || stale) {
      ULog.i(
        AREA,
        "Rebuilding usage state (dayChanged=$dayChanged clockBack=$clockBack stale=$stale)"
      )
      r.rebuild(now)
    } else {
      lockManager?.sweepExpired(now)
    }
  }

  // -----------------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------------

  /** Parses the JS `setLimits` payload, persists it, and returns config count. */
  fun setLimitsFromJson(context: Context?, json: String): Int = synchronized(lock) {
    ensureInitialized(context)
    val parsed = try {
      val arr = JSONArray(json)
      (0 until arr.length()).map { LimitConfig.fromJson(arr.getJSONObject(it)) }
    } catch (t: Throwable) {
      ULog.e(AREA, "setLimits payload invalid", t)
      emptyList()
    }
    limits = parsed
    store!!.setLimits(parsed)
    ULog.i(AREA, "Limits synced: ${parsed.joinToString { "${it.packageName}=${it.dailyLimitMs}ms" }}")
    parsed.size
  }

  fun getLimitsJson(): String = synchronized(lock) {
    ensureInitialized(appContext)
    val arr = JSONArray()
    limits.forEach { arr.put(it.toJson()) }
    arr.toString()
  }

  /** Monitoring should run while any enabled limit exists AND it is switched on. */
  fun shouldMonitor(context: Context): Boolean = synchronized(lock) {
    ensureInitialized(context)
    limits.any { it.enabled } && store!!.monitoringEnabled
  }

  fun setMonitoringEnabled(context: Context?, enabled: Boolean): Boolean = synchronized(lock) {
    ensureInitialized(context)
    store!!.monitoringEnabled = enabled
    ULog.i(AREA, "monitoringEnabled=$enabled")
    enabled
  }

  // -----------------------------------------------------------------------------
  // Monitor tick (called by MonitorService on its own thread)
  // -----------------------------------------------------------------------------

  fun tick(now: Long, interactive: Boolean): Unit = synchronized(lock) {
    ensureInitialized(appContext)
    ensureFresh(now)
    if (!interactive) return // screen off — session already closed by broadcast

    val queryFrom = maxOf(store!!.watermarkMs - TICK_WINDOW_OVERLAP_MS, 1L)
    if (now > queryFrom) {
      val events = UsageQueries.queryEvents(requireContext(appContext), queryFrom, now + 1, null)
      val touchedMonitored = events.any { ev ->
        ev.packageName != appContext?.packageName && limits.any { it.packageName == ev.packageName }
      }
      repo!!.feedEvents(events, now)
      store!!.watermarkMs = now
      if (touchedMonitored) {
        emit("onUsageUpdated", mapOf("reason" to "events"))
      }
    } else {
      repo!!.tickFinalize(now)
    }

    evaluateAll(now)
    enforceLockedForeground(now)
  }

  /** Evaluates every enabled limit — the single place states transition. */
  private fun evaluateAll(now: Long) {
    val r = repo ?: return
    val lm = lockManager ?: return
    for (config in limits) {
      if (!config.enabled) continue
      val usage = r.todayUsage(config.packageName, now)
      val evaluation = LimitEngine.evaluate(config, usage)
      ULog.d(
        AREA,
        "${config.appName} — usage=${usage}ms limit=${config.dailyLimitMs}ms " +
          "status=${evaluation.status} remaining=${evaluation.remainingMs}ms"
      )
      when (evaluation.status) {
        LimitStatus.LIMIT_REACHED -> {
          val newLock = lm.markReached(config, usage, now)
          if (newLock != null) {
            emit(
              "onLimitReached",
              mapOf(
                "packageName" to newLock.packageName,
                "appName" to newLock.appName,
                "dailyLimitMs" to newLock.dailyLimitMs,
                "usedMs" to newLock.usedMs,
                "reachedAt" to newLock.reachedAt,
                "resetAt" to newLock.resetAt
              )
            )
          }
        }
        LimitStatus.WARNING -> {
          if (LimitEngine.shouldSendWarning(config, evaluation, store!!, now)) {
            LimitEngine.markWarningSent(config, store!!, now)
            emit(
              "onLimitWarning",
              mapOf(
                "packageName" to config.packageName,
                "appName" to config.appName,
                "remainingMs" to evaluation.remainingMs,
                "warningThresholdMs" to config.warningThresholdMs
              )
            )
          }
        }
        LimitStatus.ACTIVE -> Unit
      }
    }
  }

  /** Redirect enforcement when a locked app is foreground. */
  private fun enforceLockedForeground(now: Long) {
    val r = repo ?: return
    val lm = lockManager ?: return
    val context = appContext ?: return
    val foreground = r.currentForeground() ?: return
    if (foreground.eventType != "ACTIVITY_RESUMED") return
    val state = lm.getLock(foreground.packageName, now) ?: return
    if (now < enforceCooldownUntil) return

    if (AppLockManager.enforce(context, state)) {
      enforceCooldownUntil = now + ENFORCE_COOLDOWN_MS
      emit(
        "onLockTriggered",
        mapOf(
          "packageName" to state.packageName,
          "appName" to state.appName,
          "dailyLimitMs" to state.dailyLimitMs,
          "usedMs" to state.usedMs,
          "reachedAt" to state.reachedAt
        )
      )
    }
  }


  // -----------------------------------------------------------------------------
  // Bridge-facing operations (all synchronized, all real-device data)
  // -----------------------------------------------------------------------------

  /** Screen turned off — close whatever session is open (no false usage). */
  fun onScreenOff(at: Long): Unit = synchronized(lock) {
    ensureInitialized(appContext)
    repo?.onScreenOff(at)
  }

  /** Forces a full reconstruction from system history (tests/diagnostics). */
  fun rebuildNow(): Unit = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    lockManager?.sweepExpired(now)
    repo!!.rebuild(now)
  }

  fun todayUsage(packageName: String): Long = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    ensureFresh(now)
    repo!!.todayUsage(packageName, now)
  }

  fun usageForRange(packageName: String, start: Long, end: Long): Long = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    ensureFresh(now)
    repo!!.usageForRange(packageName, start, end, now)
  }

  fun sessionsForDay(packageName: String, dayStartMs: Long): List<Map<String, Any?>> =
    synchronized(lock) {
      ensureInitialized(appContext)
      val now = System.currentTimeMillis()
      ensureFresh(now)
      repo!!.sessionsForDay(packageName, dayStartMs, now).map { it.toMap() }
    }

  fun recentSessions(packageName: String, limit: Int): List<Map<String, Any?>> =
    synchronized(lock) {
      ensureInitialized(appContext)
      val now = System.currentTimeMillis()
      ensureFresh(now)
      repo!!.recentSessions(packageName, limit, now).map { it.toMap() }
    }

  fun todayStats(packageName: String): Map<String, Any?> = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    ensureFresh(now)
    repo!!.todayStats(packageName, now)
  }

  fun usageEvents(packageName: String, start: Long, end: Long): List<Map<String, Any?>> =
    synchronized(lock) {
      ensureInitialized(appContext)
      repo!!.rawEvents(packageName, start, end)
    }

  // ---- Analytics reads (additive, read-only — invoked only by the
  //      Analytics tab; never part of the enforcement/tick hot path). --------

  fun totalUsageForRange(start: Long, end: Long): Long = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    ensureFresh(now)
    repo!!.totalUsageForRange(start, end, now)
  }

  fun perAppUsageForRange(start: Long, end: Long, topN: Int): List<Map<String, Any?>> =
    synchronized(lock) {
      ensureInitialized(appContext)
      val now = System.currentTimeMillis()
      ensureFresh(now)
      repo!!.perAppUsageForRange(start, end, now, topN)
    }

  fun dailyUsageHistory(days: Int): List<Map<String, Any?>> = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    ensureFresh(now)
    repo!!.dailyUsageHistory(days, now)
  }

  fun hourlyUsageForRange(start: Long, end: Long): List<Long> = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    ensureFresh(now)
    repo!!.hourlyUsageForRange(start, end, now)
  }

  fun currentForeground(): Map<String, Any?>? = synchronized(lock) {
    ensureInitialized(appContext)
    repo?.currentForeground()?.toMap()
  }

  fun activeLockStates(): List<Map<String, Any?>> = synchronized(lock) {
    ensureInitialized(appContext)
    val now = System.currentTimeMillis()
    ensureFresh(now)
    lockManager!!.activeLocks(now).map { it.toMap() }
  }

  fun consumeLockTrigger(): Map<String, Any?>? = synchronized(lock) {
    ensureInitialized(appContext)
    lockManager!!.consumeTrigger()?.let { trigger ->
      mapOf(
        "packageName" to trigger.packageName,
        "appName" to trigger.appName,
        "dailyLimitMs" to trigger.dailyLimitMs,
        "usedMs" to trigger.usedMs,
        "reachedAt" to trigger.reachedAt
      )
    }
  }

  fun engineStatus(context: Context): Map<String, Any?> = synchronized(lock) {
    ensureInitialized(context)
    val now = System.currentTimeMillis()
    mapOf(
      "monitoringEnabled" to store!!.monitoringEnabled,
      "usageAccessGranted" to UsageQueries.isUsageAccessGranted(context),
      "overlayGranted" to AppLockManager.isOverlayGranted(context),
      "canEnforce" to AppLockManager.canEnforce(context),
      "limitsCount" to limits.size,
      "watermarkMs" to store!!.watermarkMs,
      "processedDayStart" to store!!.processedDayStart,
      "todayStartMs" to startOfLocalDay(now),
      "foreground" to (repo?.currentForeground()?.toMap()),
      "activeLocks" to lockManager!!.activeLocks(now).size
    )
  }
}

