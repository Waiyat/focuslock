package com.focuslock.usage

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Native FocusLock lock surface.
 *
 * IMPORTANT:
 * - The locked package is dynamic.
 * - App name and app icon are resolved from Android PackageManager.
 * - Limit/usage/reset values come from the native lock state.
 * - Nothing here is hardcoded for Instagram, TikTok, CODM, etc.
 */
class LockActivity : Activity() {

    companion object {

        const val EXTRA_PACKAGE_NAME = "focuslock.locked_package"
        const val EXTRA_APP_NAME = "focuslock.locked_app_name"
        const val EXTRA_DAILY_LIMIT_MS = "focuslock.daily_limit_ms"
        const val EXTRA_USED_MS = "focuslock.used_ms"
        const val EXTRA_REACHED_AT = "focuslock.reached_at"
        const val EXTRA_RESET_AT = "focuslock.reset_at"

        private var showing: LockActivity? = null

        fun dismissIfShowing() {
            try {
                showing?.finish()
            } catch (t: Throwable) {
                ULog.w("LockUI", "dismiss failed", t)
            }

            showing = null
        }
    }

    private var lockedPackage: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        showing = this

        /*
         * The lock screen should behave like a FocusLock-owned surface,
         * not like another normal app page.
         */
        window.setStatusBarColor(Color.TRANSPARENT)
        window.setNavigationBarColor(Color.BLACK)

        val packageName = intent.getStringExtra(EXTRA_PACKAGE_NAME)

        if (packageName.isNullOrBlank()) {
            ULog.e("LockUI", "No locked package supplied")
            finish()
            return
        }

        lockedPackage = packageName

        val lockState = readLockState(packageName)

        val appInfo = resolveAppInfo(packageName)

        val appName = appInfo.first
        val appIcon = appInfo.second

        ULog.i(
            "LockUI",
            "Showing lock for package=$packageName " +
                "name=$appName " +
                "used=${lockState.usedMs}ms " +
                "limit=${lockState.limitMs}ms"
        )

        setContentView(
            buildLockScreen(
                packageName = packageName,
                appName = appName,
                appIcon = appIcon,
                usedMs = lockState.usedMs,
                limitMs = lockState.limitMs,
                reachedAt = lockState.reachedAt,
                resetAt = lockState.resetAt
            )
        )
    }

    /**
     * Resolve the REAL installed application's name and icon.
     *
     * No hardcoded app names.
     */
    private fun resolveAppInfo(packageName: String): Pair<String, Drawable> {

        return try {

            val appInfo = packageManager.getApplicationInfo(
                packageName,
                0
            )

            val name = packageManager
                .getApplicationLabel(appInfo)
                .toString()

            val icon = packageManager
                .getApplicationIcon(appInfo)

            Pair(name, icon)

        } catch (t: Throwable) {

            ULog.w(
                "LockUI",
                "Could not resolve app info for $packageName",
                t
            )

            Pair(
                packageName,
                packageManager.defaultActivityIcon
            )
        }
    }

    /**
     * Read the real lock values passed by the native usage engine.
     *
     * The app name extra is intentionally NOT trusted as the source of truth.
     * PackageManager resolves the actual installed app name above.
     */
    private fun readLockState(packageName: String): LockDisplayState {

        val limitMs = intent.getLongExtra(
            EXTRA_DAILY_LIMIT_MS,
            0L
        )

        val usedMs = intent.getLongExtra(
            EXTRA_USED_MS,
            0L
        )

        val reachedAt = intent.getLongExtra(
            EXTRA_REACHED_AT,
            System.currentTimeMillis()
        )

        val resetAt = intent.getLongExtra(
            EXTRA_RESET_AT,
            nextLocalDayStart(System.currentTimeMillis())
        )

        return LockDisplayState(
            packageName = packageName,
            usedMs = usedMs,
            limitMs = limitMs,
            reachedAt = reachedAt,
            resetAt = resetAt
        )
    }

    private fun buildLockScreen(
        packageName: String,
        appName: String,
        appIcon: Drawable,
        usedMs: Long,
        limitMs: Long,
        reachedAt: Long,
        resetAt: Long
    ): View {

        /*
         * Full-screen background.
         *
         * This is intentionally simple native UI for now.
         * The visual glass/blur treatment can be upgraded later without
         * changing the dynamic data layer.
         */
        val root = LinearLayout(this).apply {

            orientation = LinearLayout.VERTICAL

            gravity = Gravity.CENTER

            setPadding(
                dp(24),
                dp(36),
                dp(24),
                dp(24)
            )

            setBackgroundColor(
                Color.parseColor("#080B09")
            )
        }

        /*
         * Main glass-style card.
         */
        val card = LinearLayout(this).apply {

            orientation = LinearLayout.VERTICAL

            gravity = Gravity.CENTER_HORIZONTAL

            setPadding(
                dp(24),
                dp(28),
                dp(24),
                dp(24)
            )

            background = GradientDrawable().apply {

                shape = GradientDrawable.RECTANGLE

                cornerRadius = dp(28).toFloat()

                setColor(
                    Color.parseColor("#E6111512")
                )

                setStroke(
                    dp(1),
                    Color.parseColor("#5539FF88")
                )
            }
        }

        root.addView(
            card,
            LinearLayout.LayoutParams(
                -1,
                -2
            ).apply {
                gravity = Gravity.CENTER
            }
        )

        /*
         * REAL FocusLock logo.
         *
         * This expects:
         *
         * android/app/src/main/res/drawable/focuslock_logo.webp
         *
         * Cline should wire assets/logo.webp into this Android drawable
         * during the native build/prebuild process.
         */
        val focusLockLogo = ImageView(this).apply {

            layoutParams = LinearLayout.LayoutParams(
                dp(64),
                dp(64)
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(18)
            }

            scaleType = ImageView.ScaleType.FIT_CENTER

            setImageResource(
                resources.getIdentifier(
                    "focuslock_logo",
                    "drawable",
                    packageName
                )
            )
        }

        card.addView(focusLockLogo)

        /*
         * REAL LOCKED APP ICON
         */
        val appIconView = ImageView(this).apply {

            layoutParams = LinearLayout.LayoutParams(
                dp(82),
                dp(82)
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(14)
            }

            scaleType = ImageView.ScaleType.FIT_CENTER

            setImageDrawable(appIcon)
        }

        card.addView(appIconView)

        /*
         * Dynamic application name.
         */
        card.addView(
            text(
                "$appName is locked",
                26f,
                Color.WHITE,
                true
            ).apply {

                gravity = Gravity.CENTER

                setPadding(
                    0,
                    dp(4),
                    0,
                    dp(8)
                )
            }
        )

        card.addView(
            text(
                "You've reached your daily time limit for $appName.",
                15f,
                Color.parseColor("#CBD5D1"),
                false
            ).apply {

                gravity = Gravity.CENTER

                setPadding(
                    dp(8),
                    0,
                    dp(8),
                    dp(4)
                )
            }
        )

        card.addView(
            text(
                "Come back tomorrow.",
                15f,
                Color.parseColor("#CBD5D1"),
                false
            ).apply {

                gravity = Gravity.CENTER

                setPadding(
                    dp(8),
                    0,
                    dp(8),
                    dp(18)
                )
            }
        )

        /*
         * REAL usage summary.
         */
        val summary = LinearLayout(this).apply {

            orientation = LinearLayout.VERTICAL

            setPadding(
                dp(16),
                dp(14),
                dp(16),
                dp(14)
            )

            background = GradientDrawable().apply {

                shape = GradientDrawable.RECTANGLE

                cornerRadius = dp(18).toFloat()

                setColor(
                    Color.parseColor("#141A16")
                )

                setStroke(
                    dp(1),
                    Color.parseColor("#29352E")
                )
            }
        }

        summary.addView(
            text(
                appName,
                16f,
                Color.WHITE,
                true
            )
        )

        summary.addView(
            text(
                "Daily limit reached",
                13f,
                Color.parseColor("#39FF88"),
                true
            ).apply {
                setPadding(0, dp(4), 0, dp(2))
            }
        )

        summary.addView(
            text(
                "${formatDuration(limitMs)} limit",
                14f,
                Color.parseColor("#A7B3AC"),
                false
            )
        )

        summary.addView(
            text(
                "Used: ${formatDuration(usedMs)}",
                14f,
                Color.parseColor("#A7B3AC"),
                false
            ).apply {
                setPadding(0, dp(2), 0, 0)
            }
        )

        card.addView(
            summary,
            LinearLayout.LayoutParams(
                -1,
                -2
            ).apply {
                bottomMargin = dp(18)
            }
        )

        card.addView(
            text(
                "Take the break. Your focus will be waiting for you tomorrow.",
                14f,
                Color.parseColor("#8F9C94"),
                false
            ).apply {

                gravity = Gravity.CENTER

                setPadding(
                    dp(10),
                    0,
                    dp(10),
                    dp(20)
                )
            }
        )

        /*
         * GOT IT
         *
         * This does NOT unlock the application.
         * It only dismisses the current lock surface.
         *
         * The native lock state remains locked and the monitor can
         * re-enforce if the restricted application is opened again.
         */
        val gotIt = TextView(this).apply {

            text = "Got it"

            gravity = Gravity.CENTER

            textSize = 16f

            setTextColor(
                Color.parseColor("#061009")
            )

            typeface = android.graphics.Typeface.DEFAULT_BOLD

            background = GradientDrawable().apply {

                shape = GradientDrawable.RECTANGLE

                cornerRadius = dp(18).toFloat()

                setColor(
                    Color.parseColor("#39FF88")
                )
            }

            setPadding(
                dp(20),
                dp(15),
                dp(20),
                dp(15)
            )

            setOnClickListener {

                ULog.i(
                    "LockUI",
                    "User acknowledged lock for $packageName"
                )

                returnToFocusLock()
            }
        }

        card.addView(
            gotIt,
            LinearLayout.LayoutParams(
                -1,
                dp(54)
            )
        )

        return root
    }

    /**
     * Return the user to FocusLock.
     *
     * IMPORTANT:
     * This does NOT release the actual daily lock.
     */
    private fun returnToFocusLock() {

        try {

            val launchIntent =
                packageManager.getLaunchIntentForPackage(
                    applicationContext.packageName
                )

            if (launchIntent != null) {

                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )

                startActivity(launchIntent)
            }

        } catch (t: Throwable) {

            ULog.e(
                "LockUI",
                "Failed to return to FocusLock",
                t
            )
        }

        finish()
    }

    override fun onBackPressed() {

        /*
         * Back behaves exactly like "Got it".
         *
         * It does NOT release the lock.
         */
        returnToFocusLock()
    }

    override fun onDestroy() {

        if (showing === this) {
            showing = null
        }

        super.onDestroy()
    }

    private fun text(
        value: String,
        size: Float,
        color: Int,
        bold: Boolean
    ): TextView {

        return TextView(this).apply {

            text = value

            textSize = size

            setTextColor(color)

            if (bold) {
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }

            includeFontPadding = true
        }
    }

    private fun formatDuration(ms: Long): String {

        if (ms <= 0L) {
            return "0m"
        }

        val totalMinutes = ms / 60_000L

        val hours = totalMinutes / 60L

        val minutes = totalMinutes % 60L

        return when {

            hours > 0L && minutes > 0L ->
                "${hours}h ${minutes}m"

            hours > 0L ->
                "${hours}h"

            else ->
                "${minutes}m"
        }
    }

    private fun nextLocalDayStart(now: Long): Long {

        val calendar =
            java.util.Calendar.getInstance()

        calendar.timeInMillis = now

        calendar.add(
            java.util.Calendar.DAY_OF_YEAR,
            1
        )

        calendar.set(
            java.util.Calendar.HOUR_OF_DAY,
            0
        )

        calendar.set(
            java.util.Calendar.MINUTE,
            0
        )

        calendar.set(
            java.util.Calendar.SECOND,
            0
        )

        calendar.set(
            java.util.Calendar.MILLISECOND,
            0
        )

        return calendar.timeInMillis
    }

    private fun dp(value: Int): Int {

        return (
            value *
                resources.displayMetrics.density
            ).toInt()
    }

    private data class LockDisplayState(

        val packageName: String,

        val usedMs: Long,

        val limitMs: Long,

        val reachedAt: Long,

        val resetAt: Long
    )
}