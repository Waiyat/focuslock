package com.focuslock.usage

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Last-known foreground app snapshot (persisted so JS can read it anytime). */
data class ForegroundInfo(
  val packageName: String,
  val timestamp: Long,
  val eventType: String
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "packageName" to packageName,
    "timestamp" to timestamp,
    "eventType" to eventType
  )

  fun toJson(): JSONObject = JSONObject().apply {
    put("packageName", packageName)
    put("timestamp", timestamp)
    put("eventType", eventType)
  }

  companion object {
    fun fromJson(o: JSONObject): ForegroundInfo? {
      val pkg = o.optString("packageName", "")
      if (pkg.isEmpty()) return null
      return ForegroundInfo(pkg, o.optLong("timestamp", 0L), o.optString("eventType", "ACTIVITY_RESUMED"))
    }
  }
}
