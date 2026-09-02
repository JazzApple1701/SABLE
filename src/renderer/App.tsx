import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Archive, ArrowLeft, ChevronDown, ChevronRight, Download, ExternalLink, FilePenLine, FileText, Forward, Inbox, Menu, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Paperclip, PenLine, Reply, ReplyAll, RotateCcw, Search, Send, Settings, ShieldAlert, Star, Sun, Tag, Trash2, X, type LucideIcon } from 'lucide-react'
import type { AccountTheme, Attachment, AttachmentPreview, ComposeAttachment, ComposeDraft, ContactProfile, DesktopPreferences, GmailLabel, GmailMailbox, ImportedFont, MailAccount, MailMessage, ThemePalette, ThreadMessage } from '../shared/models'
import { accounts as sampleAccounts, messages as initialMessages } from './sample-data'
import { buildEmailDocument } from './email-html'
import sableIcon from './sable-icon.png'

type Folder = GmailMailbox
type MailboxLayout = 'combined' | 'accounts'
const mailboxes: Array<{ id: Folder; name: string; icon: LucideIcon }> = [
  { id: 'inbox', name: 'Inbox', icon: Inbox }, { id: 'starred', name: 'Starred', icon: Star },
  { id: 'important', name: 'Important', icon: Tag }, { id: 'drafts', name: 'Drafts', icon: FilePenLine },
  { id: 'spam', name: 'Spam', icon: ShieldAlert }, { id: 'trash', name: 'Deleted', icon: Trash2 }
]
type FontPreset = 'editorial' | 'fashion' | 'contemporary' | 'futuristic' | 'swiss' | 'custom'
interface FontSettings { preset: FontPreset; uiFont: string; readingFont: string; uiFontSize: number; readingFontSize: number }
interface ComposeSeed { accountId?: string; to?: string[]; cc?: string[]; bcc?: string[]; subject?: string; body?: string; threadId?: string; inReplyTo?: string }
interface RecipientSuggestion { name: string; email: string; initials: string; avatarDataUrl?: string; frequency: number }
const fontPresets: Array<{ id: Exclude<FontPreset, 'custom'>; name: string; detail: string; ui: string; reading: string }> = [
  { id: 'editorial', name: 'Editorial luxury', detail: 'Refined and literary', ui: 'Manrope', reading: 'Georgia' },
  { id: 'fashion', name: 'High fashion', detail: 'Dramatic and elegant', ui: 'Inter Variable', reading: 'Bodoni MT' },
  { id: 'contemporary', name: 'Quiet contemporary', detail: 'Soft and personal', ui: 'Segoe UI', reading: 'Garamond' },
  { id: 'futuristic', name: 'Futuristic minimalist', detail: 'Technical and architectural', ui: 'Bahnschrift', reading: 'Bahnschrift' },
  { id: 'swiss', name: 'Swiss minimal', detail: 'Neutral and highly legible', ui: 'Arial', reading: 'Arial' }
]
const defaultFontSettings: FontSettings = { preset: 'editorial', uiFont: 'Manrope', readingFont: 'Georgia', uiFontSize: 13, readingFontSize: 16 }
const standardFonts = ['Arial', 'Bahnschrift', 'Bodoni MT', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Garamond', 'Georgia', 'Inter Variable', 'Manrope', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana']
const themePresets: Record<string, { light: ThemePalette; dark: ThemePalette }> = {
  SABLE: { light: { accent: '#050505', background: '#f7f7f7', surface: '#ffffff', text: '#050505', muted: '#6b6b6b', border: '#d8d8d8' }, dark: { accent: '#ffffff', background: '#000000', surface: '#0c0c0c', text: '#ffffff', muted: '#a1a1a1', border: '#292929' } },
  Crimson: { light: { accent: '#9b1737', background: '#fff8f9', surface: '#ffffff', text: '#24070e', muted: '#76545d', border: '#e8ccd3' }, dark: { accent: '#ff557c', background: '#100207', surface: '#19070d', text: '#fff4f6', muted: '#c18b99', border: '#4a1725' } },
  Ice: { light: { accent: '#176d91', background: '#f4fbff', surface: '#ffffff', text: '#071b24', muted: '#55747f', border: '#c9e2ec' }, dark: { accent: '#74d6ff', background: '#020b10', surface: '#07141a', text: '#effbff', muted: '#87aab8', border: '#183b49' } },
  Violet: { light: { accent: '#6e3bad', background: '#fbf8ff', surface: '#ffffff', text: '#190c29', muted: '#71627f', border: '#ddd1ea' }, dark: { accent: '#c296ff', background: '#09030f', surface: '#11081a', text: '#faf3ff', muted: '#aa90bd', border: '#38234a' } },
  Terminal: { light: { accent: '#08783e', background: '#f4fff8', surface: '#ffffff', text: '#042213', muted: '#4e7460', border: '#c5e3d2' }, dark: { accent: '#4dff91', background: '#000704', surface: '#031009', text: '#dffff0', muted: '#79a88d', border: '#15452a' } }
}
const createAccountTheme = (accountId: string, preset = 'SABLE'): AccountTheme => ({ accountId, preset, avatarStyle: 'circle', ...themePresets[preset] })
const generalThemeId = '__general__'
const loadGeneralTheme = (): AccountTheme => {
  try { return { ...createAccountTheme(generalThemeId), ...JSON.parse(localStorage.getItem('general-mailbox-theme') ?? '{}'), accountId: generalThemeId } }
  catch { return createAccountTheme(generalThemeId) }
}
const loadFontSettings = (): FontSettings => {
  try { return { ...defaultFontSettings, ...JSON.parse(localStorage.getItem('font-settings') ?? '{}') } }
  catch { return defaultFontSettings }
}
const fontStack = (font: string, fallback: string): string => `"${font.replace(/["\\]/g, '')}",${fallback}`
const matchesSearch = (message: MailMessage, query: string): boolean => {
  const terms = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
  return terms.every(raw => {
    const term = raw.replace(/^"|"$/g, '')
    const [operator, ...rest] = term.split(':'); const value = rest.join(':').toLowerCase()
    if (rest.length) {
      if (operator === 'from' || operator === 'sender') return `${message.sender.name} ${message.sender.email}`.toLowerCase().includes(value)
      if (operator === 'account') return message.accountId.toLowerCase().includes(value)
      if (operator === 'after') return Date.parse(message.receivedAt) >= Date.parse(value)
      if (operator === 'before') return Date.parse(message.receivedAt) <= Date.parse(value)
      if (operator === 'has' && value === 'attachment') return Boolean(message.attachments?.length)
      if (operator === 'is' && value === 'unread') return message.unread
      if (operator === 'is' && value === 'read') return !message.unread
      if (operator === 'is' && value === 'starred') return message.starred
    }
    return `${message.sender.name} ${message.sender.email} ${message.subject} ${message.preview}`.toLowerCase().includes(term.toLowerCase())
  })
}
const iconSize = 17
const avatarRadius = (style?: AccountTheme['avatarStyle']) => style === 'square' ? '3px' : style === 'rounded' ? '9px' : '50%'
const parseRecipient = (value: string): Omit<RecipientSuggestion, 'frequency'> | undefined => {
  const match = value.trim().match(/^(.*?)\s*<([^>]+)>$/)
  const email = (match?.[2] ?? value).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined
  const name = (match?.[1] || email.split('@')[0]).replace(/^"|"$/g, '').trim()
  return { name, email, initials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || email[0].toUpperCase() }
}

export function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>(sampleAccounts)
  const [selectedId, setSelectedId] = useState(initialMessages[0].id)
  const [accountId, setAccountId] = useState<string>('all')
  const [folder, setFolder] = useState<Folder>('inbox')
  const [mailboxLayout, setMailboxLayout] = useState<MailboxLayout>(() => localStorage.getItem('mailbox-layout') === 'accounts' ? 'accounts' : 'combined')
  const [accountsExpanded, setAccountsExpanded] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true')
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.min(360, Math.max(190, Number(localStorage.getItem('sidebar-width')) || 228)))
  const [sidebarDragging, setSidebarDragging] = useState(false)
  const [mailboxLoading, setMailboxLoading] = useState(false)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'))
  const [compose, setCompose] = useState(false)
  const [composeSeed, setComposeSeed] = useState<ComposeSeed>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [fontSettings, setFontSettings] = useState<FontSettings>(loadFontSettings)
  const [importedFonts, setImportedFonts] = useState<ImportedFont[]>([])
  const [accountThemes, setAccountThemes] = useState<Record<string, AccountTheme>>({})
  const [generalTheme, setGeneralTheme] = useState<AccountTheme>(loadGeneralTheme)
  const [pinnedMailboxes, setPinnedMailboxes] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('pinned-mailboxes') ?? '[]') } catch { return [] } })
  const [desktopPreferences, setDesktopPreferences] = useState<DesktopPreferences>({ notifications: true, launchAtStartup: false, minimizeToTray: true, backgroundSync: true, remoteImages: 'always', blockTrackers: true, cleanLinks: true, trustedSenders: [] })
  const [navOpen, setNavOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [googleClientIdConfigured, setGoogleClientIdConfigured] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false)
  const [microsoftConnectOpen, setMicrosoftConnectOpen] = useState(false)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [googleConnectError, setGoogleConnectError] = useState('')
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewTarget, setPreviewTarget] = useState<{ messageId: string; file: Attachment } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [nextPageTokens, setNextPageTokens] = useState<Record<string, string>>({})
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [labelMenuOpen, setLabelMenuOpen] = useState(false)
  const [gmailLabels, setGmailLabels] = useState<GmailLabel[]>([])
  const [providerContacts, setProviderContacts] = useState<ContactProfile[]>([])
  const googleCancelled = useRef(false)
  const liveAccountsRef = useRef<MailAccount[]>([])
  const syncInFlight = useRef(false)
  const pendingSync = useRef<{ accounts: MailAccount[]; mailbox: Folder; accountId: string } | null>(null)
  const hydratedVisuals = useRef(new Set<string>())
  const searchRef = useRef<HTMLInputElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const mailboxSelectionRef = useRef<{ accountId: string; folder: Folder }>({ accountId: 'all', folder: 'inbox' })
  const desktopPreferencesRef = useRef(desktopPreferences)
  const completedInitialSync = useRef(false)
  const knownMessageIds = useRef(new Set<string>())

  const visible = useMemo(() => messages.filter(message => {
    const accountMatch = accountId === 'all' || message.accountId === accountId
    const folderMatch = liveAccountsRef.current.length > 0 || folder === 'inbox' || (folder === 'starred' && message.starred)
    return accountMatch && folderMatch && matchesSearch(message, query)
  }), [accountId, folder, messages, query])

  const recipientSuggestions = useMemo(() => {
    const contacts = new Map<string, RecipientSuggestion>()
    const remember = (value: string, preferredName?: string, avatarDataUrl?: string) => {
      const parsed = parseRecipient(value)
      if (!parsed) return
      const current = contacts.get(parsed.email)
      const name = preferredName?.trim() || current?.name || parsed.name
      contacts.set(parsed.email, { name, email: parsed.email, initials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(), avatarDataUrl: avatarDataUrl || current?.avatarDataUrl, frequency: (current?.frequency ?? 0) + 1 })
    }
    mailAccounts.forEach(account => remember(account.email, account.name, account.avatarDataUrl))
    providerContacts.forEach(contact => {
      const parsed = parseRecipient(contact.email)
      if (!parsed) return
      const name = contact.name || parsed.name
      contacts.set(parsed.email, { name, email: parsed.email, initials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(), avatarDataUrl: contact.avatarDataUrl, frequency: 20 })
    })
    messages.forEach(message => {
      remember(message.sender.email, message.sender.name)
      message.recipients.forEach(recipient => remember(recipient))
      message.threadMessages?.forEach(item => { remember(item.sender.email, item.sender.name); item.recipients.forEach(recipient => remember(recipient)); item.cc.forEach(recipient => remember(recipient)) })
    })
    return [...contacts.values()].sort((a, b) => b.frequency - a.frequency || a.name.localeCompare(b.name))
  }, [mailAccounts, messages, providerContacts])

  const selected = messages.find(message => message.id === selectedId && visible.some(item => item.id === message.id))
  const selectedAccount = selected ? mailAccounts.find(account => account.id === selected.accountId) : undefined

  const syncGmail = async (accounts = liveAccountsRef.current, mailbox = mailboxSelectionRef.current.folder, selectedAccountId = mailboxSelectionRef.current.accountId) => {
    if (!accounts.length) return
    if (syncInFlight.current) { pendingSync.current = { accounts, mailbox, accountId: selectedAccountId }; return }
    const targetAccounts = selectedAccountId === 'all' ? accounts : accounts.filter(account => account.id === selectedAccountId)
    if (!targetAccounts.length) return
    syncInFlight.current = true
    setSyncing(true); setSyncError('')
    try {
      const inboxes = await Promise.all(targetAccounts.map(account => account.provider === 'outlook' ? window.postbird.outlook.listMailbox(account.id, mailbox) : window.postbird.gmail.listMailbox(account.id, mailbox)))
      const nextMessages = inboxes.flatMap(page => page.messages)
      const arrivals = nextMessages.filter(message => message.unread && !knownMessageIds.current.has(`${message.accountId}:${message.id}`))
      if (completedInitialSync.current && arrivals.length && desktopPreferencesRef.current.notifications) void window.postbird.desktop.notify(arrivals.length === 1 ? arrivals[0].sender.name : `${arrivals.length} new messages`, arrivals.length === 1 ? arrivals[0].subject : `New mail arrived in SABLE.`)
      for (const message of nextMessages) knownMessageIds.current.add(`${message.accountId}:${message.id}`)
      completedInitialSync.current = true
      setNextPageTokens(Object.fromEntries(targetAccounts.map((account, index) => [account.id, inboxes[index].nextPageToken ?? ''])))
      const selectionStillCurrent = mailboxSelectionRef.current.accountId === selectedAccountId && mailboxSelectionRef.current.folder === mailbox
      if (selectionStillCurrent) { setMessages(nextMessages); setMailboxLoading(false) }
      if (mailbox === 'inbox') setMailAccounts(current => current.map(account => ({ ...account, unread: nextMessages.filter(message => message.accountId === account.id && message.unread).length })))
      setLastSynced(new Date())
    } catch (reason) { setSyncError(reason instanceof Error ? reason.message : 'Inbox sync failed.') }
    finally {
      syncInFlight.current = false; setSyncing(false)
      if (mailboxSelectionRef.current.accountId === selectedAccountId && mailboxSelectionRef.current.folder === mailbox) setMailboxLoading(false)
      const pending = pendingSync.current
      if (pending) { pendingSync.current = null; void syncGmail(pending.accounts, pending.mailbox, pending.accountId) }
    }
  }

  useEffect(() => {
    if (!window.postbird?.accounts) return
    void window.postbird.accounts.status().then(status => {
      setGoogleClientIdConfigured(status.googleClientIdConfigured)
      setGoogleConfigured(status.googleClientIdConfigured && status.googleClientSecretConfigured)
      setMicrosoftConfigured(status.microsoftClientIdConfigured)
      if (!status.accounts.length) { if (localStorage.getItem('onboarding-complete') !== 'true') setOnboardingOpen(true); return }
      liveAccountsRef.current = status.accounts
      setMessages([])
      setSelectedId('')
      setMailAccounts(status.accounts)
      void syncGmail(status.accounts)
    })
    const interval = window.setInterval(() => { if (desktopPreferencesRef.current.backgroundSync) void syncGmail() }, 60_000)
    const onVisibility = () => { if (document.visibilityState === 'visible') void syncGmail() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font', fontStack(fontSettings.uiFont, 'Inter,system-ui,sans-serif'))
    document.documentElement.style.setProperty('--reading-font', fontStack(fontSettings.readingFont, "Georgia,'Times New Roman',serif"))
    document.documentElement.style.setProperty('--ui-scale', String(fontSettings.uiFontSize / 10))
    document.documentElement.style.setProperty('--reading-size', `${fontSettings.readingFontSize}px`)
    localStorage.setItem('font-settings', JSON.stringify(fontSettings))
  }, [fontSettings])

  useEffect(() => { if (window.postbird?.appearance) void window.postbird.appearance.listImportedFonts().then(setImportedFonts) }, [])
  useEffect(() => {
    const element = document.createElement('style'); element.dataset.sableFonts = 'imported'
    element.textContent = importedFonts.map(font => `@font-face{font-family:${JSON.stringify(font.name)};src:url(${JSON.stringify(font.dataUrl)})}`).join('\n')
    document.head.querySelector('style[data-sable-fonts="imported"]')?.remove(); document.head.appendChild(element)
    const newest = importedFonts.at(-1)
    if (newest && localStorage.getItem('last-auto-applied-font') !== newest.id) { setFontSettings(current => ({ ...current, preset: 'custom', readingFont: newest.name })); localStorage.setItem('last-auto-applied-font', newest.id) }
    return () => element.remove()
  }, [importedFonts])

  useEffect(() => { localStorage.setItem('mailbox-layout', mailboxLayout) }, [mailboxLayout])
  useEffect(() => { localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed)) }, [sidebarCollapsed])
  useEffect(() => { if (!sidebarDragging && sidebarWidth >= 190) localStorage.setItem('sidebar-width', String(sidebarWidth)) }, [sidebarDragging, sidebarWidth])

  useEffect(() => { if (window.postbird?.appearance) void window.postbird.appearance.listThemes().then(items => setAccountThemes(Object.fromEntries(items.map(item => [item.accountId, item])))) }, [])

  useEffect(() => { if (window.postbird?.desktop) void window.postbird.desktop.getPreferences().then(preferences => { desktopPreferencesRef.current = preferences; setDesktopPreferences(preferences) }) }, [])

  const contactAccountKey = mailAccounts.filter(account => account.id.startsWith('gmail:') || account.id.startsWith('outlook:')).map(account => account.id).sort().join('|')
  useEffect(() => {
    const accounts = mailAccounts.filter(account => account.id.startsWith('gmail:') || account.id.startsWith('outlook:'))
    if (!accounts.length || !window.postbird?.accounts?.listContacts) { setProviderContacts([]); return }
    let cancelled = false
    void Promise.all(accounts.map(account => window.postbird.accounts.listContacts(account.id))).then(groups => { if (!cancelled) setProviderContacts(groups.flat()) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [contactAccountKey])

  useEffect(() => {
    const palette = accountId === 'all' ? generalTheme[theme] : accountThemes[accountId]?.[theme]
    const root = document.documentElement
    const values: Record<string, string | undefined> = { '--bg': palette?.background, '--panel': palette?.surface, '--paper': palette?.surface, '--accent': palette?.accent, '--muted': palette?.muted, '--line': palette?.border }
    for (const [name, value] of Object.entries(values)) value ? root.style.setProperty(name, value) : root.style.removeProperty(name)
    palette ? root.style.setProperty('color', palette.text) : root.style.removeProperty('color')
  }, [accountId, accountThemes, generalTheme, theme])

  const saveAccountTheme = (next: AccountTheme) => {
    if (next.accountId === generalThemeId) { setGeneralTheme(next); localStorage.setItem('general-mailbox-theme', JSON.stringify(next)); return }
    setAccountThemes(current => ({ ...current, [next.accountId]: next })); void window.postbird.appearance.saveTheme(next)
  }
  const togglePinnedMailbox = (id: string) => setPinnedMailboxes(current => { const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]; localStorage.setItem('pinned-mailboxes', JSON.stringify(next)); return next })
  const chooseAccountAvatar = async (id: string) => { const account = mailAccounts.find(item => item.id === id); if (!account) return; const avatarDataUrl = await window.postbird.appearance.chooseAccountAvatar(id, account.email); if (!avatarDataUrl) return; const update = (item: MailAccount) => item.id === id ? { ...item, avatarDataUrl } : item; setMailAccounts(current => current.map(update)); liveAccountsRef.current = liveAccountsRef.current.map(update) }
  const saveDesktopPreferences = (next: DesktopPreferences) => { desktopPreferencesRef.current = next; setDesktopPreferences(next); void window.postbird.desktop.savePreferences(next) }

  useEffect(() => {
    if (!selected?.accountId.startsWith('gmail:') || !selected.bodyHtml || hydratedVisuals.current.has(selected.id)) return
    hydratedVisuals.current.add(selected.id)
    void window.postbird.gmail.getVisualBody(selected.accountId, selected.id).then(bodyHtml => {
      if (bodyHtml) setMessages(current => current.map(message => message.id === selected.id ? { ...message, bodyHtml } : message))
    }).catch(() => hydratedVisuals.current.delete(selected.id))
  }, [selected?.accountId, selected?.bodyHtml, selected?.id])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key.toLowerCase() === 'c' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) { setComposeSeed({}); setCompose(true) }
      if (event.key === 'Escape') { setCompose(false); setSettingsOpen(false); setConnectOpen(false); setNavOpen(false); setAttachmentPreview(null); setPreviewError('') }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const openMessage = (message: MailMessage) => {
    setSelectedId(message.id)
    setMessages(current => current.map(item => item.id === message.id ? { ...item, unread: false } : item))
    if (message.unread) message.accountId.startsWith('gmail:') ? void window.postbird.gmail.modifyThread(message.accountId, message.threadId, 'read').catch(() => undefined) : void window.postbird.outlook.modifyMessage(message.accountId, message.id, 'read').catch(() => undefined)
  }

  const chooseMailbox = (nextAccount: string, nextFolder: Folder = 'inbox') => {
    mailboxSelectionRef.current = { accountId: nextAccount, folder: nextFolder }
    setAccountId(nextAccount); setFolder(nextFolder); setSelectedId(''); setNavOpen(false)
    if (liveAccountsRef.current.length) { setMessages([]); setMailboxLoading(true); void syncGmail(liveAccountsRef.current, nextFolder, nextAccount) }
  }

  const toggleStar = (id: string) => {
    const message = messages.find(item => item.id === id)
    if (!message) return
    setMessages(current => current.map(item => item.id === id ? { ...item, starred: !item.starred } : item))
    const update = message.accountId.startsWith('gmail:') ? window.postbird.gmail.modifyThread(message.accountId, message.threadId, message.starred ? 'unstar' : 'star') : window.postbird.outlook.modifyMessage(message.accountId, message.id, message.starred ? 'unstar' : 'star')
    void update.catch(() => setMessages(current => current.map(item => item.id === id ? { ...item, starred: message.starred } : item)))
  }

  const bulkModify = async (action: Parameters<typeof window.postbird.gmail.modifyThread>[2]) => {
    const targets = messages.filter(message => selectedMessageIds.has(message.id))
    await Promise.all(targets.map(message => message.accountId.startsWith('gmail:') ? window.postbird.gmail.modifyThread(message.accountId, message.threadId, action) : action === 'archive' ? window.postbird.outlook.modifyMessage(message.accountId, message.id, 'trash') : window.postbird.outlook.modifyMessage(message.accountId, message.id, action)))
    if (['archive', 'trash', 'spam'].includes(action)) setMessages(current => current.filter(message => !selectedMessageIds.has(message.id)))
    else setMessages(current => current.map(message => !selectedMessageIds.has(message.id) ? message : action === 'read' ? { ...message, unread: false } : action === 'unread' ? { ...message, unread: true } : action === 'star' ? { ...message, starred: true } : message))
    setSelectedMessageIds(new Set())
  }

  const connectGoogle = async (clientId?: string, clientSecret?: string) => {
    const result = await window.postbird.accounts.connectGoogle(clientId, clientSecret)
    setGoogleClientIdConfigured(true)
    setGoogleConfigured(true)
    liveAccountsRef.current = [...liveAccountsRef.current.filter(account => account.id !== result.account.id), result.account]
    setMailAccounts(liveAccountsRef.current)
    const inbox = await window.postbird.gmail.listMailbox(result.account.id, 'inbox')
    setMessages(inbox.messages)
    setNextPageTokens({ [result.account.id]: inbox.nextPageToken ?? '' })
    setSelectedId(inbox.messages[0]?.id ?? '')
    setLastSynced(new Date())
    setAccountId(result.account.id)
    setConnectOpen(false)
  }

  const startGoogleLogin = async () => {
    if (!googleConfigured) { setConnectOpen(true); return }
    googleCancelled.current = false; setGoogleConnecting(true); setGoogleConnectError('')
    try { await connectGoogle() }
    catch (reason) { if (!googleCancelled.current) setGoogleConnectError(reason instanceof Error ? reason.message : 'Could not open Google login.') }
    finally { setGoogleConnecting(false) }
  }

  const cancelGoogleLogin = async () => {
    googleCancelled.current = true
    await window.postbird.accounts.cancelGoogleLogin()
    setGoogleConnecting(false)
  }

  const connectMicrosoft = async (clientId?: string) => {
    const result = await window.postbird.accounts.connectMicrosoft(clientId)
    setMicrosoftConfigured(true); liveAccountsRef.current = [...liveAccountsRef.current.filter(account => account.id !== result.account.id), result.account]
    setMailAccounts(liveAccountsRef.current); setMicrosoftConnectOpen(false); chooseMailbox(result.account.id, 'inbox')
  }

  const importGoogleOAuthJson = async () => { const result = await window.postbird.accounts.importGoogleOAuthJson(); if (result.configured) { setGoogleClientIdConfigured(true); setGoogleConfigured(true) } return result }

  const finishOnboarding = () => { localStorage.setItem('onboarding-complete', 'true'); setOnboardingOpen(false) }
  const toggleSidebar = () => window.innerWidth <= 800 ? setNavOpen(true) : setSidebarCollapsed(value => !value)
  const resizeSidebar = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 800) return
    event.currentTarget.setPointerCapture(event.pointerId)
    let lastX = event.clientX
    setSidebarDragging(true)
    const move = (pointer: PointerEvent) => { lastX = pointer.clientX; setSidebarCollapsed(false); setSidebarWidth(Math.min(360, Math.max(64, pointer.clientX))) }
    const stop = () => { setSidebarDragging(false); if (lastX < 150) setSidebarCollapsed(true); else { setSidebarCollapsed(false); setSidebarWidth(Math.min(360, Math.max(190, lastX))) }; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop)
  }

  const openAttachmentPreview = async (file: Attachment, messageId = selected?.id) => {
    if (!selected) return
    if (!selected.accountId.startsWith('gmail:') && !selected.accountId.startsWith('outlook:')) { setPreviewError('Preview becomes available for attachments from a connected account.'); setAttachmentPreview(null); return }
    if (!messageId) return
    setPreviewLoading(true); setPreviewError(''); setAttachmentPreview(null)
    setPreviewTarget({ messageId, file })
    try { setAttachmentPreview(selected.accountId.startsWith('gmail:') ? await window.postbird.gmail.previewAttachment(selected.accountId, messageId, file.id, file.name, file.mimeType) : await window.postbird.outlook.previewAttachment(selected.accountId, messageId, file.id, file.name, file.mimeType)) }
    catch (reason) { setPreviewError(reason instanceof Error ? reason.message : 'This attachment could not be previewed.') }
    finally { setPreviewLoading(false) }
  }

  const disconnectAccount = async (id: string) => {
    await window.postbird.accounts.disconnect(id)
    setMailAccounts(current => current.filter(account => account.id !== id))
    liveAccountsRef.current = liveAccountsRef.current.filter(account => account.id !== id)
    setMessages(current => current.filter(message => message.accountId !== id))
    setAccountId('all')
  }

  const modifySelected = async (action: 'archive' | 'trash') => {
    if (!selected) return
    if (selected.accountId.startsWith('gmail:')) await window.postbird.gmail.modifyThread(selected.accountId, selected.threadId, action)
    else await window.postbird.outlook.modifyMessage(selected.accountId, selected.id, action === 'archive' ? 'trash' : action)
    setMessages(current => current.filter(message => message.threadId !== selected.threadId || message.accountId !== selected.accountId))
    setSelectedId('')
  }

  const openLabelMenu = async () => { if (!selected?.accountId.startsWith('gmail:')) return; setLabelMenuOpen(value => !value); if (!gmailLabels.length) setGmailLabels(await window.postbird.gmail.listLabels(selected.accountId)) }
  const toggleSelectedLabel = async (label: GmailLabel) => { if (!selected?.accountId.startsWith('gmail:')) return; const assigned = selected.labels?.includes(label.id) ?? false; await window.postbird.gmail.modifyLabels(selected.accountId, selected.threadId, assigned ? [] : [label.id], assigned ? [label.id] : []); setMessages(current => current.map(message => message.id !== selected.id ? message : { ...message, labels: assigned ? message.labels?.filter(id => id !== label.id) : [...(message.labels ?? []), label.id] })) }

  const sendMessage = async (accountId: string, draft: ComposeDraft) => {
    if (accountId.startsWith('gmail:')) await window.postbird.gmail.send(accountId, draft)
    else if (accountId.startsWith('outlook:')) await window.postbird.outlook.send(accountId, draft)
    else throw new Error('Connect an email account before sending real mail.')
  }

  const loadMoreMessages = async () => {
    const accounts = accountId === 'all' ? liveAccountsRef.current : liveAccountsRef.current.filter(account => account.id === accountId)
    const pending = accounts.filter(account => nextPageTokens[account.id])
    if (!pending.length || loadingMore) return
    setLoadingMore(true); setSyncError('')
    try {
      const pages = await Promise.all(pending.map(account => account.provider === 'outlook' ? window.postbird.outlook.listMailbox(account.id, folder, '', nextPageTokens[account.id]) : window.postbird.gmail.listMailbox(account.id, folder, '', nextPageTokens[account.id])))
      setMessages(current => {
        const known = new Set(current.map(message => `${message.accountId}:${message.threadId}`))
        const added = pages.flatMap(page => page.messages).filter(message => !known.has(`${message.accountId}:${message.threadId}`))
        return [...current, ...added].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
      })
      setNextPageTokens(current => ({ ...current, ...Object.fromEntries(pending.map((account, index) => [account.id, pages[index].nextPageToken ?? ''])) }))
    } catch (reason) { setSyncError(reason instanceof Error ? reason.message : 'Could not load more mail.') }
    finally { setLoadingMore(false) }
  }

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || loadingMore || !liveAccountsRef.current.length) return
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) void loadMoreMessages() }, { rootMargin: '240px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [accountId, folder, loadingMore, nextPageTokens])

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarDragging ? 'sidebar-dragging' : ''} ${sidebarDragging && sidebarWidth < 185 && !sidebarCollapsed ? 'sidebar-narrow' : ''}`} style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
    <header className="titlebar" aria-label="Application toolbar">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Menu size={iconSize}/></button>
      <button className="wordmark brand-sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleSidebar}><span className="logo-mark" aria-hidden="true"><img src={sableIcon} alt=""/><span className="brand-panel-icon">{sidebarCollapsed ? <PanelLeftOpen size={15}/> : <PanelLeftClose size={15}/>}</span></span><span>SABLE</span></button>
      <div className="search-wrap"><Search size={16}/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} aria-label="Search mail" placeholder="Search mail"/><kbd>Ctrl K</kbd></div>
      <button className="icon-button" aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={iconSize}/> : <Sun size={iconSize}/>}</button>
    </header>

    <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Mailboxes">
      <div className="sidebar-resize-handle" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" onPointerDown={resizeSidebar}/>
      <button className="icon-button close-nav" aria-label="Close navigation" onClick={() => setNavOpen(false)}><X size={18}/></button>
      <button className="compose-button" title="New message" onClick={() => { setComposeSeed({}); setCompose(true); setNavOpen(false) }}><PenLine size={17}/><span>New message</span></button>
      <nav>
        {mailboxLayout === 'combined' && <><p className="nav-label">Unified mailboxes</p>{mailboxes.map(mailbox => { const Icon = mailbox.icon; return <button key={mailbox.id} title={mailbox.name} className={`nav-item ${accountId === 'all' && folder === mailbox.id ? 'active' : ''}`} onClick={() => chooseMailbox('all', mailbox.id)}><Icon size={iconSize}/><span>{mailbox.name}</span>{mailbox.id === 'inbox' && <b>{mailAccounts.reduce((sum, account) => sum + account.unread, 0)}</b>}</button>})}</>}
        {pinnedMailboxes.length > 0 && <div className="pinned-mailboxes"><p className="nav-label">Pinned</p>{pinnedMailboxes.map(pin => { const [pinnedAccountId, pinnedFolder] = pin.split('|') as [string, Folder]; const pinnedAccount = mailAccounts.find(item => item.id === pinnedAccountId); const mailbox = mailboxes.find(item => item.id === pinnedFolder); if (!pinnedAccount || !mailbox) return null; const Icon = mailbox.icon; return <div className="mailbox-nav-row" key={pin}><button title={`${mailbox.name} · ${pinnedAccount.name}`} className={`nav-item ${accountId === pinnedAccountId && folder === pinnedFolder ? 'active' : ''}`} onClick={() => chooseMailbox(pinnedAccountId, pinnedFolder)}><Icon size={14}/><span><strong>{mailbox.name}</strong><small>{pinnedAccount.name}</small></span>{pinnedFolder === 'inbox' && <b>{pinnedAccount.unread}</b>}</button><button className="mailbox-pin on" aria-label={`Unpin ${pinnedAccount.name} ${mailbox.name}`} aria-pressed="true" onClick={() => togglePinnedMailbox(pin)}><Star size={12}/></button></div>})}</div>}
        <button className="accounts-toggle" title="Accounts" aria-expanded={accountsExpanded} onClick={() => setAccountsExpanded(value => !value)}><span>Accounts</span>{accountsExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
        {accountsExpanded && <div className="accounts-tree">{mailAccounts.map(account => { const expanded = expandedAccounts.has(account.id); return <div className="account-group" key={account.id}>
          <div className="account-entry"><button className={`account-item ${accountId === account.id ? 'active' : ''}`} aria-expanded={expanded} onClick={() => setExpandedAccounts(current => { const next = new Set(current); expanded ? next.delete(account.id) : next.add(account.id); return next })}>
            <span className="account-dot" style={{ background: account.color, borderRadius: avatarRadius(accountThemes[account.id]?.avatarStyle) }}>{account.avatarDataUrl ? <img src={account.avatarDataUrl} alt=""/> : account.provider === 'gmail' ? 'G' : 'O'}</span>
            <span className="account-copy"><strong>{account.name}</strong><small>{account.email}</small></span>{expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>} 
          </button><button className="disconnect-button" aria-label={`Disconnect ${account.email}`} onClick={() => void disconnectAccount(account.id)}><X size={13}/></button></div>
          {expanded && <div className="account-mailboxes">{mailboxes.map(mailbox => { const Icon = mailbox.icon; const pin = `${account.id}|${mailbox.id}`; const pinned = pinnedMailboxes.includes(pin); return <div className="mailbox-nav-row" key={mailbox.id}><button title={`${mailbox.name} · ${account.name}`} className={`nav-item ${accountId === account.id && folder === mailbox.id ? 'active' : ''}`} onClick={() => chooseMailbox(account.id, mailbox.id)}><Icon size={14}/><span>{mailbox.name}</span>{mailbox.id === 'inbox' && <b>{account.unread}</b>}</button><button className={`mailbox-pin ${pinned ? 'on' : ''}`} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${account.name} ${mailbox.name}`} aria-pressed={pinned} onClick={() => togglePinnedMailbox(pin)}><Star size={12}/></button></div>})}</div>}
        </div>})}</div>}
        {googleConnectError && <p className="sidebar-connect-error" role="alert">{googleConnectError}</p>}
      </nav>
      <div className={`sync-status ${syncError ? 'failed' : ''}`}><span></span><div><strong>{syncError ? 'Sync needs attention' : syncing ? 'Checking for mail…' : 'All caught up'}</strong><small>{syncError ? 'Click refresh to retry' : lastSynced ? `Synced ${lastSynced.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Demo mailbox'}</small></div><button className="icon-button status-settings" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings size={16}/></button></div>
    </aside>
    {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)}/>} 

    <main className={`mail-layout ${attachmentPreview || previewLoading || previewError ? 'preview-open' : ''}`}>
      <section className={`message-list ${selected ? 'has-selection' : ''}`} aria-label="Message list">
        <div className="pane-heading">{selectedMessageIds.size ? <div className="bulk-heading"><p>{selectedMessageIds.size} selected</p><small>Bulk actions</small></div> : <div><p>{accountId === 'all' ? `Unified ${mailboxes.find(item => item.id === folder)?.name.toLowerCase()}` : `${mailAccounts.find(a => a.id === accountId)?.name} · ${mailboxes.find(item => item.id === folder)?.name}`}</p><small>{visible.length} messages</small></div>}<div className="pane-actions">{selectedMessageIds.size ? <><button className="icon-button" aria-label="Mark selected read" onClick={() => void bulkModify('read')}><Inbox size={15}/></button><button className="icon-button" aria-label="Star selected" onClick={() => void bulkModify('star')}><Star size={15}/></button><button className="icon-button" aria-label="Archive selected" onClick={() => void bulkModify('archive')}><Archive size={15}/></button><button className="icon-button" aria-label="Delete selected" onClick={() => void bulkModify('trash')}><Trash2 size={15}/></button><button className="icon-button" aria-label="Clear selection" onClick={() => setSelectedMessageIds(new Set())}><X size={15}/></button></> : <><button className={`icon-button ${syncing ? 'spinning' : ''}`} aria-label="Refresh mailbox" disabled={syncing || !liveAccountsRef.current.length} onClick={() => void syncGmail()}><RotateCcw size={16}/></button><button className="icon-button" aria-label="More mailbox options"><MoreHorizontal size={18}/></button></>}</div></div>
        <div className="message-scroll" role="listbox" aria-label="Emails">
          {visible.map(message => { const account = mailAccounts.find(item => item.id === message.accountId)!; return <div className="message-row-wrap" key={message.id}><button className={`bulk-check ${selectedMessageIds.has(message.id) ? 'checked' : ''}`} aria-label={`${selectedMessageIds.has(message.id) ? 'Deselect' : 'Select'} ${message.subject}`} aria-pressed={selectedMessageIds.has(message.id)} onClick={() => setSelectedMessageIds(current => { const next = new Set(current); next.has(message.id) ? next.delete(message.id) : next.add(message.id); return next })}>{selectedMessageIds.has(message.id) ? '✓' : ''}</button><button role="option" aria-selected={selected?.id === message.id} className={`message-row ${message.unread ? 'unread' : ''} ${selected?.id === message.id ? 'selected' : ''}`} onClick={() => openMessage(message)}>
            <span className="avatar" style={{ '--avatar': account.color, borderRadius: avatarRadius(accountThemes[account.id]?.avatarStyle) } as CSSProperties}>{message.sender.initials}</span>
            <span className="message-copy"><span className="sender-line"><strong>{message.sender.name}</strong><time dateTime={message.receivedAt}>{message.timeLabel}</time></span><span className="subject-line">{message.subject}</span><span className="preview">{message.preview}</span><span className="message-meta"><i style={{ background: account.color }}/>{account.name}{message.attachments && <><Paperclip size={12}/>{message.attachments.length}</>}</span></span>
          </button></div>})}
          {(accountId === 'all' ? liveAccountsRef.current.some(account => nextPageTokens[account.id]) : Boolean(nextPageTokens[accountId])) && <div ref={loadMoreRef} className="infinite-mail-loader"><button className="load-more-mail" disabled={loadingMore} onClick={() => void loadMoreMessages()}>{loadingMore ? 'Loading older mail…' : 'Load older mail'}</button></div>}
          {mailboxLoading ? <div className="mailbox-loading" role="status"><RotateCcw size={20}/><strong>Loading {mailboxes.find(item => item.id === folder)?.name}…</strong></div> : visible.length === 0 && <div className="empty-state"><Search size={24}/><strong>No messages found</strong><span>Try a different search or mailbox.</span></div>}
        </div>
      </section>

      <section className="reader" aria-label="Open message">
        {selected ? <>
          <div className="reader-toolbar"><button className="icon-button back-list" aria-label="Back to message list" onClick={() => setSelectedId('')}><ArrowLeft size={iconSize}/></button><div className="toolbar-group"><button className="icon-button" aria-label="Archive" onClick={() => void modifySelected('archive')}><Archive size={iconSize}/></button><button className="icon-button" aria-label="Delete" onClick={() => void modifySelected('trash')}><Trash2 size={iconSize}/></button></div><div className="toolbar-spacer"/><div className="label-menu-wrap"><button className="icon-button" aria-label="Message labels" disabled={!selected.accountId.startsWith('gmail:')} onClick={() => void openLabelMenu()}><Tag size={iconSize}/></button>{labelMenuOpen && <div className="label-menu"><strong>Labels</strong>{gmailLabels.length ? gmailLabels.map(label => <label key={label.id}><input type="checkbox" checked={selected.labels?.includes(label.id) ?? false} onChange={() => void toggleSelectedLabel(label)}/><span>{label.name}</span></label>) : <small>No custom Gmail labels</small>}</div>}</div><button className="icon-button" aria-label="More message options"><MoreHorizontal size={iconSize}/></button></div>
          <article className="message-content">
            <div className="message-title-row"><div><div className="message-label"><span style={{ background: selectedAccount?.color }}/>{selectedAccount?.name}{selected.labels?.map(label => <em key={label}>{label}</em>)}</div><h1>{selected.subject}</h1></div><button className={`star-button ${selected.starred ? 'on' : ''}`} aria-label={selected.starred ? 'Unstar message' : 'Star message'} onClick={() => toggleStar(selected.id)}><Star size={19}/></button></div>
            {selected.threadMessages?.length ? <ThreadConversation thread={selected} account={selectedAccount} privacy={desktopPreferences} onPreview={(messageId, file) => void openAttachmentPreview(file, messageId)} onCompose={seed => { setComposeSeed(seed); setCompose(true) }}/> : <><div className="sender-card"><span className="avatar large" style={{ '--avatar': selectedAccount?.color } as CSSProperties}>{selected.sender.initials}</span><div><strong>{selected.sender.name}</strong><small>&lt;{selected.sender.email}&gt;</small><button>to me <ChevronDown size={12}/></button></div><time dateTime={selected.receivedAt}>{selected.timeLabel}</time></div><EmailBody key={selected.id} message={selected} privacy={desktopPreferences}/>{selected.attachments && <div className="attachments"><p>{selected.attachments.length} attachment</p>{selected.attachments.map(file => <button key={file.id} onClick={() => void openAttachmentPreview(file)}><span><FileText size={20}/></span><div><strong>{file.name}</strong><small>{file.size} · Quick view</small></div><ExternalLink size={16}/></button>)}</div>}</>}
          </article>
        </> : <div className="empty-reader"><Inbox size={28}/><strong>Select a message</strong><span>Choose an email to read it here.</span></div>}
      </section>
      {(attachmentPreview || previewLoading || previewError) && <AttachmentQuickView preview={attachmentPreview} loading={previewLoading} error={previewError} onClose={() => { setAttachmentPreview(null); setPreviewError(''); setPreviewTarget(null) }} onDownload={() => { if (!selected || !previewTarget) return; const { file, messageId } = previewTarget; selected.accountId.startsWith('gmail:') ? void window.postbird.gmail.downloadAttachment(selected.accountId, messageId, file.id, file.name) : void window.postbird.outlook.downloadAttachment(selected.accountId, messageId, file.id, file.name) }}/>} 
    </main>

    {compose && <Compose accounts={mailAccounts} suggestions={recipientSuggestions} seed={composeSeed} onSend={sendMessage} onClose={() => setCompose(false)}/>}
    {connectOpen && <ConnectAccount clientIdConfigured={googleClientIdConfigured} googleConfigured={googleConfigured} onImportJson={importGoogleOAuthJson} onConnectGoogle={connectGoogle} onClose={() => setConnectOpen(false)}/>} 
    {googleConnecting && <GoogleLoginProgress onReopen={() => window.postbird.accounts.reopenGoogleLogin()} onCancel={cancelGoogleLogin}/>} 
    {microsoftConnectOpen && <ConnectMicrosoft configured={microsoftConfigured} onConnect={connectMicrosoft} onClose={() => setMicrosoftConnectOpen(false)}/>} 
    {settingsOpen && <SettingsPanel value={fontSettings} onChange={setFontSettings} importedFonts={importedFonts} onImportedFontsChange={setImportedFonts} mailboxLayout={mailboxLayout} onMailboxLayoutChange={setMailboxLayout} accounts={mailAccounts} themes={{ ...accountThemes, [generalThemeId]: generalTheme }} colorMode={theme} onThemeChange={saveAccountTheme} onChooseAvatar={chooseAccountAvatar} desktopPreferences={desktopPreferences} onDesktopPreferencesChange={saveDesktopPreferences} googleConfigured={googleConfigured} microsoftConfigured={microsoftConfigured} onAddGoogle={() => void startGoogleLogin()} onAddMicrosoft={() => setMicrosoftConnectOpen(true)} onDisconnect={disconnectAccount} onOpenOnboarding={() => setOnboardingOpen(true)} onClose={() => setSettingsOpen(false)}/>} 
    {onboardingOpen && <Onboarding googleConfigured={googleConfigured} microsoftConfigured={microsoftConfigured} accounts={mailAccounts} onImportGoogle={importGoogleOAuthJson} onManualGoogle={() => { setOnboardingOpen(false); setConnectOpen(true) }} onConnectGoogle={() => { finishOnboarding(); void startGoogleLogin() }} onConnectMicrosoft={() => { finishOnboarding(); setMicrosoftConnectOpen(true) }} onFinish={finishOnboarding}/>} 
  </div>
}

function ThreadConversation({ thread, account, privacy, onPreview, onCompose }: { thread: MailMessage; account?: MailAccount; privacy: DesktopPreferences; onPreview: (messageId: string, file: Attachment) => void; onCompose: (seed: ComposeSeed) => void }) {
  const rows = useMemo(() => buildThreadRows(thread.threadMessages ?? []), [thread.threadMessages])
  const accountEmail = account?.email.toLowerCase() ?? ''
  return <div className="thread-conversation" aria-label={`${rows.length} messages in conversation`}>{rows.map(({ message, depth }) => <ThreadMessageCard key={message.id} message={message} depth={depth} account={account} privacy={privacy} onPreview={file => onPreview(message.id, file)} onReply={(mode) => {
    const everyone = [message.sender.email, ...message.recipients, ...message.cc].filter(address => !address.toLowerCase().includes(accountEmail))
    const unique = [...new Set(everyone)]
    const replyAllCc = unique.filter(address => address.toLowerCase() !== message.sender.email.toLowerCase())
    onCompose({ accountId: account?.id, to: mode === 'forward' ? [] : [message.sender.email], cc: mode === 'replyAll' ? replyAllCc : [], subject: mode === 'forward' ? `Fwd: ${message.subject.replace(/^(re|fwd):\s*/i, '')}` : `Re: ${message.subject.replace(/^re:\s*/i, '')}`, threadId: mode === 'forward' ? undefined : thread.threadId, inReplyTo: mode === 'forward' ? undefined : message.messageId })
  }}/>)}</div>
}

function ThreadMessageCard({ message, depth, account, privacy, onPreview, onReply }: { message: ThreadMessage; depth: number; account?: MailAccount; privacy: DesktopPreferences; onPreview: (file: Attachment) => void; onReply: (mode: 'reply' | 'replyAll' | 'forward') => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const [showQuoted, setShowQuoted] = useState(false)
  const quoteIndex = message.body.findIndex(paragraph => /^(on .+wrote:|from:|sent:|-----original message-----)/i.test(paragraph.trim()))
  const visibleBody = quoteIndex >= 0 && !showQuoted ? message.body.slice(0, quoteIndex) : message.body
  const viewMessage: MailMessage = { id: message.id, threadId: '', accountId: account?.id ?? '', sender: message.sender, recipients: message.recipients, subject: message.subject, preview: '', body: visibleBody, bodyHtml: quoteIndex < 0 || showQuoted ? message.bodyHtml : undefined, receivedAt: message.receivedAt, timeLabel: new Date(message.receivedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), unread: message.unread, starred: false, attachments: message.attachments }
  return <article className={`thread-message ${message.unread ? 'unread' : ''}`} style={{ '--thread-depth': Math.min(depth, 6), '--thread-color': account?.color ?? 'currentColor' } as CSSProperties}>
    <div className="thread-rail" aria-hidden="true"/><button className="thread-summary" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><span className="avatar" style={{ '--avatar': account?.color } as CSSProperties}>{message.sender.initials}</span><span><strong>{message.sender.name}</strong><small>{message.sender.email}</small></span><time dateTime={message.receivedAt}>{viewMessage.timeLabel}</time><ChevronDown size={14}/></button>
    {!collapsed && <div className="thread-message-content"><EmailBody message={viewMessage} privacy={privacy}/>{quoteIndex >= 0 && <button className="quoted-toggle" onClick={() => setShowQuoted(value => !value)}>{showQuoted ? 'Hide quoted content' : 'Show quoted content'}</button>}
      {message.attachments?.length ? <div className="attachments"><p>{message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}</p>{message.attachments.map(file => <button key={file.id} onClick={() => onPreview(file)}><span><FileText size={20}/></span><div><strong>{file.name}</strong><small>{file.size} · Quick view</small></div><ExternalLink size={16}/></button>)}</div> : null}
      <div className="reply-actions"><button onClick={() => onReply('reply')}><Reply size={15}/>Reply</button><button onClick={() => onReply('replyAll')}><ReplyAll size={15}/>Reply all</button><button onClick={() => onReply('forward')}><Forward size={15}/>Forward</button></div>
    </div>}
  </article>
}

function buildThreadRows(messages: ThreadMessage[]): Array<{ message: ThreadMessage; depth: number }> {
  const ordered = [...messages].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
  const byIdentifier = new Map(ordered.flatMap(message => message.messageId ? [[message.messageId, message] as const] : []))
  const children = new Map<string, ThreadMessage[]>()
  const roots: ThreadMessage[] = []
  for (const message of ordered) {
    const parentIdentifier = message.inReplyTo && byIdentifier.has(message.inReplyTo) ? message.inReplyTo : [...message.references].reverse().find(reference => byIdentifier.has(reference))
    const parent = parentIdentifier ? byIdentifier.get(parentIdentifier) : undefined
    if (!parent || parent.id === message.id) roots.push(message)
    else children.set(parent.id, [...(children.get(parent.id) ?? []), message])
  }
  const rows: Array<{ message: ThreadMessage; depth: number }> = []
  const visited = new Set<string>()
  const visit = (message: ThreadMessage, depth: number) => { if (visited.has(message.id)) return; visited.add(message.id); rows.push({ message, depth }); for (const child of children.get(message.id) ?? []) visit(child, depth + 1) }
  for (const root of roots) visit(root, 0)
  for (const message of ordered) visit(message, 0)
  return rows
}

function SettingsPanel({ value, onChange, importedFonts, onImportedFontsChange, mailboxLayout, onMailboxLayoutChange, accounts, themes, colorMode, onThemeChange, onChooseAvatar, desktopPreferences, onDesktopPreferencesChange, googleConfigured, microsoftConfigured, onAddGoogle, onAddMicrosoft, onDisconnect, onOpenOnboarding, onClose }: { value: FontSettings; onChange: (value: FontSettings) => void; importedFonts: ImportedFont[]; onImportedFontsChange: (fonts: ImportedFont[]) => void; mailboxLayout: MailboxLayout; onMailboxLayoutChange: (layout: MailboxLayout) => void; accounts: MailAccount[]; themes: Record<string, AccountTheme>; colorMode: 'light' | 'dark'; onThemeChange: (theme: AccountTheme) => void; onChooseAvatar: (accountId: string) => Promise<void>; desktopPreferences: DesktopPreferences; onDesktopPreferencesChange: (preferences: DesktopPreferences) => void; googleConfigured: boolean; microsoftConfigured: boolean; onAddGoogle: () => void; onAddMicrosoft: () => void; onDisconnect: (id: string) => Promise<void>; onOpenOnboarding: () => void; onClose: () => void }) {
  const [cacheSize, setCacheSize] = useState(0)
  const [clearingCache, setClearingCache] = useState(false)
  const [fontImportStatus, setFontImportStatus] = useState('')
  useEffect(() => { if (window.postbird?.desktop) void window.postbird.desktop.getCacheSize().then(setCacheSize) }, [])
  const selectPreset = (id: Exclude<FontPreset, 'custom'>) => {
    const preset = fontPresets.find(item => item.id === id)!
    onChange({ ...value, preset: id, uiFont: preset.ui, readingFont: preset.reading })
  }
  return <div className="settings-page-backdrop"><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <header><div><Settings size={18}/><div><h2 id="settings-title">Appearance</h2><p>Typography is stored locally on this device.</p></div></div><button className="icon-button" aria-label="Close settings" onClick={onClose}><X size={17}/></button></header>
    <div className="settings-content">
      <div className="settings-section-title"><strong>Accounts</strong><span>Connect and manage Gmail and Outlook without sharing your passwords with SABLE.</span></div>
      <div className="settings-accounts">{accounts.map(account => <div className="settings-account" key={account.id}><span className="account-dot" style={{ background: account.color }}>{account.avatarDataUrl ? <img src={account.avatarDataUrl} alt=""/> : account.provider === 'gmail' ? 'G' : 'O'}</span><span><strong>{account.name}</strong><small>{account.email} · Connected</small></span><button className="secondary-button" onClick={() => void onDisconnect(account.id)}>Disconnect</button></div>)}{!accounts.length && <div className="settings-no-accounts">No accounts connected yet.</div>}</div>
      <div className="account-connect-actions"><button className="provider-connect google" onClick={onAddGoogle}><b>G</b><span><strong>Add Gmail account</strong><small>{googleConfigured ? 'OAuth setup ready' : 'Google OAuth setup required'}</small></span></button><button className="provider-connect microsoft" onClick={onAddMicrosoft}><b>M</b><span><strong>Add Outlook account</strong><small>{microsoftConfigured ? 'OAuth setup ready' : 'Microsoft application ID required'}</small></span></button><button className="setup-guide-button" onClick={onOpenOnboarding}><ShieldAlert size={16}/><span><strong>Open setup guide</strong><small>Walk through Gmail API and account configuration</small></span></button></div>
      <div className="settings-divider"/>
      <div className="settings-section-title"><strong>Mailbox layout</strong><span>Choose whether the sidebar leads with unified mailboxes or individual accounts.</span></div>
      <div className="layout-options" role="radiogroup" aria-label="Mailbox layout">
        <button role="radio" aria-checked={mailboxLayout === 'combined'} className={mailboxLayout === 'combined' ? 'selected' : ''} onClick={() => onMailboxLayoutChange('combined')}><Inbox size={17}/><div><strong>Combined</strong><small>Unified folders first, with accounts underneath</small></div></button>
        <button role="radio" aria-checked={mailboxLayout === 'accounts'} className={mailboxLayout === 'accounts' ? 'selected' : ''} onClick={() => onMailboxLayoutChange('accounts')}><ChevronRight size={17}/><div><strong>Individual accounts</strong><small>Show only expandable account folders</small></div></button>
      </div>
      <div className="settings-divider"/>
      <div className="settings-section-title"><strong>Windows desktop</strong><span>Control notifications, background behaviour and startup.</span></div>
      <div className="desktop-settings">{([
        ['notifications', 'Native notifications', 'Notify when new unread mail arrives'], ['backgroundSync', 'Background synchronization', 'Keep checking while the window is hidden'], ['minimizeToTray', 'Keep SABLE in the tray', 'Closing the window keeps mail synchronization active'], ['launchAtStartup', 'Launch with Windows', 'Start SABLE automatically after sign-in']
      ] as Array<['notifications' | 'backgroundSync' | 'minimizeToTray' | 'launchAtStartup', string, string]>).map(([key, label, detail]) => <label key={key}><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={desktopPreferences[key]} onChange={event => onDesktopPreferencesChange({ ...desktopPreferences, [key]: event.target.checked })}/></label>)}</div>
      <div className="settings-divider"/>
      <div className="settings-section-title"><strong>Privacy protection</strong><span>Block invisible trackers and control external content.</span></div>
      <div className="privacy-settings"><label><span><strong>Remote images</strong><small>Tracking pixels remain blocked independently</small></span><select value={desktopPreferences.remoteImages} onChange={event => onDesktopPreferencesChange({ ...desktopPreferences, remoteImages: event.target.value as DesktopPreferences['remoteImages'] })}><option value="always">Load automatically</option><option value="trusted">Trusted senders only</option><option value="never">Ask every time</option></select></label><label><span><strong>Block tracking pixels</strong><small>Remove tiny and known beacon images</small></span><input type="checkbox" checked={desktopPreferences.blockTrackers} onChange={event => onDesktopPreferencesChange({ ...desktopPreferences, blockTrackers: event.target.checked })}/></label><label><span><strong>Clean tracking links</strong><small>Remove common campaign identifiers before opening</small></span><input type="checkbox" checked={desktopPreferences.cleanLinks} onChange={event => onDesktopPreferencesChange({ ...desktopPreferences, cleanLinks: event.target.checked })}/></label><label className="trusted-senders"><span><strong>Trusted senders</strong><small>Comma-separated email addresses</small></span><input value={desktopPreferences.trustedSenders.join(', ')} onChange={event => onDesktopPreferencesChange({ ...desktopPreferences, trustedSenders: event.target.value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) })}/></label></div>
      <div className="cache-controls"><span><strong>Local mail cache</strong><small>{formatBytes(cacheSize)} · OAuth tokens are not included</small></span><button className="secondary-button" disabled={clearingCache} onClick={() => { setClearingCache(true); void window.postbird.desktop.clearMailCache().then(() => setCacheSize(0)).finally(() => setClearingCache(false)) }}>{clearingCache ? 'Clearing…' : 'Clear cached mail'}</button></div>
      <div className="settings-divider"/>
      <AccountThemeEditor accounts={accounts} themes={themes} colorMode={colorMode} onChange={onThemeChange} onChooseAvatar={onChooseAvatar}/><div className="settings-divider"/>
      <div className="settings-section-title"><strong>Typography</strong><span>Choose a direction or use fonts installed in Windows.</span></div>
      <div className="font-presets">{fontPresets.map(preset => <button key={preset.id} className={value.preset === preset.id ? 'selected' : ''} aria-pressed={value.preset === preset.id} onClick={() => selectPreset(preset.id)}><span style={{ fontFamily: fontStack(preset.reading, 'serif') }}>Aa</span><div><strong>{preset.name}</strong><small>{preset.detail}</small></div></button>)}</div>
      <div className="font-selectors">
        {([['uiFont', 'Interface font', 'Menus, message list and controls'], ['readingFont', 'Reading font', 'Subjects, email content and composer']] as Array<['uiFont' | 'readingFont', string, string]>).map(([key, label, detail]) => <label key={key}><span>{label}</span><select value={value[key]} style={{ fontFamily: fontStack(value[key], 'sans-serif') }} onChange={event => onChange({ ...value, preset: 'custom', [key]: event.target.value })}><optgroup label="Fonts —————————————————">{standardFonts.map(font => <option key={font} value={font} style={{ fontFamily: fontStack(font, 'sans-serif') }}>{font}</option>)}</optgroup>{importedFonts.length > 0 && <optgroup label="Imported Fonts —————————————">{importedFonts.map(font => <option key={font.id} value={font.name} style={{ fontFamily: fontStack(font.name, 'sans-serif') }}>{font.name}</option>)}</optgroup>}</select><strong className="selected-font-sample" style={{ fontFamily: fontStack(value[key], 'sans-serif') }}>{value[key]} · The quick brown fox</strong><small>{detail}</small></label>)}
      </div>
      <div className="font-size-selectors">
        <label><span>Interface size</span><select value={value.uiFontSize} onChange={event => onChange({ ...value, uiFontSize: Number(event.target.value) })}>{[10, 11, 12, 13, 14, 15, 16].map(size => <option key={size} value={size}>{size}px{size === 13 ? ' · Default' : ''}</option>)}</select><small>Menus, folders, controls and message list adapt together</small></label>
        <label><span>Reading size</span><select value={value.readingFontSize} onChange={event => onChange({ ...value, readingFontSize: Number(event.target.value) })}>{[12, 13, 14, 15, 16, 18, 20, 22, 24].map(size => <option key={size} value={size}>{size}px{size === 16 ? ' · Default' : ''}</option>)}</select><small>Email content, subjects and the composer</small></label>
      </div>
      <button className="font-import-button" onClick={() => { setFontImportStatus('Opening font picker…'); void window.postbird.appearance.importFonts().then(fonts => { const previousIds = new Set(importedFonts.map(font => font.id)); const newest = [...fonts].reverse().find(font => !previousIds.has(font.id)); onImportedFontsChange(fonts); if (newest) { onChange({ ...value, preset: 'custom', readingFont: newest.name }); setFontImportStatus(`${newest.name} imported and applied as the reading font.`) } else setFontImportStatus('No new font was selected.') }).catch(reason => setFontImportStatus(reason instanceof Error ? reason.message : 'Font import failed.')) }}><Download size={14}/><span><strong>Import more fonts</strong><small>TTF, OTF, WOFF or WOFF2 · stored locally</small></span></button>
      {fontImportStatus && <p className="font-import-status" role="status">{fontImportStatus}</p>}
      <div className="font-preview"><span style={{ fontFamily: fontStack(value.uiFont, 'sans-serif') }}>Maya Chen · 9:42 AM</span><strong style={{ fontFamily: fontStack(value.readingFont, 'serif') }}>The Copenhagen notes</strong><p style={{ fontFamily: fontStack(value.readingFont, 'serif') }}>A quiet preview of how your messages will read in SABLE.</p></div>
    </div>
    <footer><button className="secondary-button" onClick={() => onChange(defaultFontSettings)}>Reset</button><button className="connect-button" onClick={onClose}>Done</button></footer>
  </section></div>
}

function AccountThemeEditor({ accounts, themes, colorMode, onChange, onChooseAvatar }: { accounts: MailAccount[]; themes: Record<string, AccountTheme>; colorMode: 'light' | 'dark'; onChange: (theme: AccountTheme) => void; onChooseAvatar: (accountId: string) => Promise<void> }) {
  const [selectedAccountId, setSelectedAccountId] = useState(generalThemeId)
  const [editingMode, setEditingMode] = useState<'light' | 'dark'>(colorMode)
  const current = themes[selectedAccountId] ?? createAccountTheme(selectedAccountId)
  const palette = current[editingMode]
  const contrast = contrastRatio(palette.text, palette.background)
  const updatePalette = (key: keyof ThemePalette, value: string) => onChange({ ...current, preset: 'Custom', [editingMode]: { ...palette, [key]: value } })
  const isGeneral = selectedAccountId === generalThemeId
  return <div className="account-theme-editor"><div className="settings-section-title"><strong>Mailbox colours</strong><span>Customize the unified mailbox or give every account its own identity.</span></div>
    <label className="theme-account-select"><span>Mailbox</span><select value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)}><option value={generalThemeId}>General · Unified mailboxes</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select></label>
    <div className="theme-mode-toggle"><button className={editingMode === 'light' ? 'selected' : ''} onClick={() => setEditingMode('light')}><Sun size={13}/>Light palette</button><button className={editingMode === 'dark' ? 'selected' : ''} onClick={() => setEditingMode('dark')}><Moon size={13}/>Dark palette</button><span className={editingMode === colorMode ? 'theme-live-status active' : 'theme-live-status'}>{editingMode === colorMode ? '● Live in the app' : `Previewing ${editingMode} mode`}</span></div>
    <div className="theme-presets">{Object.keys(themePresets).map(name => <button key={name} className={current.preset === name ? 'selected' : ''} onClick={() => onChange(createAccountTheme(selectedAccountId, name))}><i style={{ background: themePresets[name][editingMode].accent }}/>{name}</button>)}</div>
    <div className="theme-colors">{(['accent', 'background', 'surface', 'text', 'muted', 'border'] as Array<keyof ThemePalette>).map(key => <label key={key}><span>{key.replace(/^./, character => character.toUpperCase())}</span><input type="color" value={palette[key]} onChange={event => updatePalette(key, event.target.value)}/><input aria-label={`${key} hex value`} value={palette[key]} onChange={event => /^#[0-9a-f]{0,6}$/i.test(event.target.value) && updatePalette(key, event.target.value)}/></label>)}</div>
    <div className="theme-preview" style={{ '--preview-bg': palette.background, '--preview-surface': palette.surface, '--preview-text': palette.text, '--preview-muted': palette.muted, '--preview-border': palette.border, '--preview-accent': palette.accent } as CSSProperties}><aside><b>S</b><i/><i/><i/></aside><section><header>{isGeneral ? 'Unified inbox' : 'Account inbox'}</header><div className="preview-mail selected"><span/><p><strong>The Copenhagen notes</strong><small>A quiet preview of your mailbox theme.</small></p></div><div className="preview-mail"><span/><p><strong>Design review</strong><small>Everything updates as you choose colors.</small></p></div></section><article><small>LIVE THEME PREVIEW</small><strong>The Copenhagen notes</strong><p>Background, surfaces, text, borders and the accent color are all shown here.</p><button>Reply</button></article></div>
    <div className={`contrast-status ${contrast < 4.5 ? 'warning' : ''}`}>{contrast < 4.5 ? `Low text contrast (${contrast.toFixed(1)}:1). Aim for 4.5:1.` : `Accessible text contrast · ${contrast.toFixed(1)}:1`}</div>
    {!isGeneral && <><label className="avatar-style"><span>Avatar shape</span><select value={current.avatarStyle} onChange={event => onChange({ ...current, avatarStyle: event.target.value as AccountTheme['avatarStyle'] })}><option value="circle">Circle</option><option value="rounded">Rounded</option><option value="square">Square</option></select></label><button className="secondary-button custom-avatar-button" onClick={() => void onChooseAvatar(selectedAccountId)}>Choose local account picture</button></>}
  </div>
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => { const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + .05) / (darker + .05)
}

function GoogleLoginProgress({ onReopen, onCancel }: { onReopen: () => Promise<void>; onCancel: () => Promise<void> }) {
  return <div className="modal-backdrop"><section className="connect-modal login-progress" role="dialog" aria-modal="true" aria-labelledby="google-progress-title">
    <span className="google-badge">G</span><h2 id="google-progress-title">Choose an account in Google</h2><p>SABLE is waiting for the authorization page in your browser.</p>
    <div><button className="secondary-button" onClick={() => void onCancel()}>Cancel</button><button className="connect-button" onClick={() => void onReopen()}><RotateCcw size={14}/>Open Google again</button></div>
  </section></div>
}

function AttachmentQuickView({ preview, loading, error, onClose, onDownload }: { preview: AttachmentPreview | null; loading: boolean; error: string; onClose: () => void; onDownload: () => void }) {
  const dataUrl = preview ? `data:${preview.mimeType};base64,${preview.dataBase64}` : ''
  let content = <div className="preview-placeholder"><FileText size={28}/><span>{error || 'Preparing preview…'}</span></div>
  if (!loading && preview?.mimeType.startsWith('image/')) content = <img className="preview-image" src={dataUrl} alt={preview.name}/>
  else if (!loading && preview?.mimeType === 'application/pdf') content = <iframe className="preview-pdf" src={dataUrl} title={`Preview of ${preview.name}`}/>
  else if (!loading && preview && /^(text\/plain|application\/(json|xml))$/.test(preview.mimeType)) content = <pre className="preview-text">{decodeBase64Text(preview.dataBase64)}</pre>
  else if (!loading && preview) content = <div className="preview-placeholder"><FileText size={28}/><strong>No inline preview</strong><span>Download this file to open it.</span></div>
  return <aside className="quick-view" aria-label="Attachment quick view"><header><div><strong>{preview?.name ?? 'Quick view'}</strong><small>{preview ? formatBytes(preview.size) : 'Attachment'}</small></div><button className="icon-button" aria-label="Close quick view" onClick={onClose}><X size={17}/></button></header><div className="preview-stage">{content}</div><footer><button className="secondary-button" disabled={!preview} onClick={onDownload}><Download size={14}/>Download</button></footer></aside>
}

const decodeBase64Text = (value: string): string => new TextDecoder().decode(Uint8Array.from(atob(value), character => character.charCodeAt(0)))
const formatBytes = (bytes: number): string => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

function Onboarding({ googleConfigured, microsoftConfigured, accounts, onImportGoogle, onManualGoogle, onConnectGoogle, onConnectMicrosoft, onFinish }: { googleConfigured: boolean; microsoftConfigured: boolean; accounts: MailAccount[]; onImportGoogle: () => Promise<{ configured: boolean; fileName?: string }>; onManualGoogle: () => void; onConnectGoogle: () => void; onConnectMicrosoft: () => void; onFinish: () => void }) {
  const [step, setStep] = useState(0); const [status, setStatus] = useState(''); const [error, setError] = useState('')
  const steps = ['Welcome', 'Google Cloud', 'OAuth file', 'Connect', 'Ready']
  const open = (url: string) => void window.postbird.desktop.openExternal(url)
  const importJson = () => { setError(''); setStatus('Opening file picker…'); void onImportGoogle().then(result => setStatus(result.configured ? `${result.fileName ?? 'OAuth file'} is ready.` : 'No file selected.')).catch(reason => { setStatus(''); setError(reason instanceof Error ? reason.message : 'Could not import the OAuth file.') }) }
  return <div className="onboarding-shell" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><aside><div className="onboarding-brand"><span className="logo-mark"><img src={sableIcon} alt=""/></span><strong>SABLE</strong></div><ol>{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}><i>{index < step ? '✓' : index + 1}</i><span>{label}</span></li>)}</ol><small>Private · local-first · open-source ready</small></aside><main>
    {step === 0 && <section><p className="eyebrow">WELCOME TO SABLE</p><h1 id="onboarding-title">Your inboxes, together and under your control.</h1><p>SABLE stores mail and settings locally, uses official authorization pages, and never asks for your Gmail or Outlook password.</p><div className="onboarding-cards"><article><ShieldAlert size={18}/><strong>Private by design</strong><span>OAuth tokens use Windows secure storage.</span></article><article><Inbox size={18}/><strong>Unified locally</strong><span>No paid server or cloud database required.</span></article></div></section>}
    {step === 1 && <section><p className="eyebrow">GMAIL API SETUP</p><h1>Create your Google desktop connection.</h1><p>This is required because an open-source desktop app cannot safely ship one private OAuth configuration for everyone.</p><div className="setup-steps"><article><b>1</b><span><strong>Create a Google Cloud project</strong><small>Use any project name, such as “My SABLE Mail”.</small></span><button onClick={() => open('https://console.cloud.google.com/projectcreate')}>Open</button></article><article><b>2</b><span><strong>Enable the Gmail API</strong><small>This gives SABLE access to mail after you consent.</small></span><button onClick={() => open('https://console.cloud.google.com/apis/library/gmail.googleapis.com')}>Open</button></article><article><b>3</b><span><strong>Enable the People API</strong><small>This supplies optional contact names and photos.</small></span><button onClick={() => open('https://console.cloud.google.com/apis/library/people.googleapis.com')}>Open</button></article><article><b>4</b><span><strong>Configure OAuth consent</strong><small>Choose External for personal Gmail and add your address as a test user.</small></span><button onClick={() => open('https://console.cloud.google.com/auth/overview')}>Open</button></article><article><b>5</b><span><strong>Create a Desktop app OAuth client</strong><small>Application type must be Desktop app—not Web application.</small></span><button onClick={() => open('https://console.cloud.google.com/auth/clients')}>Open</button></article></div></section>}
    {step === 2 && <section><p className="eyebrow">OAUTH CONFIGURATION</p><h1>Choose how to add your Google credentials.</h1><p>Both methods stay local. Importing the downloaded file is quickest, while manual entry works if you already copied the client ID and client secret.</p>{googleConfigured && <p className="onboarding-success">✓ Google OAuth is already configured. You can continue without doing this again.</p>}<div className="onboarding-config-options"><button className="onboarding-import" onClick={importJson}><Download size={20}/><span><strong>Import JSON file</strong><small>Recommended · choose the client_secret_….json downloaded from Google Cloud</small></span></button><button className="onboarding-import" onClick={onManualGoogle}><PenLine size={20}/><span><strong>Enter credentials manually</strong><small>Paste your Desktop OAuth client ID and client secret into SABLE</small></span></button></div>{status && <p className="onboarding-success">✓ {status}</p>}{error && <p className="connect-error">{error}</p>}<div className="troubleshooting"><strong>Common issue</strong><p>If Google says “Access blocked,” return to OAuth consent and add the Gmail address you are signing in with as a test user.</p></div></section>}
    {step === 3 && <section><p className="eyebrow">CONNECT ACCOUNTS</p><h1>Continue on the official provider page.</h1><p>SABLE will open your normal browser, where Google or Microsoft lets you choose the account.</p><div className="onboarding-providers"><button disabled={!googleConfigured} onClick={onConnectGoogle}><b>G</b><span><strong>Connect Gmail</strong><small>{googleConfigured ? 'Google OAuth configuration ready' : 'Import the JSON or enter credentials manually first'}</small></span></button><button onClick={onConnectMicrosoft}><b>M</b><span><strong>Connect Outlook</strong><small>{microsoftConfigured ? 'Microsoft application ready' : 'Enter an Entra desktop client ID'}</small></span></button></div></section>}
    {step === 4 && <section><p className="eyebrow">SETUP COMPLETE</p><h1>{accounts.length ? 'Your mailbox is ready.' : 'SABLE is ready when you are.'}</h1><p>You can connect more accounts or reopen this guide at any time from Settings → Accounts.</p><div className="onboarding-finish-mark">S</div></section>}
    <footer><button className="onboarding-skip" onClick={onFinish}>{step === 4 ? 'Close' : 'Skip for now'}</button><span/>{step > 0 && <button className="secondary-button" onClick={() => setStep(value => value - 1)}>Back</button>}<button className="connect-button" onClick={() => step === 4 ? onFinish() : setStep(value => value + 1)}>{step === 4 ? 'Open SABLE' : 'Continue'}</button></footer>
  </main></div>
}

function ConnectAccount({ clientIdConfigured, googleConfigured, onImportJson, onConnectGoogle, onClose }: { clientIdConfigured: boolean; googleConfigured: boolean; onImportJson: () => Promise<{ configured: boolean; fileName?: string }>; onConnectGoogle: (clientId?: string, clientSecret?: string) => Promise<void>; onClose: () => void }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [importedFile, setImportedFile] = useState('')
  const connect = async () => {
    setBusy(true); setError('')
    try { await onConnectGoogle(clientIdConfigured ? undefined : clientId, googleConfigured ? undefined : clientSecret) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not connect Gmail.'); setBusy(false) }
  }
  return <div className="modal-backdrop"><section className="connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title">
    <header><div><span className="google-badge">G</span><div><h2 id="connect-title">Connect Gmail</h2><p>SABLE opens Google’s official authorization page.</p></div></div><button className="icon-button" aria-label="Close account setup" onClick={onClose}><X size={17}/></button></header>
    {!googleConfigured && <button className="oauth-json-import" onClick={() => void onImportJson().then(result => { if (result.configured) setImportedFile(result.fileName ?? 'Google OAuth JSON'); setError('') }).catch(reason => setError(reason instanceof Error ? reason.message : 'Could not import this file.'))}><Download size={16}/><span><strong>Import Google OAuth JSON</strong><small>{importedFile ? `${importedFile} imported successfully` : 'Recommended · choose the JSON downloaded from Google Cloud'}</small></span></button>}
    {!clientIdConfigured && <label><span>Google desktop OAuth client ID</span><input autoFocus value={clientId} onChange={event => setClientId(event.target.value)} placeholder="…apps.googleusercontent.com"/><small>The public identifier from your Desktop OAuth client.</small></label>}
    {!googleConfigured && <label><span>Google desktop OAuth client secret</span><input autoFocus={clientIdConfigured} type="password" value={clientSecret} onChange={event => setClientSecret(event.target.value)} placeholder="GOCSPX-…"/><small>This is not your Gmail password. It is encrypted locally with Windows DPAPI.</small></label>}
    <div className="permission-note"><strong>Permissions requested</strong><p>Read, compose and organize Gmail messages, plus read-only access to saved contacts for recipient names and photos.</p></div>
    {error && <p className="connect-error" role="alert">{error}</p>}
    <footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="connect-button" disabled={busy || (!clientIdConfigured && !clientId.trim()) || (!googleConfigured && !clientSecret.trim())} onClick={() => void connect()}>{busy ? 'Waiting for Google…' : 'Continue with Google'}</button></footer>
  </section></div>
}

function ConnectMicrosoft({ configured, onConnect, onClose }: { configured: boolean; onConnect: (clientId?: string) => Promise<void>; onClose: () => void }) {
  const [clientId, setClientId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const connect = async () => { setBusy(true); setError(''); try { await onConnect(configured ? undefined : clientId) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not connect Outlook.'); setBusy(false) } }
  return <div className="modal-backdrop"><section className="connect-modal" role="dialog" aria-modal="true" aria-labelledby="microsoft-connect-title"><header><div><span className="google-badge microsoft-badge">M</span><div><h2 id="microsoft-connect-title">Connect Outlook</h2><p>SABLE opens Microsoft’s official authorization page.</p></div></div><button className="icon-button" aria-label="Close Outlook setup" onClick={onClose}><X size={17}/></button></header>
    {!configured && <label><span>Microsoft desktop application client ID</span><input autoFocus value={clientId} onChange={event => setClientId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000"/><small>Create a public desktop/mobile application in Microsoft Entra. No client secret is required.</small></label>}
    <div className="permission-note"><strong>Permissions requested</strong><p>Read, send and organize mail, plus read-only access to saved Outlook contacts for recipient names and photos.</p></div>{error && <p className="connect-error" role="alert">{error}</p>}<footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="connect-button" disabled={busy || (!configured && !clientId.trim())} onClick={() => void connect()}>{busy ? 'Waiting for Microsoft…' : 'Continue with Microsoft'}</button></footer>
  </section></div>
}

export function FormattedParagraph({ text }: { text: string }) {
  if (/^[-_=]{6,}$/.test(text.trim())) return <hr className="email-divider"/>
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g)
  return <p>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</p>
}

function EmailBody({ message, privacy }: { message: MailMessage; privacy: DesktopPreferences }) {
  const [visual, setVisual] = useState(Boolean(message.bodyHtml))
  const trusted = privacy.trustedSenders.includes(message.sender.email.toLowerCase())
  const [loadRemoteImages, setLoadRemoteImages] = useState(privacy.remoteImages === 'always' || (privacy.remoteImages === 'trusted' && trusted))
  const [frameHeight, setFrameHeight] = useState(300)
  const resizeObserver = useRef<ResizeObserver | null>(null)
  useEffect(() => () => resizeObserver.current?.disconnect(), [])
  const fitFrame = (frame: HTMLIFrameElement) => {
    const document = frame.contentDocument
    if (!document?.body) return
    const resize = () => setFrameHeight(Math.max(180, document.documentElement.scrollHeight, document.body.scrollHeight) + 2)
    resizeObserver.current?.disconnect()
    resizeObserver.current = new ResizeObserver(resize)
    resizeObserver.current.observe(document.body)
    resize()
  }
  return <div className="email-body-wrap">
    {message.bodyHtml && <div className="email-view-controls"><div className="email-view-toggle" aria-label="Email display mode"><button className={visual ? 'active' : ''} onClick={() => setVisual(true)}>Visual</button><button className={!visual ? 'active' : ''} onClick={() => setVisual(false)}>Plain text</button></div>{!loadRemoteImages && <button className="load-images-button" onClick={() => setLoadRemoteImages(true)}>Load images once</button>}</div>}
    {visual && message.bodyHtml ? <iframe className="email-html-frame" style={{ height: frameHeight }} title={`Formatted content of ${message.subject}`} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" scrolling="no" onLoad={event => fitFrame(event.currentTarget)} srcDoc={buildEmailDocument(message.bodyHtml, { loadRemoteImages, blockTrackers: privacy.blockTrackers, cleanLinks: privacy.cleanLinks })}/> : <div className="body-copy">{message.body.map((paragraph, index) => <FormattedParagraph key={index} text={paragraph}/>)}</div>}
  </div>
}

function RecipientField({ label, values, onChange, suggestions, autoFocus = false }: { label: string; values: string[]; onChange: (values: string[]) => void; suggestions: RecipientSuggestion[]; autoFocus?: boolean }) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const normalizedValues = values.map(value => value.toLowerCase())
  const matches = useMemo(() => {
    const query = input.trim().toLowerCase()
    return suggestions.filter(contact => !normalizedValues.includes(contact.email) && (!query || contact.name.toLowerCase().includes(query) || contact.email.includes(query))).slice(0, 6)
  }, [input, normalizedValues.join('|'), suggestions])
  const addRecipient = (value?: string) => {
    const parsed = parseRecipient(value ?? input)
    if (!parsed || normalizedValues.includes(parsed.email)) return false
    onChange([...values, parsed.email])
    setInput(''); setOpen(false); setActive(0)
    return true
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); setOpen(true); setActive(index => (index + 1) % matches.length); return }
    if (event.key === 'ArrowUp' && matches.length) { event.preventDefault(); setOpen(true); setActive(index => (index - 1 + matches.length) % matches.length); return }
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'Backspace' && !input && values.length) { onChange(values.slice(0, -1)); return }
    if (event.key === 'Enter' || event.key === ',' || event.key === ';' || (event.key === 'Tab' && input)) {
      const target = open && matches.length ? matches[active]?.email : input.replace(/[,;]$/, '')
      if (target && addRecipient(target)) event.preventDefault()
    }
  }
  return <div className="recipient-row">
    <span className="recipient-label">{label}</span>
    <div className="recipient-control" onClick={event => (event.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {values.map(value => { const contact = suggestions.find(item => item.email === value.toLowerCase()); return <span className="recipient-chip" key={value} title={contact?.name || value}><span>{contact?.name || value}</span>{contact?.name && <small>{value}</small>}<button type="button" aria-label={`Remove ${value}`} onClick={event => { event.stopPropagation(); onChange(values.filter(item => item !== value)) }}><X size={11}/></button></span> })}
      <input autoFocus={autoFocus} value={input} onFocus={() => { setOpen(true); setActive(0) }} onBlur={() => { window.setTimeout(() => { if (input) addRecipient(); setOpen(false) }, 120) }} onChange={event => { setInput(event.target.value); setOpen(true); setActive(0) }} onKeyDown={onKeyDown} aria-label={`${label} recipients`} aria-autocomplete="list" aria-expanded={open && matches.length > 0} placeholder={values.length ? '' : `Add ${label.toLowerCase()} recipients`}/>
      {open && matches.length > 0 && <div className="recipient-suggestions" role="listbox">{matches.map((contact, index) => <button type="button" role="option" aria-selected={index === active} className={index === active ? 'active' : ''} key={contact.email} onMouseDown={event => { event.preventDefault(); addRecipient(contact.email) }}><span className="suggestion-avatar">{contact.avatarDataUrl ? <img src={contact.avatarDataUrl} alt=""/> : contact.initials}</span><span><strong>{contact.name}</strong><small>{contact.email}</small></span><em>{contact.frequency > 1 ? 'Frequent' : 'Contact'}</em></button>)}</div>}
    </div>
  </div>
}

function Compose({ accounts, suggestions, seed, onSend, onClose }: { accounts: MailAccount[]; suggestions: RecipientSuggestion[]; seed: ComposeSeed; onSend: (accountId: string, draft: ComposeDraft) => Promise<void>; onClose: () => void }) {
  const [to, setTo] = useState(seed.to ?? [])
  const [cc, setCc] = useState(seed.cc ?? [])
  const [bcc, setBcc] = useState(seed.bcc ?? [])
  const [showCopies, setShowCopies] = useState(Boolean(seed.cc?.length || seed.bcc?.length))
  const [subject, setSubject] = useState(seed.subject ?? '')
  const [body, setBody] = useState(seed.body ?? '')
  const [accountId, setAccountId] = useState(seed.accountId ?? accounts.find(account => account.id.startsWith('gmail:'))?.id ?? accounts[0]?.id ?? '')
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([])
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState('')
  const draftId = useRef<string | undefined>(undefined)
  const draft: ComposeDraft = { to, cc, bcc, subject, body, threadId: seed.threadId, inReplyTo: seed.inReplyTo, attachments }
  useEffect(() => {
    if ((!accountId.startsWith('gmail:') && !accountId.startsWith('outlook:')) || (!to.length && !cc.length && !bcc.length && !subject.trim() && !body.trim() && !attachments.length)) return
    setDraftStatus('saving')
    const timer = window.setTimeout(() => { const request = accountId.startsWith('gmail:') ? window.postbird.gmail.saveDraft(accountId, draft, draftId.current) : window.postbird.outlook.saveDraft(accountId, draft, draftId.current); void request.then(id => { draftId.current = id; setDraftStatus('saved') }).catch(reason => { setDraftStatus('idle'); setError(reason instanceof Error ? reason.message : 'Draft could not be saved.') }) }, 1500)
    return () => window.clearTimeout(timer)
  }, [accountId, attachments, bcc, body, cc, subject, to])
  const send = async () => {
    setSending(true); setError('')
    try { await onSend(accountId, draft); if (draftId.current) await (accountId.startsWith('gmail:') ? window.postbird.gmail.deleteDraft(accountId, draftId.current) : window.postbird.outlook.deleteDraft(accountId, draftId.current)).catch(() => undefined); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Message could not be sent.'); setSending(false) }
  }
  const chooseAttachments = async () => {
    setAttaching(true)
    setError('')
    try {
      const files = await window.postbird.gmail.chooseAttachments()
      const totalSize = [...attachments, ...files].reduce((sum, file) => sum + file.size, 0)
      if (totalSize > 25 * 1024 * 1024) throw new Error('All attachments together must stay under Gmail’s 25 MB limit. Choose a smaller ZIP or send a cloud-storage link instead.')
      setAttachments(current => [...current, ...files])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The file could not be attached. Check that it is readable and smaller than 25 MB.')
    } finally {
      setAttaching(false)
    }
  }
  const discard = async () => { if (draftId.current) await (accountId.startsWith('gmail:') ? window.postbird.gmail.deleteDraft(accountId, draftId.current) : window.postbird.outlook.deleteDraft(accountId, draftId.current)).catch(() => undefined); onClose() }
  return <section className="compose-modal" role="dialog" aria-modal="true" aria-labelledby="compose-title">
    <header><h2 id="compose-title">New message</h2><button className="icon-button" aria-label="Close composer" onClick={onClose}><X size={17}/></button></header>
    <label><span>From</span><select className="from-account" value={accountId} onChange={event => setAccountId(event.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select><button type="button" className="show-copies" onClick={() => setShowCopies(value => !value)} aria-expanded={showCopies}>Cc · Bcc</button></label>
    <RecipientField label="To" values={to} onChange={setTo} suggestions={suggestions} autoFocus/>
    {showCopies && <><RecipientField label="Cc" values={cc} onChange={setCc} suggestions={suggestions}/><RecipientField label="Bcc" values={bcc} onChange={setBcc} suggestions={suggestions}/></>}
    <label><span>Subject</span><input value={subject} onChange={event => setSubject(event.target.value)} aria-label="Subject"/></label>
    <textarea aria-label="Message body" placeholder="Write your message…" value={body} onChange={event => setBody(event.target.value)}/>
    {attachments.length > 0 && <div className="compose-attachments">{attachments.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={12}/><b>{file.name}</b><small>{formatBytes(file.size)}</small><button aria-label={`Remove ${file.name}`} onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))}><X size={12}/></button></span>)}</div>}
    {error && <p className="compose-error" role="alert">{error}</p>}
    <footer><button className="send-button" disabled={sending || !to.length} onClick={() => void send()}><Send size={15}/>{sending ? 'Sending…' : 'Send'}</button><button className="icon-button" aria-label="Attach files" disabled={attaching} onClick={() => void chooseAttachments()}><Paperclip size={17}/></button><span className="draft-status">{draftStatus === 'saving' ? 'Saving…' : draftStatus === 'saved' ? 'Draft saved' : ''}</span><button className="icon-button" aria-label="Discard draft" onClick={() => void discard()}><Trash2 size={17}/></button></footer>
  </section>
}
