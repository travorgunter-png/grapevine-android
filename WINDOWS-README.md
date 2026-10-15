# GRAPEVINE V26 for Windows

This adds a Windows desktop wrapper around the existing Grapevine web assets. It preserves the existing Grapevine launcher badge as the desktop app icon and displays a brief `GRAPEVINE — Powered By Mafia Boss` startup splash. It does not replace the existing Android project or its build workflow.

## Build a Windows installer / portable EXE using GitHub Actions

1. Upload/commit the entire project folder contents to the existing GitHub repository, preserving the `app/` folder and `.github/workflows/build-windows.yml`.
2. Open the repository on GitHub and select **Actions**.
3. Choose **Build GRAPEVINE Windows App** from the left side.
4. Select **Run workflow**, then confirm **Run workflow**.
5. Open the completed workflow run. Under **Artifacts**, download `GRAPEVINE-Windows-V26` and extract it.
6. Use `GRAPEVINE Setup 26.0.0.exe` to install, or `GRAPEVINE-26-Portable.exe` to run without installation (artifact names may vary slightly by electron-builder).

## Local development (Windows with Node.js installed)

```powershell
cd windows-app
npm install
npm start
```

To create EXE files locally:

```powershell
npm run dist:win
```

## Important

- This source ZIP does not itself contain a compiled Windows EXE; GitHub Actions creates the EXE on a Windows runner.
- Supabase must remain configured correctly for sign-in, gallery, team chat, admin tools, and Mafia AI. Keep `GEMINI_API_KEY` in Supabase Edge Function secrets; never place it in this desktop package.
- The app uses the same client-side app assets as the supplied V26 Android project. Test sign-in, gallery uploads/downloads, team chat, Mafia AI, and admin permissions on Windows before distributing it.
- Windows may show a SmartScreen warning because the EXE is not code-signed. Do not bypass warnings unless you trust the source and have verified the build.
