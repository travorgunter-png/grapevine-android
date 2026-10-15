# GRAPEVINE Android V26 — Ready-to-Build

Grapevine V26 is the cleaned, ready-to-build Android project based on the V25 source, with the known admin, authentication, gallery, offline-photo and launcher issues addressed.

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

`Grapevine-V26-APK`

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
