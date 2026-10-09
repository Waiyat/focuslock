package com.focuslock.usage

import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log

/**
 * Structured development logging.
 *
 * Format: [FocusLock][<Area>] message
 * Verbose logs are automatically silenced in release (non-debuggable) builds.
 */
object ULog {
  private const val TAG = "FocusLock"
  private var verbose: Boolean? = null

  private fun isVerbose(context: Context?): Boolean {
    if (verbose != null) return verbose!!
    verbose = try {
      val ctx = context?.applicationContext
      if (ctx == null) true
      else (ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    } catch (t: Throwable) {
      true
    }
    return verbose!!
  }

  /** Force verbose on/off (module init passes the app context once). */
  fun init(context: Context) {
    isVerbose(context)
  }

  fun d(area: String, message: String) {
    if (isVerbose(null)) Log.d(TAG, "[$area] $message")
  }

  fun i(area: String, message: String) {
    Log.i(TAG, "[$area] $message")
  }

  fun w(area: String, message: String, error: Throwable? = null) {
    if (error != null) Log.w(TAG, "[$area] $message", error)
    else Log.w(TAG, "[$area] $message")
  }

  fun e(area: String, message: String, error: Throwable? = null) {
    if (error != null) Log.e(TAG, "[$area] $message", error)
    else Log.e(TAG, "[$area] $message")
  }
}
