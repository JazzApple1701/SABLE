# Security policy

## Private data

Never attach or commit Google OAuth JSON files, Microsoft application configuration, `oauth-vault.json`, `settings.json`, mail databases, exported messages, or logs containing message content. Use redacted placeholders in bug reports.

OAuth authorization occurs on the official Google or Microsoft pages. SABLE never requests provider passwords. Refresh tokens and the Google Desktop OAuth client secret are encrypted through Electron `safeStorage` on Windows.

## Reporting vulnerabilities

Do not open a public issue for a suspected credential exposure, authorization bypass, remote-content escape, or local-data disclosure. Contact the repository owner privately with reproduction steps that contain no real credentials or private email.
