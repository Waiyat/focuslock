package com.focuslock.usage

import android.content.Context

/**
 * Read/write facade over real Android usage data.
 *
 * - Incremental path: the monitor feeds chronological event windows into an
 *   in-memory [SessionAccumulator] whose finalized sessions are persisted.
 * - Reconstruction path: `rebuild()` re-derives today's truth from
 *   UsageStatsManager — so FocusLock process death, app restarts, reboots and
 *   day boundaries never lose or fabricate usage.
 * - Historical queries reconstruct on demand straight from the system.
 *
 * Callers must ensure freshness (day change / stale watermark) via
 * [rebuild] before trusting fast-path reads — the Engine does this.
 */
class UsageRepository(
  private val context: Context,
  private val store: UsageStore,
  private val onSessionFinished: ((Session) -> Unit)? = null
) {
  companion object {
    /** How far before a range start reconstruction looks for session starts. */
    const val LOOKBACK_MS = 12 * 60 * 60 * 1000L
    /** Freshness: stale watermark older than this forces a rebuild on read. */
    const val STALE_READ_MS = 15_000L
  }

  private val accumulator = SessionAccumulator(store.getOpenSession()) { session ->
    store.appendSessions(listOf(session))
    onSessionFinished?.invoke(session)
  }

  // -----------------------------------------------------------------------------
  // Incremental path (monitor tick / screen transitions)
  // -----------------------------------------------------------------------------

  /** Feeds a chronological event window into the live accumulator. */
  fun feedEvents(events: List<RawEvent>, now: Long) {
    for (ev in events) accumulator.onEvent(ev, now)
    accumulator.tickFinalize(now)
    store.setOpenSession(accumulator.persistableOpen())
    accumulator.foreground?.let { store.setForeground(it) }
  }

  /** Screen went off — usage ends now for whatever was open. */
  fun onScreenOff(at: Long) {
    accumulator.forceClose(at)
    store.setOpenSession(null)
    store.setForeground(accumulator.foreground)
  }

  fun tickFinalize(now: Long) {
    accumulator.tickFinalize(now)
    store.setOpenSession(accumulator.persistableOpen())
  }

  fun currentForeground(): ForegroundInfo? =
    accumulator.foreground ?: store.getForeground()

  // -----------------------------------------------------------------------------
  // Reconstruction (system history is the source of truth)
  // -----------------------------------------------------------------------------

  /**
   * Re-derives the current local day from UsageStatsManager and replaces the
   * stored window. Called on engine start, day change, clock changes, long
   * gaps, and stale reads.
   */
  fun rebuild(now: Long) {
    val dayStart = startOfLocalDay(now)
    val queryFrom = dayStart - LOOKBACK_MS
    val events = UsageQueries.queryEvents(context, queryFrom, now + 1, null)

    val fresh = SessionAccumulator()
    for (ev in events) fresh.onEvent(ev, now)
    fresh.tickFinalize(now)

    val sessions = ArrayList<Session>(fresh.finished)
    var openToRestore: OpenSession? = fresh.open
    if (openToRestore != null) {
      val isLive = fresh.foreground?.packageName == openToRestore.packageName &&
        fresh.foreground?.eventType == "ACTIVITY_RESUMED"
      if (!isLive) {
        // Open session with no end event while the app is NOT foreground:
        // clamp with the system's last-used evidence (never invent time).
        sessions.add(clampTail(openToRestore, now))
        openToRestore = null
      }
    }

    store.replaceSessionsFrom(queryFrom, sessions)
    store.setOpenSession(openToRestore)
    fresh.foreground?.let { store.setForeground(it) }
    accumulator.restore(openToRestore, fresh.foreground)
    store.processedDayStart = dayStart
    store.watermarkMs = now
    ULog.d(
      "Repo",
      "Rebuilt ${sessions.size} sessions from system events (day=${localDayKey(now)})"
    )
  }

  /** Finalizes an unterminated tail session using lastTimeUsed evidence. */
  private fun clampTail(open: OpenSession, now: Long): Session {
    val evidence = UsageQueries.lastTimeUsed(
      context, open.packageName, open.startedAt, now + 1
    )
    val end = (evidence ?: now).coerceIn(open.startedAt + 1, now + 1)
    return Session(
      id = open.id,
      packageName = open.packageName,
      startedAt = open.startedAt,
      endedAt = end,
      durationMs = end - open.startedAt,
      dayKey = localDayKey(open.startedAt)
    )
  }

  /**
   * On-demand reconstruction of an arbitrary range straight from the system
   * (used for historical days — stored sessions only fast-path the current day).
   */
  fun reconstructRange(from: Long, to: Long): List<Session> {
    if (to <= from) return emptyList()
    val events = UsageQueries.queryEvents(context, from - LOOKBACK_MS, to + 1, null)
    val acc = SessionAccumulator()
    for (ev in events) acc.onEvent(ev, to)
    acc.tickFinalize(to)
    val out = ArrayList<Session>(acc.finished)
    acc.open?.let { out.add(clampTail(it, to)) }
    return out
  }


  // -----------------------------------------------------------------------------
  // Read APIs (callers ensure freshness first via Engine.ensureFresh)
  // -----------------------------------------------------------------------------

  /**
   * Real accumulated foreground usage for the current local calendar day,
   * clamped to the allowance start — usage recorded before this allowance was
   * created never counts against it (fresh-allowance guarantee).
   */
  fun todayUsage(packageName: String, now: Long, startsAtMs: Long = 0L): Long =
    usageOverlapping(packageName, maxOf(startOfLocalDay(now), startsAtMs), now + 1, now)

  /** Σ overlap of [packageName] sessions (stored + live) with `[from, to)`. */
  private fun usageOverlapping(packageName: String, from: Long, to: Long, now: Long): Long {
    var total = 0L
    for (s in store.getSessions()) {
      if (s.packageName != packageName) continue
      val overlap = minOf(s.endedAt, to) - maxOf(s.startedAt, from)
      if (overlap > 0) total += overlap
    }
    val live = accumulator.liveSession(now)
    if (live != null && live.packageName == packageName) {
      val overlap = minOf(live.endedAt, to) - maxOf(live.startedAt, from)
      if (overlap > 0) total += overlap
    }
    return total
  }

  /** Usage for an arbitrary range (reconstructs from the system when historical). */
  fun usageForRange(packageName: String, from: Long, to: Long, now: Long): Long {
    if (to <= from) return 0L
    val sessions =
      if (from >= startOfLocalDay(now)) {
        (store.getSessions() + listOfNotNull(accumulator.liveSession(now)))
          .filter { it.packageName == packageName }
      } else {
        reconstructRange(from, to).filter { it.packageName == packageName }
      }
    var total = 0L
    for (s in sessions) {
      val overlap = minOf(s.endedAt, to) - maxOf(s.startedAt, from)
      if (overlap > 0) total += overlap
    }
    return total
  }

  /** All sessions for [packageName] intersecting the local day at [dayStartMs]. */
  fun sessionsForDay(packageName: String, dayStartMs: Long, now: Long): List<Session> {
    val dayEnd = nextLocalDayStart(dayStartMs)
    val isToday = dayStartMs == startOfLocalDay(now)
    val scopeEnd = if (isToday) now + 1 else dayEnd
    val base =
      if (isToday) {
        store.getSessions() + listOfNotNull(accumulator.liveSession(now))
      } else {
        reconstructRange(dayStartMs, dayEnd - 1)
      }
    return base
      .filter {
        it.packageName == packageName && it.endedAt > dayStartMs && it.startedAt < scopeEnd
      }
      .sortedBy { it.startedAt }
      .distinctBy { it.id }
  }

  /** Most recent sessions first (reconstructs up to 7 local days on demand). */
  fun recentSessions(packageName: String, limit: Int, now: Long): List<Session> {
    val from = startOfLocalDay(now) - 6 * 24 * 60 * 60 * 1000L
    return reconstructRange(from, now)
      .filter { it.packageName == packageName }
      .sortedByDescending { it.startedAt }
      .take(limit.coerceIn(1, 200))
  }

  /** Aggregated real statistics for the current local day. */
  fun todayStats(packageName: String, now: Long): Map<String, Any?> {
    val dayStart = startOfLocalDay(now)
    val openId = accumulator.persistableOpen()?.id
    val today = (store.getSessions() + listOfNotNull(accumulator.liveSession(now)))
      .filter { it.packageName == packageName && it.endedAt > dayStart }
      .sortedBy { it.startedAt }
    var usage = 0L
    for (s in today) {
      val overlap = minOf(s.endedAt, now + 1) - maxOf(s.startedAt, dayStart)
      if (overlap > 0) usage += overlap
    }
    val closed = today.filter { it.id != openId }
    return mapOf(
      "usageMs" to usage,
      "sessionCountToday" to today.size,
      "firstOpenedAtToday" to (today.minOfOrNull { it.startedAt } ?: 0L),
      "lastOpenedAt" to (today.maxOfOrNull { it.startedAt } ?: 0L),
      "lastSessionEndedAt" to (closed.maxOfOrNull { it.endedAt } ?: 0L),
      "dayStartMs" to dayStart
    )
  }

  // ---------------------------------------------------------------------------
  // Analytics reads (additive, read-only — invoked only by the Analytics tab;
  // never part of the enforcement/tick hot path).
  // ---------------------------------------------------------------------------

  /**
   * Total foreground usage across ALL packages in `[start, end)`.
   * Reconstructs straight from the system for historical ranges; for the
   * current day it uses the fast stored + live path. Never fabricates time.
   */
  fun totalUsageForRange(start: Long, end: Long, now: Long): Long {
    if (end <= start) return 0L
    val sessions = if (start >= startOfLocalDay(now)) {
      store.getSessions() + listOfNotNull(accumulator.liveSession(now))
    } else {
      reconstructRange(start, end)
    }
    var total = 0L
    for (s in sessions) {
      val overlap = minOf(s.endedAt, end) - maxOf(s.startedAt, start)
      if (overlap > 0) total += overlap
    }
    return total
  }

  /** Per-package usage totals in `[start, end)`, sorted descending. */
  fun perAppUsageForRange(start: Long, end: Long, now: Long, topN: Int = 0): List<Map<String, Any?>> {
    if (end <= start) return emptyList()
    val sessions = if (start >= startOfLocalDay(now)) {
      store.getSessions() + listOfNotNull(accumulator.liveSession(now))
    } else {
      reconstructRange(start, end)
    }
    val byPkg = HashMap<String, Long>()
    for (s in sessions) {
      val overlap = minOf(s.endedAt, end) - maxOf(s.startedAt, start)
      if (overlap > 0) byPkg[s.packageName] = (byPkg[s.packageName] ?: 0L) + overlap
    }
    val sorted = byPkg.entries.sortedByDescending { it.value }
    val limited = if (topN > 0) sorted.take(topN) else sorted
    return limited.map { mapOf("packageName" to it.key, "usageMs" to it.value) }
  }

  /**
   * Per-local-day totals for the last [days] days (including today), oldest
   * first. Missing days report 0 (real — no usage recorded), never fabricated.
   */
  fun dailyUsageHistory(days: Int, now: Long): List<Map<String, Any?>> {
    val n = days.coerceIn(1, 90)
    val todayStart = startOfLocalDay(now)
    val out = ArrayList<Map<String, Any?>>(n)
    for (i in n - 1 downTo 0) {
      val dayStart = todayStart - i * 24 * 60 * 60 * 1000L
      val dayEnd = dayStart + 24 * 60 * 60 * 1000L
      val upper = minOf(dayEnd, now + 1)
      out.add(
        mapOf(
          "dayStartMs" to dayStart,
          "dayEndMs" to dayEnd,
          "usageMs" to totalUsageForRange(dayStart, upper, now)
        )
      )
    }
    return out
  }

  /** Usage bucketed by hour-of-day (0-23) over `[start, end)`, local time. */
  fun hourlyUsageForRange(start: Long, end: Long, now: Long): List<Long> {
    val buckets = LongArray(24)
    if (end <= start) return buckets.toList()
    val sessions = if (start >= startOfLocalDay(now)) {
      store.getSessions() + listOfNotNull(accumulator.liveSession(now))
    } else {
      reconstructRange(start, end)
    }
    for (s in sessions) {
      val oStart = maxOf(s.startedAt, start)
      val oEnd = minOf(s.endedAt, end)
      if (oEnd <= oStart) continue
      // Walk hour boundaries so multi-hour sessions distribute correctly.
      val cal = java.util.Calendar.getInstance()
      cal.timeInMillis = oStart
      var cursor = oStart
      while (cursor < oEnd) {
        cal.timeInMillis = cursor
        val hour = cal.get(java.util.Calendar.HOUR_OF_DAY)
        cal.set(java.util.Calendar.HOUR_OF_DAY, hour)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        val nextBoundary = cal.timeInMillis + 60 * 60 * 1000L
        val segEnd = minOf(oEnd, nextBoundary)
        buckets[hour] += segEnd - cursor
        cursor = segEnd
      }
    }
    return buckets.toList()
  }

  /** Raw system events for one package in `[start, end]` (diagnostics/tests). */
  fun rawEvents(packageName: String, start: Long, end: Long): List<Map<String, Any?>> =
    UsageQueries.queryEvents(context, start, end, packageName).map {
      mapOf(
        "eventType" to eventTypeName(it.type),
        "eventTypeCode" to it.type,
        "packageName" to it.packageName,
        "timestamp" to it.time
      )
    }

  private fun eventTypeName(type: Int): String = when (type) {
    UsageQueries.Ev.RESUMED -> "ACTIVITY_RESUMED"
    UsageQueries.Ev.PAUSED -> "ACTIVITY_PAUSED"
    UsageQueries.Ev.STOPPED -> "ACTIVITY_STOPPED"
    UsageQueries.Ev.SCREEN_NON_INTERACTIVE -> "SCREEN_NON_INTERACTIVE"
    UsageQueries.Ev.SCREEN_INTERACTIVE -> "SCREEN_INTERACTIVE"
    UsageQueries.Ev.KEYGUARD_SHOWN -> "KEYGUARD_SHOWN"
    UsageQueries.Ev.KEYGUARD_HIDDEN -> "KEYGUARD_HIDDEN"
    else -> "TYPE_$type"
  }
}
