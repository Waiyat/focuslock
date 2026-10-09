package com.focuslock.usage

import org.json.JSONObject
import java.util.UUID

/** One foreground session reconstructed from real Android usage events. */
data class Session(
  val id: String,
  val packageName: String,
  val startedAt: Long,
  val endedAt: Long,
  val durationMs: Long,
  /** Constant: every session originates from Android UsageStatsManager events. */
  val source: String = SOURCE_ANDROID_USAGE_EVENTS,
  /** Local calendar day (yyyy-MM-dd) of the session start. */
  val dayKey: String
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("packageName", packageName)
    put("startedAt", startedAt)
    put("endedAt", endedAt)
    put("durationMs", durationMs)
    put("source", source)
    put("dayKey", dayKey)
  }

  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "startedAt" to startedAt,
    "endedAt" to endedAt,
    "durationMs" to durationMs,
    "source" to source,
    "dayKey" to dayKey
  )

  companion object {
    const val SOURCE_ANDROID_USAGE_EVENTS = "android_usage_events"

    fun newId(): String = UUID.randomUUID().toString()

    fun fromJson(o: JSONObject): Session = Session(
      id = o.optString("id", UUID.randomUUID().toString()),
      packageName = o.getString("packageName"),
      startedAt = o.getLong("startedAt"),
      endedAt = o.getLong("endedAt"),
      durationMs = o.getLong("durationMs"),
      source = o.optString("source", SOURCE_ANDROID_USAGE_EVENTS),
      dayKey = o.getString("dayKey")
    )
  }
}

/** A configured limit mirrored down from the existing app_limits model. */
data class LimitConfig(
  val packageName: String,
  val appName: String,
  val dailyLimitMs: Long,
  val warningThresholdMs: Long,
  val enabled: Boolean,
  val startsAtMs: Long = 0L
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("packageName", packageName)
    put("appName", appName)
    put("dailyLimitMs", dailyLimitMs)
    put("warningThresholdMs", warningThresholdMs)
    put("enabled", enabled)
    put("startsAtMs", startsAtMs)
  }

  companion object {
    const val DEFAULT_WARNING_THRESHOLD_MS = 10 * 60 * 1000L

    fun fromJson(o: JSONObject): LimitConfig = LimitConfig(
      packageName = o.getString("packageName"),
      appName = o.optString("appName", o.getString("packageName")),
      dailyLimitMs = o.getLong("dailyLimitMs"),
      warningThresholdMs = o.optLong("warningThresholdMs", DEFAULT_WARNING_THRESHOLD_MS),
      enabled = o.optBoolean("enabled", true),
      startsAtMs = o.optLong("startsAtMs", 0L)
    )
  }
}
