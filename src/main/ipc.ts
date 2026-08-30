import { app, dialog, ipcMain, Notification, shell } from 'electron'
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises'
import { basename, extname, join, parse } from 'node:path'
import type { PostbirdApi } from '../shared/models'
import { GmailService } from './gmail-service'
import { GoogleAuth } from './google-auth'
import { LocalStore } from './local-store'
import { MailCache } from './mail-cache'
import type { DesktopPreferences } from '../shared/models'
import { MicrosoftAuth } from './microsoft-auth'
import { OutlookService } from './outlook-service'

type AccountApi = PostbirdApi['accounts']
type GmailApi = PostbirdApi['gmail']
type AppearanceApi = PostbirdApi['appearance']
type OutlookApi = PostbirdApi['outlook']

export function registerIpc(onDesktopPreferences?: (preferences: DesktopPreferences) => void): void {
  const store = new LocalStore()
  const cache = new MailCache()
  const auth = new GoogleAuth(store, cache)
  const microsoftAuth = new MicrosoftAuth(store, cache)
  const gmail = new GmailService(auth, cache)
  const outlook = new OutlookService(microsoftAuth, cache)

  ipcMain.handle('desktop:getPreferences', () => store.getDesktopPreferences())
  ipcMain.handle('desktop:savePreferences', async (_event, preferences: DesktopPreferences) => { await store.setDesktopPreferences(preferences); app.setLoginItemSettings({ openAtLogin: preferences.launchAtStartup }); onDesktopPreferences?.(preferences) })
  ipcMain.handle('desktop:notify', async (_event, title: string, body: string) => { const preferences = await store.getDesktopPreferences(); if (preferences.notifications && Notification.isSupported()) new Notification({ title: title.slice(0, 120), body: body.slice(0, 240), silent: false }).show() })
  ipcMain.handle('desktop:getCacheSize', () => Promise.resolve(cache.getCacheSize()))
  ipcMain.handle('desktop:clearMailCache', () => Promise.resolve(cache.clearMailCache()))
  ipcMain.handle('desktop:openExternal', (_event, url: string) => { const parsed = new URL(url); if (parsed.protocol !== 'https:') throw new Error('Only secure web links can be opened.'); return shell.openExternal(parsed.toString()) })

  ipcMain.handle('appearance:listThemes', (): ReturnType<AppearanceApi['listThemes']> => Promise.resolve(cache.listThemes()))
  ipcMain.handle('appearance:saveTheme', (_event, theme: Parameters<AppearanceApi['saveTheme']>[0]): ReturnType<AppearanceApi['saveTheme']> => Promise.resolve(cache.saveTheme(theme)))
  ipcMain.handle('appearance:chooseAccountAvatar', async (_event, accountId: string, email: string): ReturnType<AppearanceApi['chooseAccountAvatar']> => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }); if (result.canceled || !result.filePaths[0]) return undefined; const data = await readFile(result.filePaths[0]); if (data.byteLength > 5 * 1024 * 1024) throw new Error('Account pictures must be smaller than 5 MB.'); const extension = extname(result.filePaths[0]).toLowerCase(); const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'; cache.saveCustomAvatar(accountId, email, mimeType, data); return `data:${mimeType};base64,${data.toString('base64')}` })
  const fontDirectory = join(app.getPath('userData'), 'fonts')
  const listImportedFonts = async (): ReturnType<AppearanceApi['listImportedFonts']> => {
    await mkdir(fontDirectory, { recursive: true })
    const files = (await readdir(fontDirectory)).filter(file => ['.ttf', '.otf', '.woff', '.woff2'].includes(extname(file).toLowerCase()))
    return Promise.all(files.map(async file => { const extension = extname(file).toLowerCase(); const mime = extension === '.woff2' ? 'font/woff2' : extension === '.woff' ? 'font/woff' : extension === '.otf' ? 'font/otf' : 'font/ttf'; return { id: file, name: parse(file).name.replace(/^[0-9]+-/, ''), dataUrl: `data:${mime};base64,${(await readFile(join(fontDirectory, file))).toString('base64')}` } }))
  }
  ipcMain.handle('appearance:listImportedFonts', listImportedFonts)
  ipcMain.handle('appearance:importFonts', async (): ReturnType<AppearanceApi['importFonts']> => { const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Font files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }] }); if (!result.canceled) { await mkdir(fontDirectory, { recursive: true }); for (const path of result.filePaths) { if ((await readFile(path)).byteLength > 12 * 1024 * 1024) throw new Error('Each font must be smaller than 12 MB.'); await copyFile(path, join(fontDirectory, `${Date.now()}-${basename(path)}`)) } } return listImportedFonts() })

  ipcMain.handle('accounts:status', async (): ReturnType<AccountApi['status']> => ({ googleClientIdConfigured: Boolean(await store.getGoogleClientId()), googleClientSecretConfigured: await store.hasGoogleClientSecret(), microsoftClientIdConfigured: Boolean(await store.getMicrosoftClientId()), accounts: [...await auth.listAccounts(), ...await microsoftAuth.listAccounts()] }))
  ipcMain.handle('accounts:connectGoogle', (_event, clientId?: string, clientSecret?: string): ReturnType<AccountApi['connectGoogle']> => auth.connect(clientId, clientSecret).then(account => ({ account })))
  ipcMain.handle('accounts:connectMicrosoft', (_event, clientId?: string): ReturnType<AccountApi['connectMicrosoft']> => microsoftAuth.connect(clientId).then(account => ({ account })))
  ipcMain.handle('accounts:importGoogleOAuthJson', async (): ReturnType<AccountApi['importGoogleOAuthJson']> => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Google OAuth JSON', extensions: ['json'] }] }); if (result.canceled || !result.filePaths[0]) return { configured: false }; const raw = JSON.parse(await readFile(result.filePaths[0], 'utf8')) as { installed?: { client_id?: string; client_secret?: string }; web?: unknown }; if (!raw.installed?.client_id || !raw.installed.client_secret) throw new Error('This is not a Google Desktop app OAuth JSON file. Create an OAuth client with application type “Desktop app”.'); if (!raw.installed.client_id.endsWith('.apps.googleusercontent.com')) throw new Error('The Google OAuth client ID is invalid.'); await store.setGoogleClientId(raw.installed.client_id); await store.setGoogleClientSecret(raw.installed.client_secret); return { configured: true, fileName: basename(result.filePaths[0]) } })
  ipcMain.handle('accounts:reopenGoogleLogin', (): ReturnType<AccountApi['reopenGoogleLogin']> => auth.reopenGoogleLogin())
  ipcMain.handle('accounts:cancelGoogleLogin', async (): ReturnType<AccountApi['cancelGoogleLogin']> => auth.cancelGoogleLogin())
  ipcMain.handle('accounts:disconnect', (_event, accountId: string): ReturnType<AccountApi['disconnect']> => accountId.startsWith('outlook:') ? microsoftAuth.disconnect(accountId) : auth.disconnect(accountId))
  ipcMain.handle('gmail:listMailbox', (_event, accountId: string, mailbox: Parameters<GmailApi['listMailbox']>[1], query?: string, pageToken?: string): ReturnType<GmailApi['listMailbox']> => gmail.listMailbox(accountId, mailbox, query, pageToken))
  ipcMain.handle('gmail:modifyThread', (_event, accountId: string, threadId: string, action: Parameters<GmailApi['modifyThread']>[2]): ReturnType<GmailApi['modifyThread']> => gmail.modifyThread(accountId, threadId, action))
  ipcMain.handle('gmail:listLabels', (_event, accountId: string): ReturnType<GmailApi['listLabels']> => gmail.listLabels(accountId))
  ipcMain.handle('gmail:modifyLabels', (_event, accountId: string, threadId: string, addLabelIds: string[], removeLabelIds: string[]): ReturnType<GmailApi['modifyLabels']> => gmail.modifyLabels(accountId, threadId, addLabelIds, removeLabelIds))
  ipcMain.handle('gmail:downloadAttachment', async (_event, accountId: string, messageId: string, attachmentId: string, fileName: string): ReturnType<GmailApi['downloadAttachment']> => {
    const result = await dialog.showSaveDialog({ defaultPath: basename(fileName) })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, await gmail.getAttachment(accountId, messageId, attachmentId))
    return true
  })
  ipcMain.handle('gmail:previewAttachment', async (_event, accountId: string, messageId: string, attachmentId: string, fileName: string, mimeType?: string): ReturnType<GmailApi['previewAttachment']> => {
    const data = await gmail.getAttachment(accountId, messageId, attachmentId)
    if (data.byteLength > 15 * 1024 * 1024) throw new Error('This attachment is too large for quick view. Download it instead.')
    const safeMime = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|application\/(json|xml))$/i.test(mimeType ?? '') ? mimeType! : 'application/octet-stream'
    return { name: basename(fileName), mimeType: safeMime, size: data.byteLength, dataBase64: data.toString('base64') }
  })
  ipcMain.handle('gmail:getVisualBody', (_event, accountId: string, messageId: string): ReturnType<GmailApi['getVisualBody']> => gmail.getVisualBody(accountId, messageId))
  ipcMain.handle('gmail:chooseAttachments', async (): ReturnType<GmailApi['chooseAttachments']> => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    const mimeByExtension: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    const attachments = await Promise.all(result.filePaths.map(async path => { const data = await readFile(path); return { name: basename(path), mimeType: mimeByExtension[extname(path).toLowerCase()] ?? 'application/octet-stream', dataBase64: data.toString('base64'), size: data.byteLength } }))
    if (attachments.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) throw new Error('Attachments must total less than 25 MB.')
    return attachments
  })
  ipcMain.handle('gmail:saveDraft', (_event, accountId: string, draft: Parameters<GmailApi['saveDraft']>[1], draftId?: string): ReturnType<GmailApi['saveDraft']> => gmail.saveDraft(accountId, draft, draftId))
  ipcMain.handle('gmail:deleteDraft', (_event, accountId: string, draftId: string): ReturnType<GmailApi['deleteDraft']> => gmail.deleteDraft(accountId, draftId))
  ipcMain.handle('gmail:send', (_event, accountId: string, draft: Parameters<GmailApi['send']>[1]): ReturnType<GmailApi['send']> => gmail.send(accountId, draft))
  ipcMain.handle('outlook:listMailbox', (_event, accountId: string, mailbox: Parameters<OutlookApi['listMailbox']>[1], query?: string, pageToken?: string): ReturnType<OutlookApi['listMailbox']> => outlook.listMailbox(accountId, mailbox, query, pageToken))
  ipcMain.handle('outlook:modifyMessage', (_event, accountId: string, messageId: string, action: Parameters<OutlookApi['modifyMessage']>[2]): ReturnType<OutlookApi['modifyMessage']> => outlook.modifyMessage(accountId, messageId, action))
  ipcMain.handle('outlook:downloadAttachment', async (_event, accountId: string, messageId: string, attachmentId: string, fileName: string): ReturnType<OutlookApi['downloadAttachment']> => { const result = await dialog.showSaveDialog({ defaultPath: basename(fileName) }); if (result.canceled || !result.filePath) return false; await writeFile(result.filePath, (await outlook.getAttachment(accountId, messageId, attachmentId)).data); return true })
  ipcMain.handle('outlook:previewAttachment', async (_event, accountId: string, messageId: string, attachmentId: string, fileName: string, mimeType?: string): ReturnType<OutlookApi['previewAttachment']> => { const result = await outlook.getAttachment(accountId, messageId, attachmentId); if (result.data.byteLength > 15 * 1024 * 1024) throw new Error('This attachment is too large for quick view.'); const safeMime = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|application\/(json|xml))$/i.test(mimeType || result.mimeType) ? (mimeType || result.mimeType) : 'application/octet-stream'; return { name: basename(fileName), mimeType: safeMime, size: result.data.byteLength, dataBase64: result.data.toString('base64') } })
  ipcMain.handle('outlook:saveDraft', (_event, accountId: string, draft: Parameters<OutlookApi['saveDraft']>[1], draftId?: string): ReturnType<OutlookApi['saveDraft']> => outlook.saveDraft(accountId, draft, draftId))
  ipcMain.handle('outlook:deleteDraft', (_event, accountId: string, draftId: string): ReturnType<OutlookApi['deleteDraft']> => outlook.deleteDraft(accountId, draftId))
  ipcMain.handle('outlook:send', (_event, accountId: string, draft: Parameters<OutlookApi['send']>[1]): ReturnType<OutlookApi['send']> => outlook.send(accountId, draft))
}
