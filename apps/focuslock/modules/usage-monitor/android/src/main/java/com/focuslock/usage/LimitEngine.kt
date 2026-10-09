package com.focuslock.usage

/** Application states from the product spec (§5). */
enum class LimitStatus { ACTIVE, WARNING, LIMIT_REACHED }

data class LimitEvaluation(
  val packageName: String,
  val usageMs: Long,
  val dailyLimitMs: Long,
  val remainingMs: Long,
  val status: LimitStatus
)

/**
 * Pure limit math — the ONLY place thresholds and status transitions are
 * defined. The warning threshold is per-limit config
 * (`warningThresholdMs`, default 10 min), never hard-coded elsewhere.
 * Remaining time is always clamped to zero (never negative).
 */
object LimitEngine {

  fun evaluate(config: LimitConfig, usageMs: Long): LimitEvaluation {
    val remaining = (config.dailyLimitMs - usageMs).coerceAtLeast(0L)
    val status = when {
      usageMs >= config.dailyLimitMs -> LimitStatus.LIMIT_REACHED
      remaining <= config.warningThresholdMs -> LimitStatus.WARNING
      else -> LimitStatus.ACTIVE
    }
    return LimitEvaluation(
      packageName = config.packageName,
      usageMs = usageMs,
      dailyLimitMs = config.dailyLimitMs,
      remainingMs = remaining,
      status = status
    )
  }

  /**
   * Warning idempotency: at most one warning per package per local day.
   * Returns true only on the first qualifying evaluation of the day.
   */
  fun shouldSendWarning(config: LimitConfig, evaluation: LimitEvaluation, store: UsageStore, now: Long): Boolean {
    if (evaluation.status != LimitStatus.WARNING) return false
    return store.getWarningSent(config.packageName) != localDayKey(now)
  }

  fun markWarningSent(config: LimitConfig, store: UsageStore, now: Long) {
    store.setWarningSent(config.packageName, localDayKey(now))
  }
}
