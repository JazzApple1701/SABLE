# SABLE v2 Roadmap

## Resume phrase

When the user says **“let’s do the next version”**, continue implementing this roadmap in milestone order. Inspect the current code and completed work first, then resume from the first unfinished milestone.

## Product direction

SABLE remains a private, local-first Windows email client with a minimalist black-and-white foundation. Gmail and Outlook data, settings, themes, avatars, drafts, and cache stay local. OAuth tokens remain protected by Windows secure credential storage.

## Conversation interface

- Render complete threads as a Reddit-like reply tree.
- Reconstruct parent/child relationships with `Message-ID`, `In-Reply-To`, `References`, and provider thread IDs.
- Draw vertical continuation lines and branch connectors between replies.
- Support expand/collapse, reply, reply-all, forward, unread indicators, quoted-content collapsing, and per-message attachments.
- Fall back to a chronological flat thread when reply headers are incomplete.

## Per-account appearance

- Give every connected account a customizable theme: accent, background, surface, text, muted text, border, and avatar style.
- Include SABLE, Crimson, Ice, Violet, and Terminal presets plus full custom color controls.
- Support separate light/dark values, live preview, reset, automatic contrast selection, and accessibility warnings.
- Apply the full account theme in individual inboxes; keep the unified inbox neutral with account-specific accents.

## Profile pictures and sender icons

- Import the connected Gmail account picture with `openid email profile` scopes.
- Import the connected Outlook picture through Microsoft Graph `/me/photo`.
- Use local custom pictures first, optional contact pictures second, secure BIMI logos when available, then generated initials.
- Make Google Contacts access optional because it requires `contacts.readonly`.
- Cache avatars locally and never use third-party avatar services that reveal email-viewing activity.

## Milestones

### A — Reliability and data foundation

- Permanent single-instance launcher behavior.
- SQLite local cache for accounts, themes, threads, messages, relationships, attachments, drafts, labels, sync cursors, avatars, and notification state.
- Gmail History API incremental synchronization.
- Initial paginated import, offline startup, background updates, and automatic infinite scrolling.

### B — Conversations and composing

- Reddit-style thread tree.
- Complete reply, reply-all, and forward flows.
- Quoted-content collapsing and attachment association.
- Multiple attachments, progress, draft autosave, and provider draft synchronization.

### C — Personalization

- Per-account theme editor and presets.
- Connected-account profile pictures and local avatar cache.
- Optional contact-photo permissions.

### D — Organization and search

- Bulk selection and actions.
- Labels, folders, snooze, spam, starred, and read/unread synchronization.
- Advanced filters for account, sender, date, attachments, and read state.

### E — Windows desktop experience

- Native notifications with quick actions.
- Background synchronization, optional launch at startup, and system tray behavior.

### F — Outlook

- Microsoft OAuth and Graph Mail.
- Outlook folders, categories, profile picture, and Graph delta synchronization.
- Unified Gmail and Outlook inbox and conversations.

### G — Privacy

- Tracking-pixel detection and blocking.
- Remote-image controls, tracking-link cleanup, trusted-sender settings, and local cache controls.

## Recommended implementation order

Complete Milestone A before building the conversation tree. The cached message graph and incremental sync layer are required for reliable threads, search, offline access, notifications, and multi-provider support.

## Implementation status

- Milestone A complete: SQLite cache, Gmail History cursors, Outlook delta cursors, offline fallback, automatic pagination, background synchronization, and hardened single-instance handling.
- Gmail mailbox pages, message payloads, memberships, attachments, and pagination cursors are cached locally.
- Previously synchronized mail falls back from Gmail to SQLite when the network is unavailable.
- Automatic infinite scrolling added, with the manual button retained as an accessible fallback.
- Milestone B implemented: threaded reply graph, branch rails, collapse controls, reply/reply-all/forward, attachments, MIME sending, and synchronized draft autosave.
- Milestone C implemented: account colour presets, separate light/dark palettes, custom controls, contrast feedback, provider and local account avatars.
- Milestone D implemented: provider-native folders, bulk actions, Gmail labels, Outlook categories, and advanced local search operators. Snoozed and Scheduled remain intentionally excluded because the user requested only provider-supported API views.
- Milestone E implemented: native notifications, background synchronization, startup setting, tray behaviour, and focus-safe single-instance launch.
- Milestone F implemented: Microsoft PKCE OAuth, Graph mailboxes and actions, sending, attachments, profile photo cache, categories, and delta synchronization.
- Milestone G implemented: tracking-pixel blocking, remote-image policies, trusted senders, link cleanup, restrictive rendering, and cache controls.
