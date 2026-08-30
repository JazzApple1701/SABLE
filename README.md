# SABLE

SABLE is a private, local-first Windows email client built with Electron, React, and TypeScript.

## Features

- Secure Electron renderer boundary (sandbox, context isolation, no Node integration)
- Responsive three-column unified inbox and individual account views
- Gmail and Outlook accounts with a unified, local-first mailbox
- Threaded reading, attachments, search, starring, composer, archive/trash navigation
- First-run OAuth setup guide and Google Desktop OAuth JSON importing
- Light/dark themes, account palettes, imported fonts and adaptive type sizing
- Keyboard access: `Ctrl+K` focuses search, `C` opens compose, and `Esc` closes overlays
- Windows NSIS packaging configuration

## Run locally

Install Node.js 22 LTS, then:

```powershell
npm install
npm run dev
```

Verification and packaging commands:

```powershell
npm test
npm run build
npm run package:win
```

The installer will be written to `release/` after the integration milestones are complete. A real Node.js installation is recommended for normal development; the initial scaffold was verified with Codex's temporary bundled runtime because Node was not present on this machine's PATH.

## Security architecture

OAuth authorization and API calls will live in Electron's main process, behind a narrow typed preload API. Authorization will use the system browser and PKCE; Postbird will never collect account passwords. Refresh tokens will be encrypted through Windows DPAPI-backed secure credential storage, while settings and a searchable mail cache remain in a local SQLite database. The renderer receives only the mail data and commands it needs.

## Connect Gmail

The Gmail integration is ready for a public desktop client ID:

1. In Google Cloud Console, create or select a project and enable the **Gmail API**.
2. Configure the OAuth consent screen. While the app is in Testing mode, add your own Google addresses as test users.
3. Create an OAuth client with application type **Desktop app**.
4. Download the client JSON.
5. Open **Settings → Accounts → Setup guide** in SABLE and import that JSON.
6. Continue in Google's official system-browser authorization page.

Google includes a client secret in Desktop app JSON files, although installed applications cannot treat it as a confidential secret. SABLE encrypts it locally using Electron `safeStorage`, backed by Windows DPAPI. OAuth tokens receive the same protection. Never commit the downloaded JSON, local settings, token vault, or mail database.

SABLE requests `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/gmail.modify`. It supports mailbox reading, sending, archive, trash, read state, thread retrieval, profile display, and attachment downloads while intentionally excluding immediate permanent deletion.

## Private files

Runtime credentials, OAuth tokens, imported fonts, settings, and cached mail live under Electron's Windows user-data directory and are not part of this repository. The `.gitignore` explicitly excludes common OAuth JSON, token, settings, and mail-database names.

See [SECURITY.md](SECURITY.md) before reporting a vulnerability and [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.
