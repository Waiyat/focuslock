package com.focuslock.usage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts usage monitoring after a device reboot when limits are configured
 * (`monitoringEnabled` persists in SharedPreferences). Usage history itself
 * survives reboots — the engine reconstructs from UsageStatsManager, which is
 * the system's own durable record.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    try {
      if (Engine.shouldMonitor(context)) {
        ULog.i("Boot", "Device booted — restarting usage monitoring")
        MonitorService.start(context)
      } else {
        ULog.d("Boot", "Boot received — no active monitoring configuration")
      }
    } catch (t: Throwable) {
      ULog.e("Boot", "Failed to restart monitoring after boot", t)
    }
  }
}
