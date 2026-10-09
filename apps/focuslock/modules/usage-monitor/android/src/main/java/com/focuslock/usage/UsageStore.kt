package com.focuslock.usage

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** An in-progress foreground session (persisted so it survives process death). */
data class OpenSession(
  val id: String,
  val packageName: String,
  val startedAt: Long,
  /** Set when the app paused; the session finalizes here unless merged. */
  val pendingCloseAt: Long?
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("packageName", packageName)
    put("startedAt", startedAt)
    if (pendingCloseAt != null) put("pendingCloseAt", pendingCloseAt)
  }

  companion object {
    fun fromJson(o: JSONObject): OpenSession = OpenSession(
      id = o.getString("id"),
      packageName = o.getString("packageName"),
      startedAt = o.getLong("startedAt"),
      pendingCloseAt = if (o.has("pendingCloseAt")) o.getLong("pendingCloseAt") else null
    )
  }
}

/**
 * Small, robust local storage layer for the usage engine (SharedPreferences —
 * no database). All access happens under the Engine's global lock.
 *
 * Raw epoch timestamps are persisted for everything historical; day keys are
 * derived from the device-local zone at write time, so a timezone change never
 * corrupts stored sessions.
 */
class UsageStore(context: Context) {
  private val prefs = context.applicationContext
    .getSharedPreferences("focuslock_usage_engine", Context.MODE_PRIVATE)

  companion object {
    private const val KEY_LIMITS = "limits_json"
    private const val KEY_LOCKS = "locks_json"
    private const val KEY_TRIGGER = "trigger_json"
    private const val KEY_MONITORING = "monitoring_enabled"
    private const val KEY_SESSIONS = "sessions_json"
    private const val KEY_OPEN = "open_session_json"
    private const val KEY_WATERMARK = "watermark_ms"
    private const val KEY_DAY_START = "processed_day_start_ms"
    private const val KEY_WARNINGS = "warning_sent_json"
    private const val KEY_FG = "foreground_json"
    private const val MAX_SESSIONS = 3000
    private const val RETAIN_DAYS = 7
  }

  // ---- Limits ---------------------------------------------------------------

  fun getLimits(): List<LimitConfig> {
    val raw = prefs.getString(KEY_LIMITS, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { LimitConfig.fromJson(arr.getJSONObject(it)) }
    } catch (t: Throwable) {
      ULog.w("Store", "Corrupt limits JSON — resetting", t)
      emptyList()
    }
  }

  fun setLimits(limits: List<LimitConfig>) {
    val arr = JSONArray()
    limits.forEach { arr.put(it.toJson()) }
    prefs.edit().putString(KEY_LIMITS, arr.toString()).apply()
  }

  // ---- Lock states ----------------------------------------------------------

  fun getLocks(): Map<String, LockState> {
    val raw = prefs.getString(KEY_LOCKS, null) ?: return emptyMap()
    return try {
      val obj = JSONObject(raw)
      val out = HashMap<String, LockState>()
      obj.keys().forEach { key ->
        out[key] = LockState.fromJson(obj.getJSONObject(key))
      }
      out
    } catch (t: Throwable) {
      ULog.w("Store", "Corrupt locks JSON — resetting", t)
      emptyMap()
    }
  }

  fun setLocks(locks: Map<String, LockState>) {
    val obj = JSONObject()
    locks.values.forEach { obj.put(it.packageName, it.toJson()) }
    prefs.edit().putString(KEY_LOCKS, obj.toString()).apply()
  }

  // ---- One-shot lock trigger ------------------------------------------------

  fun getPendingTrigger(): LockTrigger? {
    val raw = prefs.getString(KEY_TRIGGER, null) ?: return null
    return try {
      LockTrigger.fromJson(JSONObject(raw))
    } catch (t: Throwable) {
      null
    }
  }

  fun setPendingTrigger(trigger: LockTrigger?) {
    prefs.edit().putString(KEY_TRIGGER, trigger?.toJson()?.toString()).apply()
  }

  // ---- Monitoring configuration --------------------------------------------

  var monitoringEnabled: Boolean
    get() = prefs.getBoolean(KEY_MONITORING, false)
    set(value) {
      prefs.edit().putBoolean(KEY_MONITORING, value).apply()
    }


  fun getSessions(): List<Session> {
    val raw = prefs.getString(KEY_SESSIONS, null) ?: return emptyList()
    return try {
      JSONArray(raw).toSessionList()
    } catch (t: Throwable) {
      ULog.w("Store", "Corrupt sessions JSON — resetting", t)
      emptyList()
    }
  }

  fun appendSessions(newSessions: List<Session>) {
    if (newSessions.isEmpty()) return
    val all = getSessions() + newSessions
    persistSessions(prune(all))
  }

  /**
   * Rebuild semantics: drop every stored session intersecting
   * `[fromInclusive, ∞)` and store [replacement] (the fresh reconstruction of
   * that window). Sessions fully before the window are preserved.
   */
  fun replaceSessionsFrom(fromInclusive: Long, replacement: List<Session>) {
    val kept = getSessions().filter { it.endedAt < fromInclusive }
    persistSessions(prune(kept + replacement))
  }

  private fun prune(sessions: List<Session>): List<Session> {
    val cutoff = System.currentTimeMillis() - RETAIN_DAYS * 24 * 60 * 60 * 1000L
    val recent = sessions.filter { it.endedAt >= cutoff }
    return if (recent.size > MAX_SESSIONS) recent.takeLast(MAX_SESSIONS) else recent
  }

  private fun persistSessions(sessions: List<Session>) {
    prefs.edit().putString(KEY_SESSIONS, sessions.toJsonArray().toString()).apply()
  }

  // ---- Open session (incremental processor state) ---------------------------

  fun getOpenSession(): OpenSession? {
    val raw = prefs.getString(KEY_OPEN, null) ?: return null
    return try {
      OpenSession.fromJson(JSONObject(raw))
    } catch (t: Throwable) {
      null
    }
  }

  fun setOpenSession(open: OpenSession?) {
    prefs.edit().putString(KEY_OPEN, open?.toJson()?.toString()).apply()
  }

  // ---- Freshness markers ----------------------------------------------------

  /** Last instant events were ingested (epoch ms). */
  var watermarkMs: Long
    get() = prefs.getLong(KEY_WATERMARK, 0L)
    set(value) {
      prefs.edit().putLong(KEY_WATERMARK, value).apply()
    }

  /** Local-day start the stored sessions/open state currently belong to. */
  var processedDayStart: Long
    get() = prefs.getLong(KEY_DAY_START, 0L)
    set(value) {
      prefs.edit().putLong(KEY_DAY_START, value).apply()
    }

  // ---- Warning markers (pkg -> dayKey the warning was sent) -----------------

  fun getWarningSent(packageName: String): String? {
    val raw = prefs.getString(KEY_WARNINGS, null) ?: return null
    return try {
      JSONObject(raw).optString(packageName, null)?.ifEmpty { null }
    } catch (t: Throwable) {
      null
    }
  }

  fun setWarningSent(packageName: String, dayKey: String) {
    val obj = try {
      prefs.getString(KEY_WARNINGS, null)?.let { JSONObject(it) } ?: JSONObject()
    } catch (t: Throwable) {
      JSONObject()
    }
    obj.put(packageName, dayKey)
    prefs.edit().putString(KEY_WARNINGS, obj.toString()).apply()
  }

  // ---- Foreground snapshot --------------------------------------------------

  fun getForeground(): ForegroundInfo? {
    val raw = prefs.getString(KEY_FG, null) ?: return null
    return try {
      ForegroundInfo.fromJson(JSONObject(raw))
    } catch (t: Throwable) {
      null
    }
  }

  fun setForeground(info: ForegroundInfo?) {
    prefs.edit().putString(KEY_FG, info?.toJson()?.toString()).apply()
  }
}

  // ---- Sessions -------------------------------------------------------------