# GRAPEVINE Android V27 — Ready-to-Build

Grapevine V27 is a corrected Android project based on the uploaded V26 source. It includes the Grapevine group launcher logo, more reliable network status, public Downloads saving, safer showcase deletion, smaller verification badges, stronger settings-save checks, owner-only Mafia AI history deletion, image/audio attachments, read-aloud responses, and in-app account notifications.

## Included

- Android 8.0+ / API 26 minimum
- Supabase Auth email/password member accounts
- Correct Supabase mobile email-confirmation redirect: `grapevine://auth-callback`
- Confirmation callback session handling for the access/refresh token fragment
- Brevo/Supabase SMTP compatible confirmation flow
- Secure administrator verification through the `is_grapevine_admin()` RPC
- No admin PIN bypass
- Admin member add/remove/edit controls
- Real blue circular zigzag verification badge with white checkmark
- Verification badge positioned with the member name
- Profile-photo upload and persistent IndexedDB offline photo cache
- Gallery image/video/audio uploads
- Standard Storage uploads for files up to 6 MB
- TUS resumable uploads for files over 6 MB, with 6 MB chunks
- 50 MB gallery bucket limit
- Offline gallery media queue and automatic online synchronization
- Gallery showcase approval workflow
- Member download-request workflow with admin approve/reject
- Admin Messages & Replies section
- Android native file chooser for image/video/audio selection
- Grapevine verification badge as the Android launcher icon
- Debug APK build through GitHub Actions

## Important Supabase step

Run:

`app/src/main/assets/SUPABASE_SETUP.sql`

in the Supabase SQL Editor before testing V26. The V26 section creates the secure administrator RPC, reinforces profile/admin policies, repairs the two storage buckets, and keeps the gallery bucket self-healing.

In Supabase Authentication → URL Configuration, keep this redirect URL allowed:

`grapevine://auth-callback`

The app must use the public/publishable (anon) key only. Never place a Supabase service-role/secret key in the APK.

## GitHub build

The included workflow is:

`.github/workflows/build-apk.yml`

It checks the JavaScript syntax and required source files before running the Android build. The resulting artifact is:

`Grapevine-V27-APK`

The project uses Java 17, Gradle 8.9 and Android Gradle Plugin 8.7.3.


## V26 Mafia AI update notes

- Existing Android launcher icon resources and manifest icon references are unchanged.
- Added a brief native launch overlay reading “GRAPEVINE — Powered By Mafia Boss”; it uses the existing Grapevine badge drawable, not a new launcher icon.
- Added a Mafia AI screen and saved conversation history using `mafia_ai_conversations` and `mafia_ai_messages`.
- The frontend calls the deployed Supabase Edge Function at `/functions/v1/mafia-ai-chat`. The `GEMINI_API_KEY` must remain in Supabase Edge Function Secrets, never in this Android project.
- The appended SQL defines RLS policies for member-owned conversations and administrator review. Re-run only if needed; statements use `IF NOT EXISTS` / policy replacement where appropriate.
- Keep the existing GitHub Actions workflow to build the APK. This source package has been syntax-checked for JavaScript, but it has not been built with Android Gradle in this environment.


## Admin's private Mafia AI and member-history review

- Authorized administrators see two separate modes in the Mafia AI screen: **My Private AI** and **Member Histories**.
- **My Private AI** lists and creates conversations owned by the signed-in administrator.
- **Member Histories** lists conversations belonging to other accounts and opens them read-only for review; it does not expose the send box for a member conversation.
- Normal members see only their own conversation list. Supabase row-level security remains the actual access boundary; the UI filter is not a substitute for RLS.
- Member-history review requires the signed-in administrator to satisfy the existing `public.admins` policy check. Confirm the table has the expected `user_id` field.
- Mafia AI can assist the administrator with planning, drafting announcements, and troubleshooting. This UI does not give the model direct permission to execute arbitrary administrator actions in the database.


## V27 behavior and deployment notes

- The Android launcher icon now uses the Grapevine group logo, not the blue verification check. The blue zigzag check remains the member verification badge.
- Launcher artwork is part of the installed APK. Changing it requires building and installing a newer APK; it cannot be changed remotely by editing a contact field.
- Approved gallery downloads are saved into the device's public Downloads folder. Android 8–9 may ask for storage permission.
- Admin changes to an authenticated member profile create an in-app notification when the profile row can be matched to that member's Auth account. Members can view and mark notifications read from the Home page.
- Members and administrators can delete their own Mafia AI conversations. The conversation's messages are removed through the database foreign-key cascade. Administrators can review member histories read-only and cannot delete another member's conversations from this UI.
- Mafia AI supports one image or audio attachment per message (up to 3 MB), and assistant responses have a Read aloud control using the device's speech engine.
- The new `supabase/functions/mafia-ai-chat/index.ts` source must be deployed to the existing Supabase project for image/audio inputs to work. Keep `GEMINI_API_KEY` in Supabase Edge Function Secrets only; never add it to the APK or GitHub source. Deploy the function named `mafia-ai-chat` after confirming the `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GEMINI_API_KEY` secrets are configured.
- Re-run the updated `app/src/main/assets/SUPABASE_SETUP.sql` in the Supabase SQL Editor to create the owner-only Mafia AI conversation delete policy and member notifications table/trigger. Review the SQL editor output and confirm it succeeds before testing those two features.
- The Android project has passed the local JavaScript syntax check and XML parsing. An Android Gradle build has not been run in this environment; GitHub Actions must confirm the final APK build.


## V28 Firebase Cloud Messaging (FCM) push notifications

This version adds Firebase Messaging support to Android and a Supabase Edge Function for admin-targeted pushes. It requires a valid Firebase Android app configuration file at `app/google-services.json` before building. Do not commit any Firebase service-account private key. `google-services.json` is the Android client configuration; the service-account key belongs only in Supabase Edge Function secrets.

### Setup
1. In Firebase Console, register Android app package `com.grapevine.app`, download `google-services.json`, and place it at `app/google-services.json` (not in `app/src`).
2. Run `supabase/FCM_DEVICE_TOKENS.sql` in the Supabase SQL Editor.
3. Deploy Edge Function `send-push-notification` with Supabase CLI. Set function secrets `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` from a Firebase service account with permission to send FCM messages. Preserve the newline characters in the private key when setting the secret. Never put these secrets in the APK or public GitHub. Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions.
4. Build the APK from GitHub Actions and install it on a device with Google Play services. On Android 13+, allow notifications when prompted. Sign in to Grapevine while online so the device token can be registered to that member in Supabase.
5. The Edge Function can be invoked by an authenticated admin with JSON `{\"user_id\":\"TARGET_AUTH_USER_UUID\",\"title\":\"Grapevine\",\"message\":\"Your notification text\"}`. It sends to the target member's registered Android devices. This is the secure sending endpoint; application events must call it when you want particular events (for example new messages or admin announcements) to trigger a push.

### Notes
- Push delivery requires network access, Firebase project setup, the SQL migration, deployed function secrets, and user notification permission. Android background/closed-app notifications are handled by Firebase Messaging.
- This source package does not contain your private Firebase service-account key.
- Version: `versionCode 28`, `versionName 28.0`.
