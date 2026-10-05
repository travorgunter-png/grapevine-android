# Grapevine Native Android

Native Android wrapper for the Grapevine V9 web application.

The Android layer is deliberately responsible for HTML file selection through `WebChromeClient.onShowFileChooser()`. This avoids relying on generic HTML-to-APK converters for gallery access.

## Build without Android Studio

Use the included GitHub Actions workflow:

`.github/workflows/build-apk.yml`

It installs Gradle 8.7 on the GitHub runner and produces an installable debug APK named `Grapevine-debug-apk`.

See `ONLINE_BUILD_FROM_PHONE.md` for phone-only instructions.
