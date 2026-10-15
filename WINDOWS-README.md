# GRAPEVINE V26 for Windows

This project builds a Windows desktop wrapper around the existing Grapevine app assets. It keeps the existing Grapevine badge as the desktop icon and shows the “GRAPEVINE — Powered By Mafia Boss” startup splash. The Android workflow is separate and is not changed by the Windows workflow.

## Build the Windows app

1. Commit the full project, preserving `windows-app/` and `.github/workflows/build-windows.yml`.
2. Open GitHub **Actions** and choose **Build GRAPEVINE Windows App**.
3. Select **Run workflow** and wait for the run to finish successfully.
4. Download the `GRAPEVINE-Windows-V26` artifact and extract it.
5. The artifact should contain the installer EXE, portable EXE, and `SHA256SUMS.txt` checksums.

## SmartScreen and malware scanning

This project cannot guarantee a “no warning” result from Microsoft Defender SmartScreen. SmartScreen reputation is independent of whether the app builds correctly. Newly built, unsigned EXEs commonly show “Windows protected your PC”; that warning alone does not prove malware, but it must not be ignored.

For a more professional distribution, obtain a trusted Windows code-signing certificate and add two GitHub Actions repository secrets under **Settings → Secrets and variables → Actions**:

- `WINDOWS_CODESIGN_CERTIFICATE`: certificate file in the format supported by electron-builder (commonly a base64-encoded PFX certificate, following electron-builder's documented configuration).
- `WINDOWS_CODESIGN_PASSWORD`: password for that certificate.

Only use a certificate you legitimately own or are authorized to use. Never put certificate files/passwords or API keys into the source repository. Signing can identify the publisher and may improve reputation over time, but it does not guarantee SmartScreen warnings disappear immediately.

The workflow writes SHA-256 hashes to `SHA256SUMS.txt` so you can verify the downloaded files have not changed. A checksum confirms file integrity, not that a file is malware-free.

## Test before distribution

Test sign-in, member profiles, gallery uploads/downloads, chat, Mafia AI, and admin access against your configured Supabase project. Keep `GEMINI_API_KEY` in Supabase Edge Function secrets; never place it in the desktop app. Do not distribute the app until you have scanned and tested the actual built EXE.

## Local development

With Node.js installed on Windows:

```powershell
cd windows-app
npm install
npm start
npm run dist:win
```
