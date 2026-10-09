package com.focuslock.usage

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Enforcement boundary — the UI never needs to know how enforcement works.
 *
 * Honest capability model for a normal (non-device-owner) Android app
 * (targetSdk 36):
 * - There is NO public API to block another app's UI. DevicePolicyManager
 *   restrict APIs require Device Owner (explicitly out of scope), and
 *   AccessibilityService is policy-restricted for app-blocking (not used).
 * - FocusLock therefore enforces via DETECTION + REDIRECT: while a locked
 *   package is in the foreground, the native [LockActivity] is launched over
 *   it. On Android 10+ this background activity start requires the
 *   "Display over other apps" special access (SYSTEM_ALERT_WINDOW, declared
 *   in the manifest and granted via Android Settings).
 * - [canEnforce] reports exactly whether the current device permits this —
 *   never faked.
 *
 * This is redirect-based enforcement, not OS-level blocking: a determined
 * user can briefly re-open the restricted app, but FocusLock re-enforces on
 * the next detection cycle (cooldown-limited).
 */
object AppLockManager {

  fun isOverlayGranted(context: Context): Boolean =
    try {
      Settings.canDrawOverlays(context)
    } catch (t: Throwable) {
      false
    }

  /** True when redirect enforcement can actually start activities right now. */
  fun canEnforce(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || isOverlayGranted(context)

  /** Launches the lock experience over the restricted app. Returns success. */
  fun enforce(context: Context, lock: LockState): Boolean {
    if (!canEnforce(context)) {
      ULog.w("Lock", "enforce() refused — 'Display over other apps' not granted")
      return false
    }
    return try {
      val intent = Intent(context, LockActivity::class.java).apply {
        putExtra(LockActivity.EXTRA_PACKAGE_NAME, lock.packageName)
        putExtra(LockActivity.EXTRA_APP_NAME, lock.appName)
        putExtra(LockActivity.EXTRA_DAILY_LIMIT_MS, lock.dailyLimitMs)
        putExtra(LockActivity.EXTRA_USED_MS, lock.usedMs)
        putExtra(LockActivity.EXTRA_REACHED_AT, lock.reachedAt)
        putExtra(LockActivity.EXTRA_RESET_AT, lock.resetAt)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      context.startActivity(intent)
      ULog.i("Lock", "enforce → LockActivity over ${lock.packageName}")
      true
    } catch (t: Throwable) {
      ULog.e("Lock", "enforce failed for ${lock.packageName}", t)
      false
    }
  }

  /**
   * User acknowledged the lock surface (e.g. tapped "Got it"). The daily lock
   * state itself remains authoritative until [LockState.resetAt].
   */
  fun release(context: Context, packageName: String) {
    ULog.d("Lock", "release acknowledged for $packageName (lock persists until reset)")
    LockActivity.dismissIfShowing()
  }

  /** Opens the Android Settings screen for "Display over other apps". */
  fun openOverlaySettings(context: Context) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    } catch (t: Throwable) {
      ULog.e("Lock", "openOverlaySettings failed — falling back to Settings", t)
      try {
        context.startActivity(
          Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      } catch (ignored: Throwable) {
      }
    }
  }
}
