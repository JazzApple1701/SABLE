import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import type { AccountTheme, ContactProfile, GmailInboxPage, GmailMailbox, MailMessage } from '../shared/models'
import type { ComposeDraft } from '../shared/models'

interface MessageRow { payload: string }
interface CursorRow { page_token: string | null }
interface HistoryRow { history_id: string | null }
interface ThemeRow { account_id: string; light_json: string; dark_json: string; preset: string | null; avatar_style: AccountTheme['avatarStyle'] | null }
interface AccountProfileRow { profile_json: string | null; mime_type: string | null; data: Buffer | null }
interface ContactRow { name: string; email: string; mime_type: string | null; avatar_data: Buffer | null }

export class MailCache {
  private database: Database.Database

  constructor(path = join(app.getPath('userData'), 'sable-mail.db')) {
    this.database = new Database(path)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('foreign_keys = ON')
    this.migrate()
  }

  saveMailbox(accountId: string, mailbox: GmailMailbox, page: GmailInboxPage, replace: boolean): void {
    const save = this.database.transaction(() => {
      if (replace) this.database.prepare('DELETE FROM mailbox_membership WHERE account_id = ? AND mailbox = ?').run(accountId, mailbox)
      const upsertMessage = this.database.prepare(`
        INSERT INTO messages (id, account_id, thread_id, received_at, unread, starred, payload, updated_at)
        VALUES (@id, @accountId, @threadId, @receivedAt, @unread, @starred, @payload, unixepoch())
        ON CONFLICT(account_id, id) DO UPDATE SET thread_id=excluded.thread_id, received_at=excluded.received_at,
          unread=excluded.unread, starred=excluded.starred, payload=excluded.payload, updated_at=excluded.updated_at`)
      const addMembership = this.database.prepare('INSERT OR REPLACE INTO mailbox_membership (account_id, mailbox, message_id, received_at) VALUES (?, ?, ?, ?)')
      const clearAttachments = this.database.prepare('DELETE FROM attachments WHERE account_id = ? AND message_id = ?')
      const addAttachment = this.database.prepare('INSERT OR REPLACE INTO attachments (account_id, message_id, attachment_id, name, mime_type, size_label) VALUES (?, ?, ?, ?, ?, ?)')
      const upsertThread = this.database.prepare(`INSERT INTO threads (id, account_id, subject, updated_at) VALUES (?, ?, ?, unixepoch())
        ON CONFLICT(account_id,id) DO UPDATE SET subject=excluded.subject, updated_at=excluded.updated_at`)
      const upsertRelationship = this.database.prepare(`INSERT OR REPLACE INTO relationships (account_id, message_id, parent_message_id, message_identifier, references_json) VALUES (?, ?, ?, ?, ?)`)
      for (const message of page.messages) {
        upsertThread.run(message.threadId, accountId, message.subject)
        upsertMessage.run({ ...message, unread: Number(message.unread), starred: Number(message.starred), payload: JSON.stringify(message) })
        addMembership.run(accountId, mailbox, message.id, message.receivedAt)
        clearAttachments.run(accountId, message.id)
        for (const attachment of message.attachments ?? []) addAttachment.run(accountId, message.id, attachment.id, attachment.name, attachment.mimeType ?? '', attachment.size)
        for (const item of message.threadMessages ?? []) {
          upsertRelationship.run(accountId, item.id, item.inReplyTo ?? null, item.messageId ?? null, JSON.stringify(item.references))
          clearAttachments.run(accountId, item.id)
          for (const attachment of item.attachments ?? []) addAttachment.run(accountId, item.id, attachment.id, attachment.name, attachment.mimeType ?? '', attachment.size)
        }
      }
      this.database.prepare(`INSERT INTO sync_cursors (account_id, mailbox, page_token, synced_at) VALUES (?, ?, ?, unixepoch())
        ON CONFLICT(account_id, mailbox) DO UPDATE SET page_token=excluded.page_token, synced_at=excluded.synced_at`).run(accountId, mailbox, page.nextPageToken ?? null)
    })
    save()
  }

  loadMailbox(accountId: string, mailbox: GmailMailbox): GmailInboxPage {
    const rows = this.database.prepare(`SELECT messages.payload FROM mailbox_membership
      JOIN messages ON messages.account_id = mailbox_membership.account_id AND messages.id = mailbox_membership.message_id
      WHERE mailbox_membership.account_id = ? AND mailbox_membership.mailbox = ? ORDER BY mailbox_membership.received_at DESC`).all(accountId, mailbox) as MessageRow[]
    const cursor = this.database.prepare('SELECT page_token FROM sync_cursors WHERE account_id = ? AND mailbox = ?').get(accountId, mailbox) as CursorRow | undefined
    return { messages: rows.map(row => JSON.parse(row.payload) as MailMessage), nextPageToken: cursor?.page_token ?? undefined }
  }

  saveChangedMessages(accountId: string, mailbox: GmailMailbox, messages: MailMessage[]): void {
    const cursor = this.database.prepare('SELECT page_token FROM sync_cursors WHERE account_id = ? AND mailbox = ?').get(accountId, mailbox) as CursorRow | undefined
    this.saveMailbox(accountId, mailbox, { messages, nextPageToken: cursor?.page_token ?? undefined }, false)
  }

  getHistoryId(accountId: string, mailbox: GmailMailbox): string | undefined {
    const row = this.database.prepare('SELECT history_id FROM sync_cursors WHERE account_id = ? AND mailbox = ?').get(accountId, mailbox) as HistoryRow | undefined
    return row?.history_id ?? undefined
  }

  setHistoryId(accountId: string, mailbox: GmailMailbox, historyId: string): void {
    this.database.prepare(`INSERT INTO sync_cursors (account_id, mailbox, history_id, synced_at) VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(account_id, mailbox) DO UPDATE SET history_id=excluded.history_id, synced_at=excluded.synced_at`).run(accountId, mailbox, historyId)
  }

  clearHistoryId(accountId: string, mailbox: GmailMailbox): void {
    this.database.prepare('UPDATE sync_cursors SET history_id = NULL WHERE account_id = ? AND mailbox = ?').run(accountId, mailbox)
  }

  removeMailboxThread(accountId: string, mailbox: GmailMailbox, threadId: string): void {
    this.database.prepare('DELETE FROM mailbox_membership WHERE account_id = ? AND mailbox = ? AND message_id IN (SELECT id FROM messages WHERE account_id = ? AND thread_id = ?)').run(accountId, mailbox, accountId, threadId)
  }

  removeMailboxMessage(accountId: string, mailbox: GmailMailbox, messageId: string): void { this.database.prepare('DELETE FROM mailbox_membership WHERE account_id = ? AND mailbox = ? AND message_id = ?').run(accountId, mailbox, messageId) }

  clearMailCache(): void { this.database.exec('DELETE FROM mailbox_membership; DELETE FROM messages; DELETE FROM threads; DELETE FROM relationships; DELETE FROM attachments; DELETE FROM sync_cursors;') }
  getCacheSize(): number { const pageCount = this.database.pragma('page_count', { simple: true }) as number; const pageSize = this.database.pragma('page_size', { simple: true }) as number; return pageCount * pageSize }

  removeThread(accountId: string, threadId: string): void {
    this.database.prepare('DELETE FROM mailbox_membership WHERE account_id = ? AND message_id IN (SELECT id FROM messages WHERE account_id = ? AND thread_id = ?)').run(accountId, accountId, threadId)
  }

  saveDraft(accountId: string, id: string, providerId: string | undefined, draft: ComposeDraft): void {
    this.database.prepare(`INSERT INTO drafts (id, account_id, provider_id, payload, updated_at) VALUES (?, ?, ?, ?, unixepoch())
      ON CONFLICT(account_id,id) DO UPDATE SET provider_id=excluded.provider_id, payload=excluded.payload, updated_at=excluded.updated_at`).run(id, accountId, providerId ?? null, JSON.stringify(draft))
  }

  deleteDraft(accountId: string, id: string): void { this.database.prepare('DELETE FROM drafts WHERE account_id = ? AND (id = ? OR provider_id = ?)').run(accountId, id, id) }

  listThemes(): AccountTheme[] {
    return (this.database.prepare('SELECT account_id, light_json, dark_json, preset, avatar_style FROM themes').all() as ThemeRow[]).map(row => ({ accountId: row.account_id, preset: row.preset ?? 'SABLE', avatarStyle: row.avatar_style ?? 'circle', light: JSON.parse(row.light_json), dark: JSON.parse(row.dark_json) }))
  }

  saveTheme(theme: AccountTheme): void {
    this.database.prepare(`INSERT INTO themes (account_id, light_json, dark_json, preset, avatar_style, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(account_id) DO UPDATE SET light_json=excluded.light_json, dark_json=excluded.dark_json, preset=excluded.preset, avatar_style=excluded.avatar_style, updated_at=excluded.updated_at`).run(theme.accountId, JSON.stringify(theme.light), JSON.stringify(theme.dark), theme.preset, theme.avatarStyle)
  }

  saveAccountProfile(accountId: string, provider: string, email: string, profile: { name: string }, avatar?: { mimeType: string; data: Buffer }): void {
    this.database.prepare(`INSERT INTO accounts (id, provider, email, profile_json, updated_at) VALUES (?, ?, ?, ?, unixepoch())
      ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, email=excluded.email, profile_json=excluded.profile_json, updated_at=excluded.updated_at`).run(accountId, provider, email, JSON.stringify(profile))
    if (avatar) this.database.prepare(`INSERT INTO avatars (account_id, identity, mime_type, data, updated_at) VALUES (?, ?, ?, ?, unixepoch())
      ON CONFLICT(account_id,identity) DO UPDATE SET mime_type=excluded.mime_type, data=excluded.data, updated_at=excluded.updated_at`).run(accountId, email.toLowerCase(), avatar.mimeType, avatar.data)
  }

  getAccountProfile(accountId: string, email: string): { name?: string; avatarDataUrl?: string } {
    const row = this.database.prepare(`SELECT accounts.profile_json, avatars.mime_type, avatars.data FROM accounts
      LEFT JOIN avatars ON avatars.account_id = accounts.id AND avatars.identity = ? WHERE accounts.id = ?`).get(email.toLowerCase(), accountId) as AccountProfileRow | undefined
    const profile = row?.profile_json ? JSON.parse(row.profile_json) as { name?: string } : {}
    return { ...profile, avatarDataUrl: row?.data && row.mime_type ? `data:${row.mime_type};base64,${row.data.toString('base64')}` : undefined }
  }

  saveCustomAvatar(accountId: string, email: string, mimeType: string, data: Buffer): void { this.database.prepare(`INSERT INTO avatars (account_id, identity, mime_type, data, updated_at) VALUES (?, ?, ?, ?, unixepoch()) ON CONFLICT(account_id,identity) DO UPDATE SET mime_type=excluded.mime_type, data=excluded.data, updated_at=excluded.updated_at`).run(accountId, email.toLowerCase(), mimeType, data) }

  saveContacts(accountId: string, contacts: Array<ContactProfile & { avatar?: { mimeType: string; data: Buffer } }>): void {
    const save = this.database.transaction(() => {
      this.database.prepare('DELETE FROM contacts WHERE account_id = ?').run(accountId)
      const insert = this.database.prepare('INSERT INTO contacts (account_id, email, name, mime_type, avatar_data, updated_at) VALUES (?, ?, ?, ?, ?, unixepoch())')
      for (const contact of contacts) insert.run(accountId, contact.email.toLowerCase(), contact.name, contact.avatar?.mimeType ?? null, contact.avatar?.data ?? null)
    })
    save()
  }

  loadContacts(accountId: string): ContactProfile[] {
    return (this.database.prepare('SELECT name, email, mime_type, avatar_data FROM contacts WHERE account_id = ? ORDER BY name COLLATE NOCASE').all(accountId) as ContactRow[]).map(row => ({ name: row.name, email: row.email, avatarDataUrl: row.mime_type && row.avatar_data ? `data:${row.mime_type};base64,${row.avatar_data.toString('base64')}` : undefined }))
  }

  close(): void { this.database.close() }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, provider TEXT NOT NULL, email TEXT NOT NULL, profile_json TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE IF NOT EXISTS themes (account_id TEXT PRIMARY KEY, light_json TEXT NOT NULL, dark_json TEXT NOT NULL, preset TEXT, avatar_style TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE IF NOT EXISTS threads (id TEXT NOT NULL, account_id TEXT NOT NULL, subject TEXT, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(account_id,id));
      CREATE TABLE IF NOT EXISTS messages (id TEXT NOT NULL, account_id TEXT NOT NULL, thread_id TEXT NOT NULL, received_at TEXT NOT NULL, unread INTEGER NOT NULL, starred INTEGER NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(account_id,id));
      CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(account_id,thread_id);
      CREATE TABLE IF NOT EXISTS relationships (account_id TEXT NOT NULL, message_id TEXT NOT NULL, parent_message_id TEXT, message_identifier TEXT, references_json TEXT, PRIMARY KEY(account_id,message_id));
      CREATE TABLE IF NOT EXISTS attachments (account_id TEXT NOT NULL, message_id TEXT NOT NULL, attachment_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT, size_label TEXT, local_path TEXT, PRIMARY KEY(account_id,message_id,attachment_id));
      CREATE TABLE IF NOT EXISTS drafts (id TEXT NOT NULL, account_id TEXT NOT NULL, provider_id TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(account_id,id));
      CREATE TABLE IF NOT EXISTS labels (account_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, type TEXT, PRIMARY KEY(account_id,id));
      CREATE TABLE IF NOT EXISTS sync_cursors (account_id TEXT NOT NULL, mailbox TEXT NOT NULL, history_id TEXT, page_token TEXT, synced_at INTEGER NOT NULL, PRIMARY KEY(account_id,mailbox));
      CREATE TABLE IF NOT EXISTS avatars (account_id TEXT NOT NULL, identity TEXT NOT NULL, mime_type TEXT, data BLOB, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(account_id,identity));
      CREATE TABLE IF NOT EXISTS contacts (account_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT, avatar_data BLOB, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(account_id,email));
      CREATE TABLE IF NOT EXISTS notification_state (account_id TEXT NOT NULL, message_id TEXT NOT NULL, notified_at INTEGER, dismissed_at INTEGER, PRIMARY KEY(account_id,message_id));
      CREATE TABLE IF NOT EXISTS mailbox_membership (account_id TEXT NOT NULL, mailbox TEXT NOT NULL, message_id TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(account_id,mailbox,message_id));
      CREATE INDEX IF NOT EXISTS mailbox_order_idx ON mailbox_membership(account_id,mailbox,received_at DESC);
    `)
    const themeColumns = new Set((this.database.prepare('PRAGMA table_info(themes)').all() as Array<{ name: string }>).map(column => column.name))
    if (!themeColumns.has('preset')) this.database.exec('ALTER TABLE themes ADD COLUMN preset TEXT')
    if (!themeColumns.has('avatar_style')) this.database.exec('ALTER TABLE themes ADD COLUMN avatar_style TEXT')
  }
}
