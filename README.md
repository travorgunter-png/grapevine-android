# GRAPEVINE V26 — Windows Desktop Project

This is a standalone Electron desktop project for Windows, not an Android APK. The project root itself contains `package.json`, `main.cjs`, `index.html`, the Grapevine web app files, and the Windows build workflow.

## Build on GitHub (recommended)
1. Extract this ZIP on your PC.
2. Copy the contents of this folder into the root of your GitHub repository. Keep `.github/workflows/build-windows.yml` in that exact location. Do not delete or replace the existing Android workflow (`build apk.yml`).
3. Commit the files.
4. Open GitHub **Actions** and select **Build GRAPEVINE Windows App**.
5. Click **Run workflow**. The workflow runs on a Windows runner and uploads an artifact named `GRAPEVINE-Windows-V26`.
6. Download that artifact. It should contain `GRAPEVINE-Setup-26.0.0.exe`, `GRAPEVINE-26-Portable.exe`, and `SHA256SUMS.txt`.

## Build locally on Windows
Install Node.js 22 LTS, then open PowerShell in this folder and run:

```powershell
npm install
npm start
npm run dist:win
```

The executables are written to `dist/`.

## Important security and functionality notes
- This is source code, not a prebuilt EXE. A Windows runner must build the executables.
- The build workflow checks JS syntax and creates SHA-256 hashes, but neither step is a malware scan or code signature.
- A new unsigned EXE can still trigger Microsoft SmartScreen. No source project can promise zero antivirus detections. For public distribution, use a legitimate code-signing certificate and scan/test the built executable before sharing it.
- Supabase's public anon key is present in the app as expected for a client app. Never add the Supabase service-role key or Gemini API secret to this project. Keep those secrets on the backend.
- The app requires your configured Supabase project and policies for online account, gallery, chat, and Mafia AI features.
