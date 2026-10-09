import ExpoModulesCore
import UIKit

/**
 * FocusLock app discovery (iOS) — exposes EVERY installed application to JS.
 *
 * iOS has no public API for enumerating installed apps without the
 * FamilyControls entitlement (deliberately postponed — see READEME.md /
 * todo.md), so this module reads LaunchServices through the Objective-C
 * runtime. Every private selector is guarded with `responds(to:)` so an OS
 * change degrades to a clean JS error instead of a crash — there is never any
 * mock fallback data.
 *
 * - Discovery runs on the module's background queue (never the JS thread).
 * - Real home-screen icons are written once to a disk cache and returned as
 *   `file://` URIs (same contract as the Android provider), so no large
 *   payloads cross the bridge.
 * - Internal/hidden system components (daemons, plugins) are filtered out by
 *   LaunchServices metadata — no hardcoded bundle-id lists.
 */
public class AppDiscoveryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FocusLockAppDiscovery")

    AsyncFunction("getInstalledApps") { () -> [[String: Any]] in
      try self.discoverInstalledApps()
    }
  }

  // MARK: - Discovery

  private func discoverInstalledApps() throws -> [[String: Any]] {
    guard let apps = Self.installedApplications() else {
      throw DiscoveryFailedException("Installed-app enumeration is unavailable on this version of iOS.")
    }

    let iconsDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
      .appendingPathComponent("focuslock_icons", isDirectory: true)
    let selfBundleId = Bundle.main.bundleIdentifier
    var seen = Set<String>()
    var results: [[String: Any]] = []

    for app in apps {
      guard let bundleId = Self.stringProperty(app, "applicationIdentifier")
        ?? Self.stringProperty(app, "bundleIdentifier") else { continue }
      if bundleId == selfBundleId || seen.contains(bundleId) { continue }

      // LaunchServices marks daemons/plugins/internal components as
      // "Internal"/"Hidden" — those have no home-screen icon and must never
      // surface in the picker. "User" and "System" apps are both limitable.
      let applicationType = Self.stringProperty(app, "applicationType")
      if applicationType == "Internal" || applicationType == "Hidden" { continue }

      guard let name = Self.stringProperty(app, "localizedName")?
        .trimmingCharacters(in: .whitespacesAndNewlines),
        !name.isEmpty else { continue }

      seen.insert(bundleId)

      var row: [String: Any] = [
        "id": bundleId,
        "name": name,
        "bundleIdentifier": bundleId,
        "platform": "ios",
      ]
      if let iconUri = Self.cachedIconUri(bundleId: bundleId, iconsDir: iconsDir) {
        row["icon"] = iconUri
      }
      results.append(row)
    }

    if results.isEmpty {
      throw DiscoveryFailedException("No installed applications could be read from LaunchServices.")
    }

    results.sort {
      ($0["name"] as? String ?? "").localizedCaseInsensitiveCompare($1["name"] as? String ?? "")
        == .orderedAscending
    }
    return results
  }

  // MARK: - Runtime helpers

  /// Returns the `LSApplicationWorkspace` singleton via the ObjC runtime, or
  /// nil when the class/selectors are unavailable (guarded — never crashes).
  private static func installedApplications() -> [NSObject]? {
    guard let workspaceClass = NSClassFromString("LSApplicationWorkspace") else { return nil }
    let classObject = workspaceClass as AnyObject
    let defaultWorkspaceSel = NSSelectorFromString("defaultWorkspace")
    guard classObject.responds(to: defaultWorkspaceSel),
      let unmanagedWorkspace = classObject.perform(defaultWorkspaceSel),
      let workspace = unmanagedWorkspace.takeUnretainedValue() as? NSObject
    else { return nil }

    // OS builds have used slightly different accessor names — try both, but
    // only ever through responds(to:)-guarded perform().
    for selectorName in ["allInstalledApplications", "allApplications"] {
      let sel = NSSelectorFromString(selectorName)
      if workspace.responds(to: sel),
        let unmanaged = workspace.perform(sel),
        let apps = unmanaged.takeUnretainedValue() as? [NSObject]
      {
        return apps
      }
    }
    return nil
  }

  /// Reads a string-returning private property without KVC (KVC raises
  /// uncatchable ObjC exceptions for unknown keys — perform() is safe).
  private static func stringProperty(_ object: NSObject, _ selectorName: String) -> String? {
    let sel = NSSelectorFromString(selectorName)
    guard object.responds(to: sel),
      let unmanaged = object.perform(sel),
      let value = unmanaged.takeUnretainedValue() as? NSString
    else { return nil }
    return value as String
  }

  // MARK: - Icons

  /**
   * Returns a `file://` URI for the app's real icon, generating and caching
   * the PNG on first sight. Icon rendering touches UIApplication and MUST run
   * on the main thread — callers are on the module's background queue, so the
   * render hop is a main.sync (main never waits on this queue → no deadlock).
   */
  private static func cachedIconUri(bundleId: String, iconsDir: URL) -> String? {
    let fileName = bundleId.replacingOccurrences(of: "/", with: "_") + ".png"
    let fileUrl = iconsDir.appendingPathComponent(fileName)

    if FileManager.default.fileExists(atPath: fileUrl.path) {
      return fileUrl.absoluteString
    }

    guard let data = DispatchQueue.main.sync(execute: { iconPngData(bundleId: bundleId) })
    else { return nil }

    do {
      try FileManager.default.createDirectory(at: iconsDir, withIntermediateDirectories: true)
      try data.write(to: fileUrl, options: .atomic)
      return fileUrl.absoluteString
    } catch {
      // Icon caching is best-effort — the row falls back to a monogram badge.
      return nil
    }
  }

  /// Reads the home-screen icon through UIApplication's private
  /// `applicationIconImageForBundleIdentifier:` (main thread only).
  private static func iconPngData(bundleId: String) -> Data? {
    let sel = NSSelectorFromString("applicationIconImageForBundleIdentifier:")
    guard UIApplication.shared.responds(to: sel),
      let unmanaged = UIApplication.shared.perform(sel, with: bundleId),
      let image = unmanaged.takeUnretainedValue() as? UIImage
    else { return nil }
    return pngData(of: image, maxPixel: 192)
  }

  /// Downscales to at most `maxPixel` on the longest edge and encodes PNG —
  /// keeps the disk cache small and scrolling smooth with hundreds of icons.
  private static func pngData(of image: UIImage, maxPixel: CGFloat) -> Data? {
    let size = image.size
    guard size.width > 0, size.height > 0 else { return nil }
    let scale = min(maxPixel / max(size.width, size.height), 1)
    let target = CGSize(
      width: max(1, (size.width * scale).rounded()),
      height: max(1, (size.height * scale).rounded())
    )

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let renderer = UIGraphicsImageRenderer(size: target, format: format)
    let rendered = renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
    return rendered.pngData()
  }
}

internal final class DiscoveryFailedException: GenericException<String> {
  override var reason: String {
    param
  }
}


