import { app, BrowserWindow, Menu, shell, Tray } from 'electron'
import { join } from 'node:path'
import { createConnection, createServer, type Server } from 'node:net'
import { registerIpc } from './ipc'
import { LocalStore } from './local-store'
import type { DesktopPreferences } from '../shared/models'

if (process.platform === 'win32') app.setAppUserModelId('com.jasim.sable')

let mainWindow: BrowserWindow | null = null
let instancePipe: Server | null = null
let tray: Tray | null = null
let quitting = false
let desktopPreferences: DesktopPreferences = { notifications: true, launchAtStartup: false, minimizeToTray: true, backgroundSync: true, remoteImages: 'always', blockTrackers: true, cleanLinks: true, trustedSenders: [] }
const instancePipeName = '\\\\.\\pipe\\sable-desktop-instance-v2'

const focusMainWindow = (): void => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const claimInstancePipe = (): Promise<boolean> => new Promise(resolve => {
  const probe = createConnection(instancePipeName)
  probe.once('connect', () => { probe.end('focus'); resolve(false) })
  probe.once('error', () => {
    const server = createServer(socket => socket.on('data', () => focusMainWindow()))
    server.once('error', () => resolve(false))
    server.listen(instancePipeName, () => { instancePipe = server; resolve(true) })
  })
})

const createWindow = (): void => {
  const icon = app.isPackaged
    ? join(process.resourcesPath, 'sable-icon.ico')
    : join(__dirname, '../../resources/sable-icon.ico')
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 920, minHeight: 620, show: false,
    backgroundColor: '#000000', title: 'SABLE', icon, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#ffffff', height: 42 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  mainWindow = window
  window.once('ready-to-show', () => window.show())
  window.webContents.once('did-finish-load', () => { if (!window.isVisible()) window.show() })
  window.on('closed', () => { if (mainWindow === window) mainWindow = null })
  window.on('close', event => { if (!quitting && desktopPreferences.minimizeToTray) { event.preventDefault(); window.hide() } })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || url.startsWith('http://localhost:5173')
    if (!allowed) {
      event.preventDefault()
      if (url.startsWith('https://')) void shell.openExternal(url)
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else {
  app.on('second-instance', focusMainWindow)
  void claimInstancePipe().then(claimed => {
    if (!claimed) { app.quit(); return }
    app.whenReady().then(async () => {
      desktopPreferences = await new LocalStore().getDesktopPreferences()
      app.setLoginItemSettings({ openAtLogin: desktopPreferences.launchAtStartup })
      registerIpc(preferences => { desktopPreferences = preferences })
      createWindow()
      const icon = app.isPackaged ? join(process.resourcesPath, 'sable-icon.ico') : join(__dirname, '../../resources/sable-icon.ico')
      tray = new Tray(icon)
      tray.setToolTip('SABLE Mail')
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open SABLE', click: focusMainWindow }, { type: 'separator' }, { label: 'Quit', click: () => { quitting = true; app.quit() } }]))
      tray.on('double-click', focusMainWindow)
      app.on('activate', () => {
        if (mainWindow) focusMainWindow()
        else createWindow()
      })
    })
  })
}
app.on('window-all-closed', () => { if (!desktopPreferences.minimizeToTray) app.quit() })
app.on('before-quit', () => { quitting = true })
app.on('will-quit', () => { instancePipe?.close(); tray?.destroy() })
