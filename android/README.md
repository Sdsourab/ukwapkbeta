# UKW Android — lightweight capture app (0.1.0)

This is the first native Android companion for the existing UKW source project. It is deliberately built with the Android SDK only: **no Compose, no AppCompat, no analytics, no ads, no AI SDK, and no third-party runtime dependencies**. Data is stored in a private SQLite database on the phone.

## Implemented in this build

- Android text-selection action through `ACTION_PROCESS_TEXT` (`text/plain`).
- Android Sharesheet receive action through `ACTION_SEND` (`text/plain`).
- Capture editor for quote, note, highlight colour, tags, source title and source URL.
- Local library with search, edit and delete.
- SQLite persistence; saved entries remain after app restart.
- Minified + resource-shrunk release build; minimum Android 6.0 (API 23).

## Not included yet — do not treat as implemented

- Laptop/PWA/Chrome-extension live sync or Supabase sign-in.
- AccessibilityService capture from apps that do not expose selected text.
- Floating overlay panel (`SYSTEM_ALERT_WINDOW`).
- Persistent highlight painting inside other apps (Android apps cannot directly alter another app's UI).
- PDF-specific annotation and cloud backup/export.

The app stores a quote and annotation inside UKW; it does not paint a permanent highlight into the source app. Availability of the selection action depends on the source app and Android version. Share-to-UKW is the fallback.

## Build with GitHub Actions (no Android Studio required)

1. Put this project in a GitHub repository, keeping the root `.github/workflows/android-apk.yml` file.
2. Open **Actions → Build UKW Android APK → Run workflow**.
3. Wait for the workflow to finish successfully.
4. Open the workflow run, download the `ukw-android-apk` artifact and extract `app-release.apk`.
5. Transfer it to the phone and install it. Android may ask permission to install apps from the file manager/browser used to open it.

The workflow builds a minified APK and signs it with the runner's debug certificate for personal testing/sideloading. It is not a Play Store production signing setup. Rebuilding on a fresh runner creates a different debug signing key, so an update may require uninstalling the previous test build first; export/backup is not implemented in this first version.

## Local build

Requires JDK 17, Gradle 8.9 and Android SDK Platform 35 + Build Tools 35.0.0:

```bash
gradle -p android assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.
