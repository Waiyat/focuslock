package com.focuslock.usage

import org.json.JSONArray
import java.util.Calendar
import java.util.TimeZone

// -----------------------------------------------------------------------------
// Local-day helpers (minSdk 24 → java.util.Calendar, device-local timezone.
// Raw epoch timestamps are always stored; only day segmentation uses the
// current local zone, so historical sessions are never corrupted by a
// timezone change.)
// -----------------------------------------------------------------------------

/** Epoch ms of local midnight (00:00) for the local calendar day containing [ms]. */
fun startOfLocalDay(ms: Long): Long {
  val cal = Calendar.getInstance(TimeZone.getDefault())
  cal.timeInMillis = ms
  cal.set(Calendar.HOUR_OF_DAY, 0)
  cal.set(Calendar.MINUTE, 0)
  cal.set(Calendar.SECOND, 0)
  cal.set(Calendar.MILLISECOND, 0)
  return cal.timeInMillis
}

/** Epoch ms of the next local midnight strictly after [ms]. */
fun nextLocalDayStart(ms: Long): Long {
  val cal = Calendar.getInstance(TimeZone.getDefault())
  cal.timeInMillis = startOfLocalDay(ms)
  cal.add(Calendar.DAY_OF_YEAR, 1)
  return cal.timeInMillis
}

/** Local calendar day key, e.g. `2026-10-08`. */
fun localDayKey(ms: Long): String {
  val cal = Calendar.getInstance(TimeZone.getDefault())
  cal.timeInMillis = ms
  return String.format(
    "%04d-%02d-%02d",
    cal.get(Calendar.YEAR),
    cal.get(Calendar.MONTH) + 1,
    cal.get(Calendar.DAY_OF_MONTH)
  )
}

// -----------------------------------------------------------------------------
// Session JSON list helpers
// -----------------------------------------------------------------------------

fun JSONArray.toSessionList(): List<Session> {
  val out = ArrayList<Session>(length())
  for (i in 0 until length()) {
    try {
      out.add(Session.fromJson(getJSONObject(i)))
    } catch (t: Throwable) {
      ULog.w("Store", "Skipping malformed session entry at index $i")
    }
  }
  return out
}

fun List<Session>.toJsonArray(): JSONArray {
  val arr = JSONArray()
  forEach { arr.put(it.toJson()) }
  return arr
}
