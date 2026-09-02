export type Provider = 'gmail' | 'outlook'
export type GmailMailbox = 'inbox' | 'starred' | 'important' | 'drafts' | 'spam' | 'trash'
export interface MailAccount { id: string; provider: Provider; name: string; email: string; color: string; unread: number; avatarDataUrl?: string }
export interface ConnectedAccount extends MailAccount { connected: true }
export interface AccountStatus { googleClientIdConfigured: boolean; googleClientSecretConfigured: boolean; microsoftClientIdConfigured: boolean; accounts: ConnectedAccount[] }
export interface ConnectGoogleResult { account: ConnectedAccount }
export interface ContactProfile { name: string; email: string; avatarDataUrl?: string }
export interface GmailInboxPage { messages: MailMessage[]; nextPageToken?: string }
export interface GmailLabel { id: string; name: string; type: string }
export interface ComposeAttachment { name: string; mimeType: string; dataBase64: string; size: number }
export interface ComposeDraft { to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string; threadId?: string; inReplyTo?: string; attachments?: ComposeAttachment[] }
export interface ThemePalette { accent: string; background: string; surface: string; text: string; muted: string; border: string }
export interface AccountTheme { accountId: string; preset: string; avatarStyle: 'circle' | 'rounded' | 'square'; light: ThemePalette; dark: ThemePalette }
export interface ImportedFont { id: string; name: string; dataUrl: string }
export interface DesktopPreferences { notifications: boolean; launchAtStartup: boolean; minimizeToTray: boolean; backgroundSync: boolean; remoteImages: 'always' | 'trusted' | 'never'; blockTrackers: boolean; cleanLinks: boolean; trustedSenders: string[] }
export interface PostbirdApi {
  platform: string
  version: string
  accounts: {
    status(): Promise<AccountStatus>
    connectGoogle(clientId?: string, clientSecret?: string): Promise<ConnectGoogleResult>
    connectMicrosoft(clientId?: string): Promise<ConnectGoogleResult>
    importGoogleOAuthJson(): Promise<{ configured: boolean; fileName?: string }>
    reopenGoogleLogin(): Promise<void>
    cancelGoogleLogin(): Promise<void>
    disconnect(accountId: string): Promise<void>
    listContacts(accountId: string): Promise<ContactProfile[]>
  }
  appearance: {
    listThemes(): Promise<AccountTheme[]>
    saveTheme(theme: AccountTheme): Promise<void>
    chooseAccountAvatar(accountId: string, email: string): Promise<string | undefined>
    listImportedFonts(): Promise<ImportedFont[]>
    importFonts(): Promise<ImportedFont[]>
  }
  desktop: {
    getPreferences(): Promise<DesktopPreferences>
    savePreferences(preferences: DesktopPreferences): Promise<void>
    notify(title: string, body: string): Promise<void>
    getCacheSize(): Promise<number>
    clearMailCache(): Promise<void>
    openExternal(url: string): Promise<void>
  }
  gmail: {
    listMailbox(accountId: string, mailbox: GmailMailbox, query?: string, pageToken?: string): Promise<GmailInboxPage>
    modifyThread(accountId: string, threadId: string, action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'important' | 'notImportant' | 'spam' | 'notSpam' | 'restore'): Promise<void>
    listLabels(accountId: string): Promise<GmailLabel[]>
    modifyLabels(accountId: string, threadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void>
    downloadAttachment(accountId: string, messageId: string, attachmentId: string, fileName: string): Promise<boolean>
    previewAttachment(accountId: string, messageId: string, attachmentId: string, fileName: string, mimeType?: string): Promise<AttachmentPreview>
    getVisualBody(accountId: string, messageId: string): Promise<string | undefined>
    chooseAttachments(): Promise<ComposeAttachment[]>
    saveDraft(accountId: string, draft: ComposeDraft, draftId?: string): Promise<string>
    deleteDraft(accountId: string, draftId: string): Promise<void>
    send(accountId: string, draft: ComposeDraft): Promise<void>
  }
  outlook: {
    listMailbox(accountId: string, mailbox: GmailMailbox, query?: string, pageToken?: string): Promise<GmailInboxPage>
    modifyMessage(accountId: string, messageId: string, action: 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'important' | 'notImportant' | 'spam' | 'notSpam' | 'restore'): Promise<void>
    downloadAttachment(accountId: string, messageId: string, attachmentId: string, fileName: string): Promise<boolean>
    previewAttachment(accountId: string, messageId: string, attachmentId: string, fileName: string, mimeType?: string): Promise<AttachmentPreview>
    saveDraft(accountId: string, draft: ComposeDraft, draftId?: string): Promise<string>
    deleteDraft(accountId: string, draftId: string): Promise<void>
    send(accountId: string, draft: ComposeDraft): Promise<void>
  }
}
export interface Attachment { id: string; name: string; size: string; kind: 'pdf' | 'image' | 'document'; mimeType?: string }
export interface AttachmentPreview { name: string; mimeType: string; size: number; dataBase64: string }
export interface ThreadMessage {
  id: string; messageId?: string; inReplyTo?: string; references: string[]
  sender: { name: string; email: string; initials: string }; recipients: string[]; cc: string[]
  subject: string; body: string[]; bodyHtml?: string; receivedAt: string; unread: boolean; attachments?: Attachment[]
}
export interface MailMessage {
  id: string; threadId: string; accountId: string
  sender: { name: string; email: string; initials: string }
  recipients: string[]; subject: string; preview: string; body: string[]; bodyHtml?: string
  receivedAt: string; timeLabel: string; unread: boolean; starred: boolean
  labels?: string[]; attachments?: Attachment[]; threadMessages?: ThreadMessage[]
}
