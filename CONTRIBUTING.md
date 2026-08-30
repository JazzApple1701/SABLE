# Contributing to SABLE

## Local development

Use Node.js 22 LTS, then run `npm install`, `npm test`, and `npm run dev`. Before submitting a change, run `npm run build`.

## Privacy requirements

- Never add real OAuth credentials, access tokens, refresh tokens, mail databases, personal email, or downloaded attachments.
- Keep provider API and token operations in Electron's main process behind the typed preload boundary.
- Preserve renderer sandboxing, context isolation, least-privilege OAuth scopes, and official system-browser authorization.
- Add or update tests for account, synchronization, message-action, settings, or security-sensitive changes.

Use sample data and redacted identifiers in tests, screenshots, and issues.
