import type { ComposeDraft, GmailInboxPage, GmailLabel, GmailMailbox, MailMessage, ThreadMessage } from '../shared/models'
import { GoogleAuth } from './google-auth'
import { MailCache } from './mail-cache'
import { decodeMailText } from './mail-text'

interface GmailPart { mimeType?: string; filename?: string; headers?: Array<{ name: string; value: string }>; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[] }
interface GmailMessage { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } }
interface GmailThread { id: string; messages?: GmailMessage[] }
interface GmailHistoryMessage { id: string; threadId: string; labelIds?: string[] }
interface GmailHistoryRecord { messages?: GmailHistoryMessage[]; messagesAdded?: Array<{ message: GmailHistoryMessage }>; messagesDeleted?: Array<{ message: GmailHistoryMessage }>; labelsAdded?: Array<{ message: GmailHistoryMessage }>; labelsRemoved?: Array<{ message: GmailHistoryMessage }> }
const decode = (value?: string): string => value ? Buffer.from(value, 'base64url').toString('utf8') : ''
const header = (message: GmailMessage, name: string): string => message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
const cleanAddress = (value: string): { name: string; email: string; initials: string } => {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/)
  const email = (match?.[2] ?? value).trim()
  const name = (match?.[1] || email.split('@')[0]).replace(/^"|"$/g, '').trim()
  return { name, email, initials: name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() }
}
const findText = (part?: GmailPart): string => {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeMailText(decode(part.body.data))
  for (const child of part.parts ?? []) { const text = findText(child); if (text) return text }
  if (part.mimeType === 'text/html' && part.body?.data) return decodeMailText(decode(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, ' '))
  return decodeMailText(decode(part.body?.data))
}
const findHtml = (part?: GmailPart): string => {
  if (!part) return ''
  if (part.mimeType === 'text/html' && part.body?.data) return decode(part.body.data)
  for (const child of part.parts ?? []) { const html = findHtml(child); if (html) return html }
  return ''
}
const listAttachments = (part?: GmailPart): Array<{ id: string; name: string; size: string; kind: 'pdf' | 'image' | 'document' }> => {
  if (!part) return []
  const own = part.filename && part.body?.attachmentId ? [{ id: part.body.attachmentId, name: part.filename, size: `${Math.max(1, Math.round((part.body.size ?? 0) / 1024))} KB`, kind: part.mimeType?.startsWith('image/') ? 'image' as const : part.mimeType === 'application/pdf' ? 'pdf' as const : 'document' as const, mimeType: part.mimeType }] : []
  return [...own, ...(part.parts ?? []).flatMap(listAttachments)]
}
const sanitizeHeader = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()
const buildRawMessage = (draft: ComposeDraft): string => {
  const headers = [`To: ${draft.to.map(sanitizeHeader).join(', ')}`, `Subject: ${sanitizeHeader(draft.subject)}`, 'MIME-Version: 1.0']
  if (draft.cc?.length) headers.splice(1, 0, `Cc: ${draft.cc.map(sanitizeHeader).join(', ')}`)
  if (draft.bcc?.length) headers.splice(draft.cc?.length ? 2 : 1, 0, `Bcc: ${draft.bcc.map(sanitizeHeader).join(', ')}`)
  if (draft.inReplyTo) headers.push(`In-Reply-To: ${sanitizeHeader(draft.inReplyTo)}`, `References: ${sanitizeHeader(draft.inReplyTo)}`)
  if (!draft.attachments?.length) return Buffer.from(`${headers.join('\r\n')}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${draft.body}`).toString('base64url')
  const boundary = `sable_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const parts = [`--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${draft.body}`]
  for (const file of draft.attachments) parts.push(`--${boundary}\r\nContent-Type: ${file.mimeType}; name="${sanitizeHeader(file.name).replace(/"/g, '')}"\r\nContent-Disposition: attachment; filename="${sanitizeHeader(file.name).replace(/"/g, '')}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${file.dataBase64.match(/.{1,76}/g)?.join('\r\n') ?? file.dataBase64}`)
  return Buffer.from(`${headers.join('\r\n')}\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n${parts.join('\r\n')}\r\n--${boundary}--`).toString('base64url')
}
const messageToThreadMessage = (message: GmailMessage): ThreadMessage => {
  const body = findText(message.payload).split(/\n{2,}/).map(text => text.trim()).filter(Boolean)
  const references = header(message, 'References').match(/<[^>]+>/g) ?? []
  return {
    id: message.id, messageId: header(message, 'Message-ID') || undefined, inReplyTo: header(message, 'In-Reply-To') || undefined, references,
    sender: cleanAddress(header(message, 'From')), recipients: header(message, 'To').split(',').map(value => value.trim()).filter(Boolean),
    cc: header(message, 'Cc').split(',').map(value => value.trim()).filter(Boolean), subject: header(message, 'Subject') || '(No subject)',
    body: body.length ? body : [message.snippet ?? ''], bodyHtml: findHtml(message.payload) || undefined,
    receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(), unread: message.labelIds?.includes('UNREAD') ?? false,
    attachments: listAttachments(message.payload)
  }
}
const threadToMessage = (accountId: string, thread: GmailThread): MailMessage | undefined => {
  const latest = thread.messages?.at(-1)
  if (!latest) return undefined
  const date = new Date(Number(latest.internalDate ?? Date.now()))
  const body = findText(latest.payload).split(/\n{2,}/).map(text => text.trim()).filter(Boolean)
  const bodyHtml = findHtml(latest.payload)
  return {
    id: latest.id, threadId: thread.id, accountId, sender: cleanAddress(header(latest, 'From')),
    recipients: header(latest, 'To').split(',').map(value => value.trim()).filter(Boolean),
    subject: header(latest, 'Subject') || '(No subject)', preview: latest.snippet ?? '', body: body.length ? body : [latest.snippet ?? ''], bodyHtml: bodyHtml || undefined,
    receivedAt: date.toISOString(), timeLabel: date.toLocaleDateString() === new Date().toLocaleDateString() ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    unread: latest.labelIds?.includes('UNREAD') ?? false, starred: latest.labelIds?.includes('STARRED') ?? false,
    labels: latest.labelIds?.filter(label => !['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT'].includes(label)), attachments: listAttachments(latest.payload),
    threadMessages: (thread.messages ?? []).map(messageToThreadMessage)
  }
}

export class GmailService {
  constructor(private auth: GoogleAuth, private cache?: MailCache) {}

  async listMailbox(accountId: string, mailbox: GmailMailbox, query = '', pageToken = ''): Promise<GmailInboxPage> {
    const mailboxQueries: Record<GmailMailbox, string> = { inbox: 'in:inbox', starred: 'is:starred', important: 'is:important', drafts: 'in:drafts', spam: 'in:spam', trash: 'in:trash' }
    const params = new URLSearchParams({ maxResults: '50', q: `${mailboxQueries[mailbox]} ${query}`.trim() })
    if (mailbox === 'spam' || mailbox === 'trash') params.set('includeSpamTrash', 'true')
    if (pageToken) params.set('pageToken', pageToken)
    let listing: { threads?: Array<{ id: string }>; nextPageToken?: string }
    let token: string
    try {
      token = await this.auth.getAccessToken(accountId)
      if (mailbox === 'inbox' && !query && !pageToken && this.cache?.getHistoryId(accountId, mailbox) && this.cache.loadMailbox(accountId, mailbox).messages.length) {
        await this.syncInboxHistory(accountId, token)
        return this.cache.loadMailbox(accountId, mailbox)
      }
      listing = await this.request(token, `/threads?${params}`)
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('(404)') && token!) {
        this.cache?.clearHistoryId(accountId, mailbox)
        listing = await this.request(token, `/threads?${params}`)
      } else {
      const cached = this.cache?.loadMailbox(accountId, mailbox)
      if (cached?.messages.length) return cached
      throw error
      }
    }
    const summaries = listing.threads ?? []
    const threads: GmailThread[] = []
    for (let index = 0; index < summaries.length; index += 4) {
      const batch = summaries.slice(index, index + 4)
      threads.push(...await Promise.all(batch.map(item => this.request<GmailThread>(token, `/threads/${item.id}?format=full`))))
    }
    const messages = threads.map(thread => threadToMessage(accountId, thread)).filter((message): message is MailMessage => Boolean(message))
    const page = { messages, nextPageToken: listing.nextPageToken }
    this.cache?.saveMailbox(accountId, mailbox, page, !pageToken)
    if (mailbox === 'inbox' && !pageToken) {
      const profile = await this.request<{ historyId: string }>(token, '/profile')
      this.cache?.setHistoryId(accountId, mailbox, profile.historyId)
    }
    return page
  }

  private async syncInboxHistory(accountId: string, token: string): Promise<void> {
    const startHistoryId = this.cache?.getHistoryId(accountId, 'inbox')
    if (!startHistoryId || !this.cache) return
    let pageToken = ''
    let latestHistoryId = startHistoryId
    const threadIds = new Set<string>()
    do {
      const params = new URLSearchParams({ startHistoryId, maxResults: '500' })
      if (pageToken) params.set('pageToken', pageToken)
      const page = await this.request<{ history?: GmailHistoryRecord[]; historyId?: string; nextPageToken?: string }>(token, `/history?${params}`)
      for (const record of page.history ?? []) {
        for (const message of record.messages ?? []) threadIds.add(message.threadId)
        for (const change of [...(record.messagesAdded ?? []), ...(record.messagesDeleted ?? []), ...(record.labelsAdded ?? []), ...(record.labelsRemoved ?? [])]) threadIds.add(change.message.threadId)
      }
      latestHistoryId = page.historyId ?? latestHistoryId
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
    for (const threadId of threadIds) {
      try {
        const thread = await this.request<GmailThread>(token, `/threads/${threadId}?format=full`)
        const message = threadToMessage(accountId, thread)
        const latest = thread.messages?.at(-1)
        if (message && latest?.labelIds?.includes('INBOX')) this.cache.saveChangedMessages(accountId, 'inbox', [message])
        else this.cache.removeMailboxThread(accountId, 'inbox', threadId)
      } catch { this.cache.removeMailboxThread(accountId, 'inbox', threadId) }
    }
    this.cache.setHistoryId(accountId, 'inbox', latestHistoryId)
  }

  async modifyThread(accountId: string, threadId: string, action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'important' | 'notImportant' | 'spam' | 'notSpam' | 'restore'): Promise<void> {
    const token = await this.auth.getAccessToken(accountId)
    if (action === 'trash') { await this.request(token, `/threads/${threadId}/trash`, { method: 'POST' }); this.cache?.removeThread(accountId, threadId); return }
    const changes = action === 'archive' ? { removeLabelIds: ['INBOX'] }
      : action === 'read' ? { removeLabelIds: ['UNREAD'] }
      : action === 'unread' ? { addLabelIds: ['UNREAD'] }
      : action === 'star' ? { addLabelIds: ['STARRED'] }
      : action === 'unstar' ? { removeLabelIds: ['STARRED'] }
      : action === 'important' ? { addLabelIds: ['IMPORTANT'] }
      : action === 'notImportant' ? { removeLabelIds: ['IMPORTANT'] }
      : action === 'spam' ? { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] }
      : action === 'notSpam' ? { removeLabelIds: ['SPAM'], addLabelIds: ['INBOX'] }
      : action === 'restore' ? { removeLabelIds: ['TRASH'], addLabelIds: ['INBOX'] }
      : { addLabelIds: ['UNREAD'] }
    await this.request(token, `/threads/${threadId}/modify`, { method: 'POST', body: JSON.stringify(changes) })
    if (action === 'archive') this.cache?.removeThread(accountId, threadId)
  }

  async listLabels(accountId: string): Promise<GmailLabel[]> { const token = await this.auth.getAccessToken(accountId); const result = await this.request<{ labels?: GmailLabel[] }>(token, '/labels'); return (result.labels ?? []).filter(label => label.type === 'user') }
  async modifyLabels(accountId: string, threadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void> { const token = await this.auth.getAccessToken(accountId); await this.request(token, `/threads/${threadId}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds, removeLabelIds }) }) }

  async saveDraft(accountId: string, draft: ComposeDraft, draftId?: string): Promise<string> {
    const token = await this.auth.getAccessToken(accountId)
    const payload = { message: { raw: buildRawMessage(draft), threadId: draft.threadId } }
    const result = await this.request<{ id: string }>(token, draftId ? `/drafts/${encodeURIComponent(draftId)}` : '/drafts', { method: draftId ? 'PUT' : 'POST', body: JSON.stringify(payload) })
    this.cache?.saveDraft(accountId, result.id, result.id, draft)
    return result.id
  }

  async deleteDraft(accountId: string, draftId: string): Promise<void> {
    const token = await this.auth.getAccessToken(accountId)
    await this.request(token, `/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' })
    this.cache?.deleteDraft(accountId, draftId)
  }

  async send(accountId: string, draft: ComposeDraft): Promise<void> {
    const token = await this.auth.getAccessToken(accountId)
    await this.request(token, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: buildRawMessage(draft), threadId: draft.threadId }) })
  }

  async getAttachment(accountId: string, messageId: string, attachmentId: string): Promise<Buffer> {
    const token = await this.auth.getAccessToken(accountId)
    const payload = await this.request<{ data: string }>(token, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
    return Buffer.from(payload.data, 'base64url')
  }

  async getVisualBody(accountId: string, messageId: string): Promise<string | undefined> {
    const token = await this.auth.getAccessToken(accountId)
    const message = await this.request<GmailMessage>(token, `/messages/${encodeURIComponent(messageId)}?format=full`)
    const html = findHtml(message.payload)
    if (!html) return undefined
    const inlineParts = this.collectInlineParts(message.payload)
    let hydrated = html
    for (const part of inlineParts) {
      const contentId = part.headers?.find(item => item.name.toLowerCase() === 'content-id')?.value.replace(/[<>]/g, '')
      if (!contentId) continue
      let data: Buffer<ArrayBufferLike> | undefined = part.body?.data ? Buffer.from(part.body.data, 'base64url') : undefined
      if (!data && part.body?.attachmentId) data = await this.getAttachment(accountId, messageId, part.body.attachmentId)
      if (!data || data.byteLength > 8 * 1024 * 1024) continue
      const source = `data:${part.mimeType ?? 'application/octet-stream'};base64,${data.toString('base64')}`
      hydrated = hydrated.replaceAll(`cid:${contentId}`, source)
    }
    return hydrated
  }

  private collectInlineParts(part?: GmailPart): GmailPart[] {
    if (!part) return []
    const own = part.mimeType?.startsWith('image/') && part.headers?.some(item => item.name.toLowerCase() === 'content-id') ? [part] : []
    return [...own, ...(part.parts ?? []).flatMap(child => this.collectInlineParts(child))]
  }

  private async request<T = unknown>(token: string, path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers } })
    if (!response.ok) throw new Error(`Gmail API request failed (${response.status}).`)
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }
}
