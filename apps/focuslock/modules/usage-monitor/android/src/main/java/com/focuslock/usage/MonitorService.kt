package com.focuslock.usage

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager

/**
 * Foreground service (type `specialUse`) running the usage polling loop while
 * limits are active — deliberately NOT a JS setInterval, so monitoring
 * survives the React Native UI being closed (and the RN process being killed
 * only pauses until Android restarts us via START_STICKY / boot receiver).
 *
 * The persistent notification plainly discloses that FocusLock is monitoring
 * usage — no hidden background process.
 */
class MonitorService : Service() {

  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var screenReceiver: BroadcastReceiver? = null
  private var running = false

  private val loop = object : Runnable {
    override fun run() {
      if (!running) return
      try {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        Engine.tick(System.currentTimeMillis(), pm.isInteractive)
      } catch (t: Throwable) {
        ULog.e("Monitor", "tick failed", t)
      }
      handler?.postDelayed(this, TICK_INTERVAL_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("focuslock-usage").also { it.start() }
    handler = Handler(thread!!.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startAsForeground()

    if (!running) {
      running = true

      // Screen state ends/continues sessions honestly (never count screen-off
      // time as app usage).
      screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, received: Intent) {
          val now = System.currentTimeMillis()
          when (received.action) {
            Intent.ACTION_SCREEN_OFF -> {
              Engine.onScreenOff(now)
              handler?.removeCallbacks(loop)
              ULog.d("Monitor", "Screen off — sessions closed at $now")
            }
            Intent.ACTION_SCREEN_ON -> handler?.post(loop)
          }
        }
      }
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
      }
      registerReceiver(screenReceiver, filter)

      handler?.post(loop)
      ULog.i("Monitor", "Usage loop started (interval=${TICK_INTERVAL_MS}ms)")
    }
    return START_STICKY
  }

  private fun startAsForeground() {
    ensureChannel()
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val notification = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("FocusLock is active")
      .setContentText("Monitoring app usage to enforce your daily limits")
      .setSmallIcon(
        resources
          .getIdentifier("notification_icon", "drawable", packageName)
          .takeIf { it != 0 }
          ?: android.R.drawable.ic_menu_recent_history
      )
      .setOngoing(true)
      .apply { if (contentIntent != null) setContentIntent(contentIntent) }
      .build()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(
          NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        )
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (t: Throwable) {
      ULog.e("Monitor", "startForeground failed", t)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Usage monitoring",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description =
        "Shown while FocusLock monitors app usage to enforce your daily limits"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  override fun onDestroy() {
    running = false
    try {
      screenReceiver?.let { unregisterReceiver(it) }
    } catch (t: Throwable) {
      ULog.w("Monitor", "screen receiver unregister failed", t)
    }
    screenReceiver = null
    handler?.removeCallbacksAndMessages(null)
    thread?.quitSafely()
    handler = null
    thread = null
    ULog.i("Monitor", "Usage loop stopped")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val TICK_INTERVAL_MS = 1500L
    private const val CHANNEL_ID = "focuslock_monitor"
    private const val NOTIF_ID = 4711

    /** Clean start (from JS while foreground, or BootReceiver). */
    fun start(context: Context) {
      try {
        val intent = Intent(context, MonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        ULog.d("Monitor", "start() requested")
      } catch (t: Throwable) {
        ULog.e("Monitor", "start() failed", t)
      }
    }

    /** Clean stop. */
    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, MonitorService::class.java))
        ULog.d("Monitor", "stop() requested")
      } catch (t: Throwable) {
        ULog.e("Monitor", "stop() failed", t)
      }
    }
  }
}
