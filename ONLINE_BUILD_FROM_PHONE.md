# Grapevine — build the APK from an Android phone

You do **not** need Android Studio or a computer. The APK is built on GitHub's servers.

## Phone-only steps

1. In Chrome, open GitHub and sign in/create an account.
2. Create a new **private or public repository** (for example `grapevine-native`).
3. Upload **all contents inside this `GrapevineNative` folder**. Keep the `.github/workflows` folder and both workflow files.
4. Open the repository's **Actions** tab.
5. Choose **Build Grapevine APK**.
6. Tap **Run workflow** and run it from `main`.
7. Wait until the run shows a green checkmark.
8. Open the successful run, scroll to **Artifacts**, and download **Grapevine-debug-apk**.
9. Open the downloaded ZIP, extract `app-debug.apk`, and install it.

The workflow installs Gradle 8.7 on GitHub's build server, so **no Gradle wrapper JAR is required in this ZIP**.

## Which APK to use

Use **Grapevine-debug-apk** for direct phone installation and testing. It is an installable debug APK.

The release workflow currently creates an **unsigned** release APK. Do not use that for normal distribution until a signing key is configured.

## What is inside the APK

- V9 Grapevine web app bundled into Android assets.
- Native Android WebView.
- Native `WebChromeClient.onShowFileChooser()` implementation.
- Android image/file picker support for the Grapevine photo input.
- Existing Supabase URL/key and V9 application logic remain in the bundled web app.

## Supabase

The app uses the existing V9 Supabase configuration. Run the updated `SUPABASE_SETUP.sql` from the V9 fixed project in your Supabase SQL Editor if you have not already done so, especially the `member-photos` bucket and policies.
