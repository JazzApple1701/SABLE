import { contextBridge, ipcRenderer } from 'electron'
import type { PostbirdApi } from '../shared/models'

const api: PostbirdApi = {
  platform: process.platform,
  version: '2.2.0',
  accounts: {
    status: () => ipcRenderer.invoke('accounts:status'),
    connectGoogle: (clientId, clientSecret) => ipcRenderer.invoke('accounts:connectGoogle', clientId, clientSecret),
    connectMicrosoft: clientId => ipcRenderer.invoke('accounts:connectMicrosoft', clientId),
    importGoogleOAuthJson: () => ipcRenderer.invoke('accounts:importGoogleOAuthJson'),
    reopenGoogleLogin: () => ipcRenderer.invoke('accounts:reopenGoogleLogin'),
    cancelGoogleLogin: () => ipcRenderer.invoke('accounts:cancelGoogleLogin'),
    disconnect: (accountId) => ipcRenderer.invoke('accounts:disconnect', accountId),
    listContacts: (accountId) => ipcRenderer.invoke('accounts:listContacts', accountId)
  },
  appearance: {
    listThemes: () => ipcRenderer.invoke('appearance:listThemes'),
    saveTheme: theme => ipcRenderer.invoke('appearance:saveTheme', theme),
    chooseAccountAvatar: (accountId, email) => ipcRenderer.invoke('appearance:chooseAccountAvatar', accountId, email),
    listImportedFonts: () => ipcRenderer.invoke('appearance:listImportedFonts'),
    importFonts: () => ipcRenderer.invoke('appearance:importFonts')
  },
  desktop: {
    getPreferences: () => ipcRenderer.invoke('desktop:getPreferences'),
    savePreferences: preferences => ipcRenderer.invoke('desktop:savePreferences', preferences),
    notify: (title, body) => ipcRenderer.invoke('desktop:notify', title, body),
    getCacheSize: () => ipcRenderer.invoke('desktop:getCacheSize'),
    clearMailCache: () => ipcRenderer.invoke('desktop:clearMailCache'),
    openExternal: url => ipcRenderer.invoke('desktop:openExternal', url)
  },
  gmail: {
    listMailbox: (accountId, mailbox, query, pageToken) => ipcRenderer.invoke('gmail:listMailbox', accountId, mailbox, query, pageToken),
    modifyThread: (accountId, threadId, action) => ipcRenderer.invoke('gmail:modifyThread', accountId, threadId, action),
    listLabels: accountId => ipcRenderer.invoke('gmail:listLabels', accountId),
    modifyLabels: (accountId, threadId, addLabelIds, removeLabelIds) => ipcRenderer.invoke('gmail:modifyLabels', accountId, threadId, addLabelIds, removeLabelIds),
    downloadAttachment: (accountId, messageId, attachmentId, fileName) => ipcRenderer.invoke('gmail:downloadAttachment', accountId, messageId, attachmentId, fileName),
    previewAttachment: (accountId, messageId, attachmentId, fileName, mimeType) => ipcRenderer.invoke('gmail:previewAttachment', accountId, messageId, attachmentId, fileName, mimeType),
    getVisualBody: (accountId, messageId) => ipcRenderer.invoke('gmail:getVisualBody', accountId, messageId),
    chooseAttachments: () => ipcRenderer.invoke('gmail:chooseAttachments'),
    saveDraft: (accountId, draft, draftId) => ipcRenderer.invoke('gmail:saveDraft', accountId, draft, draftId),
    deleteDraft: (accountId, draftId) => ipcRenderer.invoke('gmail:deleteDraft', accountId, draftId),
    send: (accountId, draft) => ipcRenderer.invoke('gmail:send', accountId, draft)
  },
  outlook: {
    listMailbox: (accountId, mailbox, query, pageToken) => ipcRenderer.invoke('outlook:listMailbox', accountId, mailbox, query, pageToken),
    modifyMessage: (accountId, messageId, action) => ipcRenderer.invoke('outlook:modifyMessage', accountId, messageId, action),
    downloadAttachment: (accountId, messageId, attachmentId, fileName) => ipcRenderer.invoke('outlook:downloadAttachment', accountId, messageId, attachmentId, fileName),
    previewAttachment: (accountId, messageId, attachmentId, fileName, mimeType) => ipcRenderer.invoke('outlook:previewAttachment', accountId, messageId, attachmentId, fileName, mimeType),
    saveDraft: (accountId, draft, draftId) => ipcRenderer.invoke('outlook:saveDraft', accountId, draft, draftId),
    deleteDraft: (accountId, draftId) => ipcRenderer.invoke('outlook:deleteDraft', accountId, draftId),
    send: (accountId, draft) => ipcRenderer.invoke('outlook:send', accountId, draft)
  }
}

contextBridge.exposeInMainWorld('postbird', api)
declare global { interface Window { postbird: PostbirdApi } }
