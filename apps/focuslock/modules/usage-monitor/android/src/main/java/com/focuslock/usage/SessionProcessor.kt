package com.focuslock.usage

/**
 * Pure session state machine over the chronological Android event stream.
 *
 * Rules (all timestamps come from the system events — never invented):
 * - ACTIVITY_RESUMED starts a session (same-package resume keeps one session).
 * - ACTIVITY_PAUSED arms a short merge window (activity switches inside one
 *   app don't split); the next same-package RESUME within the window cancels.
 * - ACTIVITY_STOPPED / SCREEN_NON_INTERACTIVE / KEYGUARD_SHOWN finalize
 *   immediately (screen off and app switches end usage).
 * - A resume of a DIFFERENT package finalizes any open session first (handles
 *   missed pause events) — sessions can never overlap, so time is never
 *   double-counted.
 */
class SessionAccumulator(
  initialOpen: OpenSession? = null,
  private val onFinish: ((Session) -> Unit)? = null
) {
  companion object {
    /** Same-app activity switches closer than this are one continuous session. */
    const val MERGE_WINDOW_MS = 1500L
  }

  var open: OpenSession? = initialOpen
    private set

  var foreground: ForegroundInfo? = null
    private set

  /** Sessions finalized during this accumulator's lifetime (reconstruction). */
  val finished = ArrayList<Session>()

  fun onEvent(ev: RawEvent, now: Long) {
    when (ev.type) {
      UsageQueries.Ev.RESUMED -> {
        foreground = ForegroundInfo(ev.packageName, ev.time, "ACTIVITY_RESUMED")
        val current = open
        when {
          current == null ->
            open = OpenSession(Session.newId(), ev.packageName, ev.time, null)

          current.packageName != ev.packageName -> {
            // Missed/late pause for the previous app — take over at this instant.
            finalize(current.pendingCloseAt?.coerceAtMost(ev.time) ?: ev.time)
            open = OpenSession(Session.newId(), ev.packageName, ev.time, null)
          }

          current.pendingCloseAt == null ->
            open = current // duplicate resume, keep session

          ev.time - current.pendingCloseAt <= MERGE_WINDOW_MS ->
            open = current.copy(pendingCloseAt = null) // merge — same app

          else -> {
            // Real leave+return beyond the merge window → two sessions.
            finalize(current.pendingCloseAt)
            open = OpenSession(Session.newId(), ev.packageName, ev.time, null)
          }
        }
      }

      UsageQueries.Ev.PAUSED -> {
        if (foreground?.packageName == ev.packageName) {
          foreground = ForegroundInfo(ev.packageName, ev.time, "ACTIVITY_PAUSED")
        }
        val current = open
        if (current != null && current.packageName == ev.packageName) {
          open = current.copy(pendingCloseAt = ev.time)
        }
      }

      UsageQueries.Ev.STOPPED -> {
        if (foreground?.packageName == ev.packageName) {
          foreground = ForegroundInfo(ev.packageName, ev.time, "ACTIVITY_STOPPED")
        }
        val current = open
        if (current != null && current.packageName == ev.packageName) {
          finalize(ev.time)
        }
      }

      UsageQueries.Ev.SCREEN_NON_INTERACTIVE, UsageQueries.Ev.KEYGUARD_SHOWN -> {
        // Screen off / keyguard — device is no longer in interactive use.
        if (open != null) finalize(ev.time)
        foreground = foreground?.let {
          it.copy(
            timestamp = ev.time,
            eventType = if (ev.type == UsageQueries.Ev.SCREEN_NON_INTERACTIVE)
              "SCREEN_NON_INTERACTIVE" else "KEYGUARD_SHOWN"
          )
        }
      }
    }
  }

  /** Flushes a pending close once the merge window has elapsed. */
  fun tickFinalize(now: Long) {
    val current = open ?: return
    val pending = current.pendingCloseAt ?: return
    if (now - pending >= MERGE_WINDOW_MS) finalize(pending)
  }

  /** Force-closes the open session (e.g. screen turned off). */
  fun forceClose(at: Long) {
    if (open != null) finalize(at)
  }

  private fun finalize(endAt: Long) {
    val current = open ?: return
    open = null
    val duration = endAt - current.startedAt
    if (duration <= 0) return
    val session = Session(
      id = current.id,
      packageName = current.packageName,
      startedAt = current.startedAt,
      endedAt = endAt,
      durationMs = duration,
      dayKey = localDayKey(current.startedAt)
    )
    finished.add(session)
    onFinish?.invoke(session)
  }

  /** The live (still-open) session materialized as a Session up to [now]. */
  fun liveSession(now: Long): Session? {
    val current = open ?: return null
    val end = current.pendingCloseAt ?: now
    val duration = end - current.startedAt
    if (duration <= 0) return null
    return Session(
      id = current.id,
      packageName = current.packageName,
      startedAt = current.startedAt,
      endedAt = end,
      durationMs = duration,
      dayKey = localDayKey(current.startedAt)
    )
  }

  fun persistableOpen(): OpenSession? = open

  /** Adopts persisted state after a rebuild (open session + foreground). */
  fun restore(open: OpenSession?, foreground: ForegroundInfo?) {
    this.open = open
    this.foreground = foreground ?: this.foreground
  }
}
