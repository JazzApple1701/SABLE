# SABLE

SABLE is a minimalist, local-first Windows email application that brings Gmail and Outlook accounts into one private, unified inbox.

## Download for Windows

**[Download the latest SABLE installer](https://github.com/JazzApple1701/SABLE/releases/latest)**

Open the release page, download `SABLE-2.1.1-Windows-Setup.exe`, and run it. Normal users do **not** need Node.js, a cloud database, or paid hosting.

> Windows may show an “Unknown publisher” warning because this personal open-source build is not yet code-signed. Confirm that the download came from this repository before continuing.

## What SABLE does

- Combines multiple Gmail and Outlook accounts in one inbox
- Keeps account indicators and separate account mailboxes
- Reads complete conversations with threaded replies
- Composes, replies to, and forwards email with attachments
- Archives, deletes, stars, and changes read status
- Searches mail and synchronizes inboxes in the background
- Displays HTML email, remote images, and attachment quick previews
- Supports light/dark mode, account colours, custom fonts, and adjustable text sizes
- Stores mail, settings, and protected OAuth tokens locally on Windows

## First-time setup

Launch SABLE and follow the introductory guide.

### Connect Gmail

Google requires each open-source desktop user to provide their own Desktop OAuth configuration:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Gmail API**.
3. Configure the OAuth consent screen. While it is in Testing mode, add your Gmail address as a test user.
4. Create an OAuth client with application type **Desktop app**.
5. In SABLE, choose either:
   - **Import JSON file** — download and select Google’s `client_secret_….json` file.
   - **Enter credentials manually** — paste the Desktop client ID and client secret.
6. Select **Connect Gmail** and choose your account on Google’s official authorization page.

SABLE requests `openid`, `email`, `profile`, and `gmail.modify`. It never asks for or stores your Gmail password.

### Connect Outlook

Open **Settings → Accounts → Add Outlook account** and follow Microsoft’s official authorization flow. If prompted, provide the public desktop application ID created in Microsoft Entra. Desktop applications do not require a Microsoft client secret.

## Privacy and local storage

- OAuth tokens and the Google Desktop client secret are encrypted with Electron `safeStorage`, backed by Windows DPAPI.
- Cached mail, settings, imported fonts, and account preferences remain inside SABLE’s Windows application-data directory.
- OAuth JSON files, tokens, settings, mail databases, logs, dependencies, and packaged builds are excluded from Git.
- Disconnecting an account removes its locally stored authorization and cached data from SABLE.

See [SECURITY.md](SECURITY.md) for security reporting and implementation details.

## Building and contributing

This section is for developers only. Installing the released application does not require these tools.

Requirements: Node.js 22 LTS, npm, and Windows.

```powershell
npm install
npm run dev
```

Run checks and build the Windows installer:

```powershell
npm test
npm run build
npm run package:win
```

The installer is written to `release/`. Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

SABLE is built with Electron, React, TypeScript, Gmail API, Microsoft Graph, SQLite, and Windows secure credential storage.
