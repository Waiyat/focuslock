package com.focuslock.usage

/**
 * Single authoritative lock-state manager.
 *
 * Idempotency guarantee: `markReached` performs the false→true transition at
 * most once per local day per package — a foreground service polling 100
 * cycles cannot create 100 lock events. Locks persist (SharedPreferences),
 * so process death never forgets that an app is locked. Auto-unlock happens
 * exactly at the next local calendar day boundary (`resetAt`).
 */
class LockManager(private val store: UsageStore) {

  /** Clears locks whose local-day reset has passed. Returns unlocked entries. */
  fun sweepExpired(now: Long): List<LockState> {
    val locks = store.getLocks().toMutableMap()
    val expired = locks.values.filter { it.locked && now >= it.resetAt }
    if (expired.isNotEmpty()) {
      expired.forEach { locks[it.packageName] = it.copy(locked = false) }
      store.setLocks(locks)
      ULog.i("Lock", "Local-day reset unlocked: ${expired.joinToString { it.packageName }}")
    }
    return expired
  }

  /**
   * Idempotent limit→lock transition. Returns the freshly created [LockState]
   * ONLY when the lock actually engaged (first cycle over the limit); returns
   * null when already locked — no duplicate events, ever.
   */
  fun markReached(config: LimitConfig, usageMs: Long, now: Long): LockState? {
    val locks = store.getLocks().toMutableMap()
    val existing = locks[config.packageName]
    if (existing != null && existing.locked && now < existing.resetAt) {
      return null // already locked this day — idempotent no-op
    }

    val lock = LockState(
      packageName = config.packageName,
      appName = config.appName,
      locked = true,
      lockedAt = now,
      resetAt = nextLocalDayStart(now),
      reachedAt = now,
      dailyLimitMs = config.dailyLimitMs,
      usedMs = usageMs
    )
    locks[config.packageName] = lock
    store.setLocks(locks)
    store.setPendingTrigger(
      LockTrigger(
        packageName = config.packageName,
        appName = config.appName,
        dailyLimitMs = config.dailyLimitMs,
        usedMs = usageMs,
        reachedAt = now
      )
    )
    ULog.i(
      "Lock",
      "${config.appName} LOCKED — usage=${usageMs}ms limit=${config.dailyLimitMs}ms " +
        "reachedAt=$now resetAt=${lock.resetAt}"
    )
    return lock
  }

  /** Active lock for a package (expired-but-not-swept locks read as unlocked). */
  fun getLock(packageName: String, now: Long): LockState? {
    val lock = store.getLocks()[packageName] ?: return null
    if (!lock.locked || now >= lock.resetAt) return null
    return lock
  }

  fun isLocked(packageName: String, now: Long): Boolean = getLock(packageName, now) != null

  /** All currently active locks (for JS status display). */
  fun activeLocks(now: Long): List<LockState> =
    store.getLocks().values.filter { it.locked && now < it.resetAt }

  /** One-shot consumption of the "lock screen just triggered" record. */
  fun consumeTrigger(): LockTrigger? {
    val trigger = store.getPendingTrigger() ?: return null
    store.setPendingTrigger(null)
    return trigger
  }
}
