# FocusLock

**FocusLock** is a cross-platform screen-time control system engineered
by **WaiyatLabs**.

> **Powered by discipline, not willpower.**

Website:<https://www.waiyatlabs.space/>

------------------------------------------------------------------------

## 1. Product Overview

FocusLock helps users control time spent on distracting apps such as:

- Social media
- Short-video platforms
- Games
- Streaming apps
- Browsers
- Other supported applications

The user chooses which apps to restrict and assigns a **daily
screen-time limit** to each one.

FocusLock continuously accounts for usage throughout the configured day.
Usage is cumulative.

### Example

If Instagram is limited to **2 hours/day**:

- Morning: 20 minutes used → 1h 40m remaining
- Afternoon: 40 minutes used → 1h remaining
- Evening: 1 hour used → 0 remaining
- Instagram becomes restricted until the next daily reset.

The user does not receive another allowance merely because they closed
and reopened the app.

------------------------------------------------------------------------

## 2. Core Philosophy

FocusLock is built around one simple principle:

> **Decide your screen time before distraction takes over.**

The application should make it difficult for a user to change a limit
impulsively after the limit has become inconvenient.

FocusLock is therefore not simply a screen-time analytics application.
It is an **enforcement and self-control system**.

------------------------------------------------------------------------

## 3. Core Rules

## 3.1 Per-App Daily Limits

Each selected application can have its own daily allowance.

Example:

  App           Daily Limit

  Instagram              2h
  TikTok                30m
  Snapchat               1h
  Games(Specific game)   2h
  YouTube                1h

## 3.2 Cumulative Usage

Usage is accumulated across multiple sessions.

``` text
Session 1: 20m
Session 2: 35m
Session 3: 15m
----------------
Total:     70m
```

If the limit is 1 hour, the application is restricted once the
accumulated usage reaches 60 minutes.

## 3.3 Daily Reset

The user chooses a daily reset time.

Examples:

``` text
05:00
08:00
00:00
```

The reset occurs automatically at the configured time.

The reset schedule continues every day until the user is permitted to
change it during the designated configuration window.

## 3.4 Pre-Reset Configuration Window

FocusLock provides an optional reminder **20 minutes before the daily
reset**.

Example:

``` text
Reset time: 08:00

07:40 → Reminder
08:00 → Reset
08:01 → New day's settings are locked
```

During the 20-minute window, the user may configure the **next day's
screen-time limits**.

Once the reset occurs, the configuration window closes.

The user cannot wait until after the reset and increase the current
day's limit.

This is a fundamental anti-impulse rule.

------------------------------------------------------------------------

## 4. Screen-Time Lifecycle

``` text
                    DAILY RESET
                         │
                         ▼
                ┌────────────────┐
                │ New day starts │
                └───────┬────────┘
                        │
                        ▼
               Limits become ACTIVE
                        │
                        ▼
                 User uses an app
                        │
                        ▼
                 Usage is recorded
                        │
              ┌─────────┴─────────┐
              │                   │
        Limit remaining       Limit = 0
              │                   │
              ▼                   ▼
        Continue using       Apply restriction
                                  │
                                  ▼
                             App blocked
                                  │
                                  ▼
                           Wait for reset
```

------------------------------------------------------------------------

## 5. Application States

Each restricted application should have a clear state.

``` text
ACTIVE
WARNING
LIMIT_REACHED
LOCKED
RESET_PENDING
```

### ACTIVE

The application is available and the user still has remaining screen
time.

### WARNING

The user is approaching the daily limit.

### LIMIT_REACHED

The configured allowance has been completely consumed.

### LOCKED

The application is restricted until the next permitted reset.

### RESET_PENDING

The current day is approaching its reset and the next day's
configuration can be prepared.

------------------------------------------------------------------------

## 6. Notification System

Notifications are an explicit FocusLock feature.

Notifications must **never be assumed to be enabled**.

The user must be informed why notification permission is required.

## 6.1 Notification Permission

The application should request notification permission only after
explaining the purpose.

Example:

> FocusLock can notify you 20 minutes before your daily screen-time
> reset so you can prepare tomorrow's limits.

The user may choose to enable notifications.

If permission is denied, FocusLock continues to function without
notifications.

------------------------------------------------------------------------

## 7. Notification Framework

## iOS

Use Apple's:

- `UserNotifications`
- `UNUserNotificationCenter`
- `UNAuthorizationOptions`
- `UNNotificationRequest`
- `UNMutableNotificationContent`
- `UNCalendarNotificationTrigger`
- `UNNotificationSettings`

`UNUserNotificationCenter` is responsible for requesting authorization,
scheduling local notifications, checking notification settings, and
managing delivered/pending notifications.

Official documentation:

<https://developer.apple.com/documentation/usernotifications/unusernotificationcenter>

## Android

Use:

- Android Notification Framework
- `NotificationManager`
- Notification Channels
- `POST_NOTIFICATIONS` on Android 13+
- `AlarmManager` or an appropriate scheduling mechanism for reset
    reminders

Android 13+ requires the `POST_NOTIFICATIONS` runtime permission for
non-exempt notifications.

Official documentation:

<https://developer.android.com/develop/ui/views/notifications>

<https://developer.android.com/reference/android/Manifest.permission#POST_NOTIFICATIONS>

------------------------------------------------------------------------

## 8. Notification Types

FocusLock should support at minimum:

### Reset Reminder

Sent 20 minutes before the configured reset.

``` text
🔔 FocusLock

Your screen-time limits reset in 20 minutes.

You can now prepare your limits for tomorrow.
```

### Reset Completed

Sent at the reset time if notifications are enabled.

``` text
🔄 FocusLock

Your daily screen-time limits have reset.

Your new limits are now active.
```

### Limit Approaching

Optional notification when an application is close to its daily limit.

Example:

``` text
⚠️ FocusLock

You have 10 minutes of Instagram
screen time remaining today.
```

### Limit Reached

Optional notification when the allowance reaches zero.

``` text
🔒 FocusLock

Your Instagram screen-time limit has been reached.

Instagram is now restricted until your next reset.
```

------------------------------------------------------------------------

## 9. Permission Architecture

FocusLock must separate permissions into:

1. Required permissions
2. Optional permissions
3. Platform-specific authorization
4. Notification authorization

The application must never pretend that it has a permission that the
operating system has not granted.

------------------------------------------------------------------------

## 10. iOS Permission and Enforcement Architecture

FocusLock should use Apple's Screen Time technology frameworks.

## Required Frameworks

### FamilyControls

Used to request authorization for Screen Time-related control.

Key object:

``` swift
AuthorizationCenter.shared
```

Authorization request:

``` swift
try await AuthorizationCenter.shared.requestAuthorization(
    for: .individual
)
```

For the Family Controls capability, the app requires the appropriate
Apple entitlement.

### ManagedSettings

Used to apply restrictions/shields to selected applications.

Primary object:

``` swift
ManagedSettingsStore
```

This is the enforcement layer.

### DeviceActivity

Used for monitoring device/app activity and handling schedules and usage
thresholds.

Device Activity can execute monitoring code through an extension even
when the main application is not running.

### FamilyActivityPicker

Used to let the user select applications, categories, and supported web
domains without requiring FocusLock to expose private application
identity data unnecessarily.

------------------------------------------------------------------------

## 11. iOS Screen-Time Extension Targets

The iOS implementation may contain:

``` text
FocusLock
│
├── Main App
│
├── Device Activity Monitor Extension
│
├── Device Activity Report Extension
│
├── Shield Configuration Extension
│
└── Shield Action Extension
```

Not every extension is necessarily required for the first release, but
the architecture should allow them.

------------------------------------------------------------------------

## 12. iOS Family Controls Entitlement

The project must include:

``` text
com.apple.developer.family-controls
```

The entitlement must be properly configured and approved for
distribution by Apple.

Do not treat this entitlement as an ordinary runtime permission.

Apple requires a capability/entitlement approval process for
distribution.

Official documentation:

<https://developer.apple.com/documentation/familycontrols>

<https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement>

------------------------------------------------------------------------

## 13. iOS Notification Permission Object

The primary notification authorization object is:

``` swift
UNUserNotificationCenter.current()
```

Example architecture:

``` swift
let center = UNUserNotificationCenter.current()

center.requestAuthorization(
    options: [.alert, .sound, .badge]
) { granted, error in
    // Store notification authorization state.
}
```

The application should also inspect:

``` swift
center.getNotificationSettings { settings in
    // Check current notification authorization state.
}
```

Never assume that the user still has notifications enabled.

------------------------------------------------------------------------

## 14. Android Usage Access

Android implementation should use the platform's usage statistics
facilities.

Relevant API:

``` text
UsageStatsManager
```

Relevant permission:

``` text
android.permission.PACKAGE_USAGE_STATS
```

This permission is special: the user grants usage access through Android
Settings rather than through a normal runtime permission dialog.

FocusLock must provide a clear explanation and a Settings
deep-link/instruction flow.

Official documentation:

<https://developer.android.com/reference/android/app/usage/UsageStatsManager>

<https://developer.android.com/reference/android/Manifest.permission#PACKAGE_USAGE_STATS>

------------------------------------------------------------------------

## 15. Android Notification Permission

For Android 13/API 33 and newer:

``` text
android.permission.POST_NOTIFICATIONS
```

FocusLock should request it in context, explaining why notifications are
useful.

The app should verify notification availability before scheduling or
relying on notifications.

------------------------------------------------------------------------

## 16. Android Enforcement Layer

Android enforcement must be implemented using mechanisms permitted by
the target Android version, distribution channel, and device
environment.

The enforcement architecture should be separated from the usage-tracking
architecture.

``` text
UsageStatsManager
       │
       ▼
Usage Engine
       │
       ▼
Limit Engine
       │
       ▼
Restriction Engine
       │
       ▼
Supported Android enforcement mechanism
```

The implementation must not depend on unsupported or deceptive
techniques such as pretending to force-quit another application's
process.

------------------------------------------------------------------------

## 17. Cross-Platform Architecture

The product should share its business logic and backend while keeping
OS-specific enforcement native.

``` text
                         FocusLock Backend
                                │
                ┌───────────────┴───────────────┐
                │                               │
             iOS Client                    Android Client
                │                               │
        Native Screen-Time APIs          Native Android APIs
                │                               │
        Local Usage Engine               Local Usage Engine
                │                               │
        Local Limit Engine               Local Limit Engine
                │                               │
        Local Enforcement                Local Enforcement
```

The backend should not be responsible for real-time enforcement.

The device must be capable of enforcing active limits locally.

------------------------------------------------------------------------

## 18. Backend Responsibilities

The backend should manage:

- User accounts
- Authentication
- User profiles
- Device registration
- Screen-time configurations
- Daily reset configuration
- Per-app limits
- Configuration versioning
- Synchronization
- Subscription/billing if introduced
- Analytics
- Notification preferences
- Security events
- Audit records
- Account recovery

The backend should **not** be the sole source of truth for whether an
app is currently blocked.

The device must retain enough local information to enforce the active
configuration without continuous internet access.

------------------------------------------------------------------------

# 19. Configuration Model

A screen-time configuration should contain concepts such as:

``` json
{
  "appId": "platform-specific-app-token",
  "dailyLimitSeconds": 7200,
  "resetTime": "08:00",
  "timezone": "Africa/Nairobi",
  "notificationsEnabled": true,
  "configurationVersion": 12,
  "effectiveFrom": "2026-09-29T08:00:00",
  "status": "scheduled"
}
```

Platform-specific application identifiers/tokens must remain
platform-specific.

Do not assume an iOS application token can be used as an Android package
name.

------------------------------------------------------------------------

## 20. Configuration Locking

FocusLock should use a state machine rather than a simple editable
settings page.

Example:

``` text
SCHEDULED
    ↓
ACTIVE
    ↓
RESET_WINDOW
    ↓
RESET
    ↓
ACTIVE
```

### ACTIVE_STATUS

Current day's limits cannot be increased.

### RESET_WINDOW

The user may configure the next day's limits.

### RESET

The next configuration becomes active.

### Important

The server and device should validate configuration transitions.

A client-side UI lock alone is not sufficient.

------------------------------------------------------------------------

## 21. Anti-Tampering Principles

FocusLock should detect, record, and respond to:

- Required permission revoked
- Screen Time authorization changed
- Notification permission changed
- Device time/timezone changes where detectable
- Configuration mismatch
- Local data corruption
- App reinstallation
- Device replacement
- Backend synchronization conflicts

The application should never claim to provide absolute protection
against operating-system-level changes.

Instead:

> **Detect → warn → recover → re-authorize → restore protection.**

------------------------------------------------------------------------

## 22. Time and Reset Security

Reset calculations must be timezone-aware.

Store:

``` text
Timezone
Reset local time
Effective date
Configuration version
```

Avoid treating a reset such as `08:00` as a UTC timestamp.

The reset should be calculated according to the user's configured
timezone and the platform's calendar/time APIs.

Special cases must include:

- Daylight-saving transitions
- Timezone changes
- Manual clock changes
- Travel
- Device offline
- Reboot
- App not running
- Device sleep
- Missed notification delivery

------------------------------------------------------------------------

## 23. Notification Scheduling

Notifications should preferably be scheduled locally where possible.

For each daily reset:

``` text
Reset = 08:00

Reminder = 07:40
Reset event = 08:00
```

When the user changes tomorrow's settings during the configuration
window:

1. Validate the new configuration.
2. Save it locally.
3. Synchronize it with the backend.
4. Update pending notification schedules.
5. Preserve the currently active day's restrictions.

------------------------------------------------------------------------

## 24. Security Requirements

FocusLock should implement:

- Secure authentication
- Encrypted network communication
- Secure local storage
- Token/key protection
- Server-side authorization
- Device registration
- Configuration versioning
- Replay/conflict protection
- Audit logging
- Minimal collection of usage data
- Privacy-first application identifiers
- Secure logout
- Account deletion

Never store unnecessary personal usage data.

------------------------------------------------------------------------

## 25. Privacy Requirements

FocusLock deals with sensitive usage information.

The application should follow data minimization.

Prefer:

``` text
Instagram
2h limit
1h 24m used
```

over storing unnecessary detailed browsing/activity histories.

Where the platform provides privacy-preserving application tokens, use
them rather than attempting to reveal application identities
unnecessarily.

------------------------------------------------------------------------

## 26. Main Screens

## Onboarding

``` text
Welcome
    ↓
Terms & Privacy
    ↓
Explain permissions
    ↓
Request required authorization
    ↓
Notification preference
    ↓
Select apps
    ↓
Set limits
    ↓
Set daily reset
    ↓
Review
    ↓
Activate
```

## Dashboard

Display:

- Today's total usage
- Individual app limits
- Remaining time
- Locked applications
- Next reset
- Configuration status

## App Selection

Allow users to select supported applications/categories.

## Screen-Time Settings

Allow:

- Daily limits
- Reset time
- Next-day configuration

Do not expose editing controls when the current configuration is locked.

## Notification Settings

Example:

``` text
Notifications

Reset reminder       ON
Limit warnings       ON
Limit reached        ON
Daily reset          ON
```

Each setting should clearly state what it does.

------------------------------------------------------------------------

## 27. UX Rule

FocusLock should never shame the user.

The tone should be:

``` text
You set the limit.
You used the limit.
Now FocusLock keeps your decision.
```

Not:

``` text
You failed.
```

------------------------------------------------------------------------

## 28. Recommended Technology Direction

## Backend

Possible stack:

- TypeScript / Node.js
- REST or GraphQL API
- PostgreSQL
- Redis where required
- WebSocket/push infrastructure where useful
- Object storage for non-sensitive assets
- OAuth/passkey/email authentication as appropriate

### iOS PLATFORM

- ReactNative
- Nativewind
- FamilyControls
- ManagedSettings
- DeviceActivity
- UserNotifications
- Screen Time API extensions

### Android Platform

- Kotlin
- ReactNative & Nativewind
- Jetpack Compose
- UsageStatsManager
- NotificationManager
- Android Alarm/Scheduling APIs
- Platform-approved enforcement mechanisms

## Shared

- API contracts
- Authentication model
- Configuration schema
- Business rules
- Localization
- Analytics events
- Backend synchronization protocol

------------------------------------------------------------------------

## 29. Suggested Repository Structure

``` text
focuslock/
│
├── README.md
├── docs/
│   ├── architecture.md
│   ├── product-spec.md
│   ├── security.md
│   ├── privacy.md
│   └── api.md
│
├── backend/
│   ├── api/
│   ├── auth/
│   ├── users/
│   ├── devices/
│   ├── screen-time/
│   ├── notifications/
│   └── database/
│
├── ios/
│   ├── FocusLock/
│   ├── DeviceActivityMonitor/
│   ├── DeviceActivityReport/
│   ├── ShieldConfiguration/
│   └── ShieldAction/
│
├── android/
│   └── app/
│       ├── usage/
│       ├── limits/
│       ├── restrictions/
│       ├── notifications/
│       └── settings/
│
└── shared/
    ├── models/
    ├── api/
    └── constants/
```

------------------------------------------------------------------------

## 30. Minimum Viable Product

### Phase 1 --- Foundation

- Account creation
- Authentication
- Device registration
- Terms & Privacy acceptance
- Permission onboarding
- App selection
- Daily screen-time limits
- Daily reset time

### Phase 2 --- Enforcement

- Usage measurement
- Cumulative timers
- Limit detection
- App restriction
- Locked state
- Reset engine

### Phase 3 --- Notifications

- Notification permission
- 20-minute reset reminder
- Reset notification
- Limit warning
- Limit reached notification
- Notification settings

### Phase 4 --- Synchronization

- Backend synchronization
- Configuration versioning
- Multi-device support
- Conflict resolution
- Offline operation

### Phase 5 --- Analytics

- Daily usage
- Weekly usage
- Time saved
- Limits respected
- Lock events
- Trends

------------------------------------------------------------------------

## 31. Acceptance Criteria

FocusLock is considered functional when:

- A user can select supported applications.
- A user can assign a daily screen-time limit.
- Usage accumulates across multiple sessions.
- Reopening an application does not reset its allowance.
- An application becomes restricted when its allowance reaches zero.
- Restrictions remain until the configured reset.
- The daily reset occurs automatically.
- A 20-minute pre-reset notification can be enabled.
- Notifications are not sent when the user has disabled notification
    permission.
- The user can configure the next day's limits during the permitted
    window.
- The user cannot increase the active day's limit after the reset
    window closes.
- Required permissions are explicitly requested and their status is
    monitored.
- The app continues enforcing locally where platform APIs permit it
    without requiring continuous internet access.
- Backend synchronization cannot silently override a locally active
    restriction.
- Timezone and reset calculations are deterministic and tested.

------------------------------------------------------------------------

## 32. Important Platform Reality

FocusLock must work **with** operating-system security models, not
against them.

iOS and Android do not provide identical APIs for controlling other
applications.

Therefore:

> **One product + one backend + platform-specific enforcement engines**

is the correct architecture.

The user experience and business rules should remain consistent across
platforms while the enforcement implementation is native to each
operating system.

------------------------------------------------------------------------

## 33. Product Identity

**Product:** FocusLock

**Organization:** WaiyatLabs

**Positioning:**

> **Take control of your screen time.**

**Engineering:**

> Engineered by WaiyatLabs

Website:

<https://www.waiyatlabs.space/>

------------------------------------------------------------------------

## 34. Development Principle

FocusLock should always prioritize:

## **Discipline → Privacy → Reliability → Security → Simplicity**

The objective is not to collect more data.

The objective is not to keep users inside FocusLock.

The objective is to help users spend less time inside distracting
applications and more time doing what they actually intended to do.

------------------------------------------------------------------------

## License

To be defined by WaiyatLabs before public release.

## Status

## **Planning / Architecture**

FocusLock is currently being designed as a cross-platform screen-time
enforcement product.
