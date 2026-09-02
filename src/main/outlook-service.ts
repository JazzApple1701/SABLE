import type { ComposeDraft, GmailInboxPage, GmailMailbox, MailMessage, ThreadMessage } from '../shared/models'
import { MailCache } from './mail-cache'
import { MicrosoftAuth } from './microsoft-auth'

interface GraphAddress { emailAddress: { name?: string; address: string } }
interface GraphAttachment { id: string; name: string; contentType?: string; size?: number; isInline?: boolean }
interface GraphMessage { id: string; conversationId?: string; internetMessageId?: string; subject?: string; bodyPreview?: string; body?: { contentType: string; content: string }; receivedDateTime: string; isRead: boolean; flag?: { flagStatus?: string }; importance?: string; categories?: string[]; from?: GraphAddress; toRecipients?: GraphAddress[]; ccRecipients?: GraphAddress[]; hasAttachments?: boolean; attachments?: GraphAttachment[]; '@removed'?: { reason: string } }
const sender = (value?: GraphAddress) => { const email = value?.emailAddress.address ?? ''; const name = value?.emailAddress.name || email.split('@')[0]; return { name, email, initials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() } }
const addresses = (values?: GraphAddress[]) => (values ?? []).map(value => value.emailAddress.address)
const graphToMessage = (accountId: string, message: GraphMessage): MailMessage => {
  const received = new Date(message.receivedDateTime); const from = sender(message.from)
  const attachments = (message.attachments ?? []).filter(file => !file.isInline).map(file => ({ id: file.id, name: file.name, size: `${Math.max(1, Math.round((file.size ?? 0) / 1024))} KB`, kind: file.contentType?.startsWith('image/') ? 'image' as const : file.contentType === 'application/pdf' ? 'pdf' as const : 'document' as const, mimeType: file.contentType }))
  const threadMessage: ThreadMessage = { id: message.id, messageId: message.internetMessageId, references: [], sender: from, recipients: addresses(message.toRecipients), cc: addresses(message.ccRecipients), subject: message.subject || '(No subject)', body: [message.bodyPreview || ''], bodyHtml: message.body?.contentType.toLowerCase() === 'html' ? message.body.content : undefined, receivedAt: received.toISOString(), unread: !message.isRead, attachments }
  return { id: message.id, threadId: message.conversationId || message.id, accountId, sender: from, recipients: addresses(message.toRecipients), subject: message.subject || '(No subject)', preview: message.bodyPreview || '', body: [message.bodyPreview || ''], bodyHtml: threadMessage.bodyHtml, receivedAt: received.toISOString(), timeLabel: received.toLocaleDateString() === new Date().toLocaleDateString() ? received.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : received.toLocaleDateString([], { month: 'short', day: 'numeric' }), unread: !message.isRead, starred: message.flag?.flagStatus === 'flagged', labels: [...(message.categories ?? []), ...(message.importance === 'high' ? ['Important'] : [])], attachments, threadMessages: [threadMessage] }
}
const groupConversations = (messages: MailMessage[]): MailMessage[] => {
  const groups = new Map<string, MailMessage[]>()
  for (const message of messages) groups.set(message.threadId, [...(groups.get(message.threadId) ?? []), message])
  return [...groups.values()].map(group => { const ordered = group.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt)); const latest = ordered.at(-1)!; return { ...latest, unread: ordered.some(message => message.unread), attachments: ordered.flatMap(message => message.attachments ?? []), threadMessages: ordered.flatMap(message => message.threadMessages ?? []) } })
}

export class OutlookService {
  constructor(private auth: MicrosoftAuth, private cache?: MailCache) {}
  async listMailbox(accountId: string, mailbox: GmailMailbox, _query = '', pageToken = ''): Promise<GmailInboxPage> {
    const folder: Record<GmailMailbox, string> = { inbox: 'inbox', starred: 'inbox', important: 'inbox', drafts: 'drafts', spam: 'junkemail', trash: 'deleteditems' }
    try {
      const token = await this.auth.getAccessToken(accountId)
      const filter = mailbox === 'starred' ? `&$filter=flag/flagStatus eq 'flagged'` : mailbox === 'important' ? `&$filter=importance eq 'high'` : ''
      const select = '$select=id,conversationId,internetMessageId,subject,bodyPreview,body,receivedDateTime,isRead,flag,importance,categories,from,toRecipients,ccRecipients,hasAttachments&$expand=attachments($select=id,name,contentType,size,isInline)'
      const deltaCursor = mailbox === 'inbox' && !pageToken ? this.cache?.getHistoryId(accountId, mailbox) : undefined
      const url = pageToken || deltaCursor || (mailbox === 'inbox' ? `/me/mailFolders/inbox/messages/delta?$top=50&${select}` : `/me/mailFolders/${folder[mailbox]}/messages?$top=50&$orderby=receivedDateTime desc&${select}${filter}`)
      const page = await this.request<{ value: GraphMessage[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }>(token, url)
      const active = page.value.filter(message => !message['@removed'] && message.receivedDateTime)
      for (const removed of page.value.filter(message => message['@removed'])) this.cache?.removeMailboxMessage(accountId, mailbox, removed.id)
      const result = { messages: groupConversations(active.map(message => graphToMessage(accountId, message))), nextPageToken: page['@odata.nextLink'] }
      if (deltaCursor) this.cache?.saveChangedMessages(accountId, mailbox, result.messages)
      else this.cache?.saveMailbox(accountId, mailbox, result, !pageToken)
      if (page['@odata.deltaLink']) this.cache?.setHistoryId(accountId, mailbox, page['@odata.deltaLink'])
      return deltaCursor ? this.cache?.loadMailbox(accountId, mailbox) ?? result : result
    } catch (error) { const cached = this.cache?.loadMailbox(accountId, mailbox); if (cached?.messages.length) return cached; throw error }
  }
  async modifyMessage(accountId: string, messageId: string, action: 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'important' | 'notImportant' | 'spam' | 'notSpam' | 'restore'): Promise<void> {
    const token = await this.auth.getAccessToken(accountId)
    if (action === 'trash' || action === 'spam' || action === 'notSpam' || action === 'restore') { const destinationId = action === 'trash' ? 'deleteditems' : action === 'spam' ? 'junkemail' : 'inbox'; await this.request(token, `/me/messages/${messageId}/move`, { method: 'POST', body: JSON.stringify({ destinationId }) }); return }
    const body = action === 'read' ? { isRead: true } : action === 'unread' ? { isRead: false } : action === 'star' ? { flag: { flagStatus: 'flagged' } } : action === 'unstar' ? { flag: { flagStatus: 'notFlagged' } } : { importance: action === 'important' ? 'high' : 'normal' }
    await this.request(token, `/me/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  async send(accountId: string, draft: ComposeDraft): Promise<void> { const token = await this.auth.getAccessToken(accountId); await this.request(token, '/me/sendMail', { method: 'POST', body: JSON.stringify({ message: { subject: draft.subject, body: { contentType: 'Text', content: draft.body }, toRecipients: draft.to.map(address => ({ emailAddress: { address } })), ccRecipients: draft.cc?.map(address => ({ emailAddress: { address } })), bccRecipients: draft.bcc?.map(address => ({ emailAddress: { address } })), attachments: draft.attachments?.map(file => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: file.name, contentType: file.mimeType, contentBytes: file.dataBase64 })) }, saveToSentItems: true }) }) }
  async saveDraft(accountId: string, draft: ComposeDraft, draftId?: string): Promise<string> { const token = await this.auth.getAccessToken(accountId); const payload = { subject: draft.subject, body: { contentType: 'Text', content: draft.body }, toRecipients: draft.to.map(address => ({ emailAddress: { address } })), ccRecipients: draft.cc?.map(address => ({ emailAddress: { address } })), bccRecipients: draft.bcc?.map(address => ({ emailAddress: { address } })), attachments: draft.attachments?.map(file => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: file.name, contentType: file.mimeType, contentBytes: file.dataBase64 })) }; const result = await this.request<{ id: string }>(token, draftId ? `/me/messages/${draftId}` : '/me/messages', { method: draftId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); const id = result?.id ?? draftId!; this.cache?.saveDraft(accountId, id, id, draft); return id }
  async deleteDraft(accountId: string, draftId: string): Promise<void> { const token = await this.auth.getAccessToken(accountId); await this.request(token, `/me/messages/${draftId}`, { method: 'DELETE' }); this.cache?.deleteDraft(accountId, draftId) }
  async getAttachment(accountId: string, messageId: string, attachmentId: string): Promise<{ data: Buffer; mimeType: string }> { const token = await this.auth.getAccessToken(accountId); const attachment = await this.request<{ contentBytes: string; contentType?: string }>(token, `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`); return { data: Buffer.from(attachment.contentBytes, 'base64'), mimeType: attachment.contentType ?? 'application/octet-stream' } }
  private async request<T = unknown>(token: string, pathOrUrl: string, init: RequestInit = {}): Promise<T> { const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `https://graph.microsoft.com/v1.0${pathOrUrl}`; const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } }); if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status}).`); return response.status === 202 || response.status === 204 ? undefined as T : response.json() as Promise<T> }
}
