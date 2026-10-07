# GRAPEVINE Android V24 — Fresh Build

V21 keeps the existing GRAPEVINE member/admin/gallery features while hardening member authentication and launcher branding.

- Android 8.0+ (API 26)
- Email/password member registration with full name and password confirmation
- No anonymous sign-in for member chat
- Supabase email confirmation supported
- Member chat sign-in and admin replies
- Gallery image/video/audio upload with resumable uploads for media larger than 6 MB
- Member download requests with admin approve/reject workflow
- Admin Messages & Replies section
- Offline media/photo caching already included
- Explicit Grapevine legacy + Android adaptive launcher icon


Before distributing V21, run app/src/main/assets/SUPABASE_SETUP.sql in the Supabase SQL Editor. Add the exact redirect URL `grapevine://auth-callback` to Supabase Authentication URL Configuration > Additional Redirect URLs.


## V23 gallery upload fix
The Android WebView now uses Supabase resumable/TUS uploads for files larger than 6 MB, including MP4 videos such as 12.9 MB files. The updated SQL also sets the `gallery-media` bucket limit to 50 MB. Run the updated `app/src/main/assets/SUPABASE_SETUP.sql` once in the Supabase SQL Editor before testing the new APK.


## V23.1 Gallery upload fix

The Gallery uploader uses Supabase TUS resumable uploads for media larger than 6 MB. The uploader uses the project's direct `*.storage.supabase.co` hostname, sends the TUS creation request without the PostgREST JSON `Content-Type`, and uses the required 6 MB chunks. The SQL setup also creates/repairs the `gallery-media` bucket with a 50 MB bucket limit.

After installing this build, run `app/src/main/assets/SUPABASE_SETUP.sql` once in the Supabase SQL Editor, then sign in again and test the Gallery with the MP4.


## V24 gallery upload architecture
The gallery uses Supabase TUS resumable uploads for every selected media file. The upload endpoint uses the project's direct `*.storage.supabase.co` hostname, 6 MB chunks, TUS metadata, bearer authentication, retry delays, and unique object paths. The SQL setup creates the `gallery-media` bucket with a 50 MB bucket limit and includes a corrected authenticated self-healing bucket function.

Supabase recommends resumable uploads for files above 6 MB and specifies 6 MB chunks for TUS.

## GitHub build
Upload the whole project to a new GitHub repository. GitHub Actions will build `app-debug.apk` automatically. The APK is available under the workflow run's Artifacts as `grapevine-v24-debug-apk`.

## Supabase setup
Run `app/src/main/assets/SUPABASE_SETUP.sql` once in the Supabase SQL Editor before testing. Do not put a Supabase service-role key into the app. The bundled app uses the existing public/anon configuration only.
