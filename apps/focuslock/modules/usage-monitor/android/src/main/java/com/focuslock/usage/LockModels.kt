package com.focuslock.usage

import org.json.JSONObject

/** Authoritative persistent lock state for one package. */
data class LockState(
  val packageName: String,
  val appName: String,
  val locked: Boolean,
  val lockedAt: Long,
  /** Next local calendar day start — lock auto-clears at/after this instant. */
  val resetAt: Long,
  /** When usage actually reached the limit (idempotent — set once per lock). */
  val reachedAt: Long,
  val dailyLimitMs: Long,
  val usedMs: Long
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("packageName", packageName)
    put("appName", appName)
    put("locked", locked)
    put("lockedAt", lockedAt)
    put("resetAt", resetAt)
    put("reachedAt", reachedAt)
    put("dailyLimitMs", dailyLimitMs)
    put("usedMs", usedMs)
  }

  fun toMap(): Map<String, Any?> = mapOf(
    "packageName" to packageName,
    "appName" to appName,
    "locked" to locked,
    "lockedAt" to lockedAt,
    "resetAt" to resetAt,
    "reachedAt" to reachedAt,
    "dailyLimitMs" to dailyLimitMs,
    "usedMs" to usedMs
  )

  companion object {
    fun fromJson(o: JSONObject): LockState = LockState(
      packageName = o.getString("packageName"),
      appName = o.optString("appName", o.getString("packageName")),
      locked = o.optBoolean("locked", false),
      lockedAt = o.optLong("lockedAt", 0L),
      resetAt = o.optLong("resetAt", 0L),
      reachedAt = o.optLong("reachedAt", 0L),
      dailyLimitMs = o.optLong("dailyLimitMs", 0L),
      usedMs = o.optLong("usedMs", 0L)
    )
  }
}

/** A one-shot "the lock screen was just triggered" record for the JS layer. */
data class LockTrigger(
  val packageName: String,
  val appName: String,
  val dailyLimitMs: Long,
  val usedMs: Long,
  val reachedAt: Long
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("packageName", packageName)
    put("appName", appName)
    put("dailyLimitMs", dailyLimitMs)
    put("usedMs", usedMs)
    put("reachedAt", reachedAt)
  }

  companion object {
    fun fromJson(o: JSONObject): LockTrigger = LockTrigger(
      packageName = o.getString("packageName"),
      appName = o.optString("appName", o.getString("packageName")),
      dailyLimitMs = o.optLong("dailyLimitMs", 0L),
      usedMs = o.optLong("usedMs", 0L),
      reachedAt = o.optLong("reachedAt", 0L)
    )
  }
}
