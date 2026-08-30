# SABLE V2 setup

SABLE stores mail, preferences, themes, avatars, drafts, and synchronization cursors locally. OAuth tokens and provider secrets are encrypted through Windows secure storage. Gmail and Outlook passwords are never requested or stored.

## Google

1. In Google Cloud Console, enable the Gmail API.
2. Configure the OAuth consent screen and add your Google account as a test user while the app remains in testing.
3. Create an OAuth client with application type **Desktop app**.
4. In SABLE, choose **Login with Google** and enter the desktop client ID and client secret once.
5. Google opens in the system browser. Select the account and approve the requested Gmail and basic profile scopes.

Existing Gmail connections created before V2 continue to work, but reconnect once if you want SABLE to import and locally cache the Google account profile picture.

## Microsoft Outlook

1. Open Microsoft Entra admin center and create an app registration.
2. Under **Authentication**, enable public client flows and add the **Mobile and desktop applications** platform with the loopback redirect option.
3. Add delegated permissions: `User.Read`, `Mail.ReadWrite`, and `Mail.Send`. `openid`, `profile`, `email`, and `offline_access` are requested by the OAuth flow.
4. Copy the **Application (client) ID**.
5. In SABLE, choose **Login with Microsoft** and enter that public client ID. A client secret is not needed.
6. Microsoft opens in the system browser. Select the account and approve access.

## Local data

- Mail cache: `sable-mail.db` in SABLE's Windows application-data directory.
- OAuth vault: `oauth-vault.json`, with token values encrypted by Windows secure storage.
- Settings: `settings.json` in the same application-data directory.
- Use **Settings → Privacy protection → Clear cached mail** to remove cached mail without disconnecting accounts or deleting OAuth tokens.

## Search operators

- `from:name@example.com`
- `account:gmail-address`
- `after:2026-01-01`
- `before:2026-12-31`
- `has:attachment`
- `is:unread`, `is:read`, or `is:starred`

Operators can be combined with ordinary search words.
