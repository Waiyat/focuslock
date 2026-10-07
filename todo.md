# FocusLock — Development Roadmap

> **Powered by discipline, not willpower.** — WaiyatLabs

---

## ✅ Completed

### Auth & Backend

- [x] Landing / splash screen with animations
- [x] Register screen (username, email, password, confirm password)
- [x] Login screen (email + password)
- [x] Forgot password flow (send code → verify → reset → back to login)
- [x] OTP email via Resend — registration + password reset
- [x] OTP modal — 6-box split input, iOS `oneTimeCode` autofill, haptics, paste support
- [x] Supabase auth (Admin API, `email_confirm: true` after OTP)
- [x] Profile guaranteed upsert after OTP verify
- [x] Backend hardening — error detection, structured logging, 30s cooldown, 5-attempt lockout
- [x] Error shake + haptic feedback + error sound on invalid characters across all inputs
- [x] Username validation supports dot (`.`) characters (e.g. `john.doe`)
- [x] Resend email spam score optimization (multipart text/html, replyTo, preheader, RFC footer)

### Navigation & Dashboard

- [x] NavBar (logo, FocusLock text, avatar — visible only on Home)
- [x] BottomTabs floating pill dock (Home / Limits / Schedule / Settings)
- [x] Dashboard — Home tab (greeting, reset countdown, app limit cards ACTIVE/WARNING/LOCKED)
- [x] Dashboard — Limits tab (add/remove app limits → Supabase)
- [x] Dashboard — Schedule tab (reset time, configuration timeline)
- [x] Dashboard — Settings tab (profile, avatar upload, sign out)
- [x] Avatars storage bucket (Supabase, public CDN)
- [x] All post-auth routes redirect to /dashboard
- [x] Basic fade animation on root Stack

---

## 🔴 TODO

### 🎬 Phase 0 — Polish (CURRENT)

#### Screen Transitions & Animations

- [x] Root stack — slide_from_right, fade_from_bottom for dashboard entry, slide_from_bottom for settings
- [x] Auth group — slide_from_right between login / register / forgot-password with gesture navigation
- [x] Dashboard tabs — smooth crossfade and subtle slide up between Home / Limits / Schedule / Settings
- [x] Landing screen — hero element stagger-in animations
- [x] Dashboard entry — fade-up staggered card entrance on load
- [x] App limit cards — spring scale on press, staggered entrance on load
- [x] Bottom dock — spring pop animation and tactile haptics on tab switch
- [x] Hero status — live pulsing dot indicator for Active Enforcement
- [x] Progress bar — smooth animated width fill on data change

---

### 📋 Phase 1 — Onboarding (Foundation)

- [ ] Terms & Privacy screen — scrollable, accept stored in profiles.accepted_terms_at
- [ ] Permission explanation cards — explain notification + usage access per platform
- [ ] Notification permission request — contextual, graceful fallback if denied
- [ ] iOS Usage Access — FamilyControls authorization request + status display
- [ ] Android Usage Access — deep-link to ACTION_USAGE_ACCESS_SETTINGS with instructions
- [ ] App selection step — iOS: FamilyActivityPicker / Android: installed app list picker
- [ ] Set limits step — assign daily time per app (hour/minute picker)
- [ ] Set reset time — time picker with timezone, stored on backend
- [ ] Review & Activate — summary before locking in
- [ ] Device registration — POST /api/devices/register on first launch

---

### ⚙️ Phase 2 — Enforcement (Core Product)

> Requires native build — cannot run in Expo Go

#### iOS

- [ ] FamilyControls entitlement — request from Apple + add .entitlements file
- [ ] AuthorizationCenter — request .individual Screen Time authorization
- [ ] ManagedSettingsStore — apply shield to apps when limit = 0
- [ ] DeviceActivityMonitor extension — background usage events
- [ ] DeviceActivityReport extension — render usage data
- [ ] ShieldConfiguration extension — custom "You've hit your limit" UI
- [ ] ShieldAction extension — handle "Open FocusLock" from shield
- [ ] DeviceActivity schedule — schedule daily reset via DeviceActivityCenter

#### Android

- [ ] UsageStatsManager native Kotlin module
- [ ] PACKAGE_USAGE_STATS permission — deep-link + explanation flow
- [ ] Usage polling foreground service / WorkManager
- [ ] Limit detection — compare foreground usage vs limit
- [ ] Enforcement — overlay or approved restriction mechanism
- [ ] Daily reset via AlarmManager exact alarm

#### Shared

- [ ] Real used_seconds — replace simulated data with platform data
- [ ] Local limit persistence — AsyncStorage / SQLite for offline enforcement
- [ ] Reset engine — timezone-aware next-reset calculation (DST, travel, offline)
- [ ] Config state machine — SCHEDULED → ACTIVE → RESET_WINDOW → RESET → ACTIVE
- [ ] Anti-tampering — detect permission revoke, time changes, reinstall

---

### 🔔 Phase 3 — Notifications

- [ ] expo-notifications setup + permission request with explanation
- [ ] Notification settings UI — wired toggles in Settings tab
- [ ] Schedule reset reminder — local notification 20 min before reset
- [ ] Schedule reset notification — fires at reset time
- [ ] Limit approaching — fires at 10 min remaining per app
- [ ] Limit reached — fires when any app hits 0
- [ ] Re-schedule on config change
- [ ] Notification deep-link — tap opens correct dashboard tab

---

### 🔄 Phase 4 — Sync & Multi-Device

- [ ] Configuration versioning — config_version, reject stale syncs
- [ ] /api/sync endpoint — POST device config, GET server config, diff/merge
- [ ] Offline operation — enforce from cached config, sync on reconnect
- [ ] Multi-device conflict resolution — server config wins post-lock
- [ ] Audit log — record every limit change, reset, block event

---

### 📊 Phase 5 — Analytics

- [ ] Daily usage summary — total screen time across all limited apps
- [ ] Weekly usage chart — 7-day bar/line chart per app
- [ ] Time saved view — (limit × days) − actual = time reclaimed
- [ ] Limits respected streak
- [ ] Lock events log — history of when apps were blocked
- [ ] Trends — week-over-week comparison

---

## 🏗️ Infrastructure Still Needed

- [ ] Expo bare workflow / EAS Build — required for Phase 2
- [ ] Apple Developer — FamilyControls entitlement approval
- [ ] Google Play — PACKAGE_USAGE_STATS declared in manifest
- [ ] EAS Update (OTA) — JS fixes post-native build
- [ ] CI/CD — EAS Build + GitHub Actions

---

## *Last updated: 2026-09-29 | WaiyatLabs*
