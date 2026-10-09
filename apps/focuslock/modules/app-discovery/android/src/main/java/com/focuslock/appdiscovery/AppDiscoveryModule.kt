package com.focuslock.appdiscovery

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * FocusLock app discovery — exposes the installed, launchable, user-facing
 * applications via Android's PackageManager.
 *
 * - Discovery runs on a background queue (never blocks the JS thread).
 * - Icons are written once to a disk cache and returned as file:// URIs,
 *   so no large base64 payloads ever cross the bridge.
 * - Filtering is metadata-based (launchable activity, self, system flags) —
 *   deliberately no hardcoded package lists.
 */
class AppDiscoveryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FocusLockAppDiscovery")

    // Queues.DEFAULT runs off the main thread (background dispatcher).
    AsyncFunction("getInstalledApps") {
      discoverInstalledApps()
    }.runOnQueue(Queues.DEFAULT)

    /**
     * Real display labels for SPECIFIC packages (read-only, no discovery
     * list). Used by Analytics to show app names instead of bundle ids —
     * covers system packages the selectable-apps list intentionally omits.
     */
    AsyncFunction("getAppLabels") { packageNames: List<String> ->
      resolveAppLabels(packageNames)
    }.runOnQueue(Queues.DEFAULT)
  }

  /** { packageName → user-visible label } for any installed package. */
  private fun resolveAppLabels(packageNames: List<String>): Map<String, String> {
    val context = appContext.reactContext ?: return emptyMap()
    val pm = context.packageManager
    val out = HashMap<String, String>(packageNames.size)
    for (pkg in packageNames) {
      if (pkg.isBlank() || pkg in out) continue
      try {
        val info = pm.getApplicationInfo(pkg, 0)
        out[pkg] = pm.getApplicationLabel(info).toString()
      } catch (_: Throwable) {
        // Unknown/uninstalled package — omitted; JS falls back honestly.
      }
    }
    return out
  }

  private fun discoverInstalledApps(): List<Map<String, Any?>> {
    val context = appContext.reactContext
      ?: throw IllegalStateException("FocusLockAppDiscovery has no React context")
    val pm = context.packageManager
    val selfPackage = context.packageName

    val packages = pm.getInstalledPackages(0)
    val results = ArrayList<Map<String, Any?>>(packages.size)

    for (pkg in packages) {
      val packageName = pkg.packageName
      if (packageName == selfPackage) continue

      val appInfo = pkg.applicationInfo ?: continue

      // Only apps a normal user could actually launch (excludes framework
      // packages, services, system UI and other internal components).
      val launchIntent = pm.getLaunchIntentForPackage(packageName) ?: continue

      // Metadata-based system filtering: hide pre-installed system components
      // unless the user has explicitly updated the app (making it user-owned).
      val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
      val isUpdatedSystem = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
      if (isSystem && !isUpdatedSystem) continue

      val label = pm.getApplicationLabel(appInfo).toString().trim()
      if (label.isEmpty()) continue

      results.add(
        mapOf(
          "id" to packageName,
          "name" to label,
          "packageName" to packageName,
          "icon" to resolveIconUri(pm, appInfo),
          "platform" to "android",
          "launchable" to (launchIntent.component != null)
        )
      )
    }

    results.sortBy { it["name"].toString().lowercase() }
    return results
  }

  /**
   * Writes the app's real icon to a disk cache (once) and returns a
   * `file://` URI. RN/expo-image render file URIs natively — smooth
   * scrolling with hundreds of apps, no bridge bloat.
   */
  private fun resolveIconUri(pm: PackageManager, appInfo: ApplicationInfo): String? {
    return try {
      val context = appContext.reactContext ?: return null
      val packageName = appInfo.packageName ?: return null

      val iconsDir = File(context.cacheDir, "focuslock_icons")
      if (!iconsDir.exists()) iconsDir.mkdirs()

      val iconFile = File(iconsDir, "$packageName.png")
      if (!iconFile.exists()) {
        val drawable = pm.getApplicationIcon(appInfo)
        val bitmap = drawableToBitmap(drawable, ICON_MAX_PX)
        iconFile.outputStream().use { stream ->
          bitmap.compress(Bitmap.CompressFormat.PNG, 90, stream)
        }
        bitmap.recycle()
      }
      "file://${iconFile.absolutePath}"
    } catch (_: Exception) {
      // Icon failure must never break discovery — row falls back to badge.
      null
    }
  }

  private fun drawableToBitmap(drawable: Drawable, maxSize: Int): Bitmap {
    val intrinsicW = drawable.intrinsicWidth.takeIf { it > 0 } ?: maxSize
    val intrinsicH = drawable.intrinsicHeight.takeIf { it > 0 } ?: maxSize
    val scale = minOf(maxSize.toFloat() / intrinsicW, maxSize.toFloat() / intrinsicH, 1f)
    val targetW = maxOf(1, (intrinsicW * scale).toInt())
    val targetH = maxOf(1, (intrinsicH * scale).toInt())

    if (drawable is BitmapDrawable && drawable.bitmap != null) {
      return Bitmap.createScaledBitmap(drawable.bitmap, targetW, targetH, true)
    }

    val bitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, targetW, targetH)
    drawable.draw(canvas)
    return bitmap
  }

  companion object {
    private const val ICON_MAX_PX = 192
  }
}
