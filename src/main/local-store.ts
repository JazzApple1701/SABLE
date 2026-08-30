import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DesktopPreferences } from '../shared/models'

interface Settings { googleClientId?: string; googleClientSecret?: string; microsoftClientId?: string; desktop?: DesktopPreferences }
const defaultDesktopPreferences: DesktopPreferences = { notifications: true, launchAtStartup: false, minimizeToTray: true, backgroundSync: true, remoteImages: 'always', blockTrackers: true, cleanLinks: true, trustedSenders: [] }
export interface GoogleTokens { accessToken: string; refreshToken?: string; expiresAt: number; scope: string }
interface TokenVault { [accountId: string]: string }

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await readFile(path, 'utf8')) as T } catch { return fallback }
}

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export class LocalStore {
  private settingsPath = join(app.getPath('userData'), 'settings.json')
  private vaultPath = join(app.getPath('userData'), 'oauth-vault.json')

  async getGoogleClientId(): Promise<string | undefined> {
    return (await readJson<Settings>(this.settingsPath, {})).googleClientId
  }

  async setGoogleClientId(clientId: string): Promise<void> {
    const settings = await readJson<Settings>(this.settingsPath, {})
    await writeJson(this.settingsPath, { ...settings, googleClientId: clientId })
  }

  async getMicrosoftClientId(): Promise<string | undefined> { return (await readJson<Settings>(this.settingsPath, {})).microsoftClientId }
  async setMicrosoftClientId(clientId: string): Promise<void> { const settings = await readJson<Settings>(this.settingsPath, {}); await writeJson(this.settingsPath, { ...settings, microsoftClientId: clientId }) }

  async hasGoogleClientSecret(): Promise<boolean> {
    return Boolean((await readJson<Settings>(this.settingsPath, {})).googleClientSecret)
  }

  async getGoogleClientSecret(): Promise<string | undefined> {
    const encrypted = (await readJson<Settings>(this.settingsPath, {})).googleClientSecret
    if (!encrypted) return undefined
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.')
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }

  async setGoogleClientSecret(clientSecret: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.')
    const settings = await readJson<Settings>(this.settingsPath, {})
    await writeJson(this.settingsPath, { ...settings, googleClientSecret: safeStorage.encryptString(clientSecret).toString('base64') })
  }

  async getDesktopPreferences(): Promise<DesktopPreferences> { return { ...defaultDesktopPreferences, ...(await readJson<Settings>(this.settingsPath, {})).desktop } }

  async setDesktopPreferences(desktop: DesktopPreferences): Promise<void> {
    const settings = await readJson<Settings>(this.settingsPath, {})
    await writeJson(this.settingsPath, { ...settings, desktop })
  }

  async listTokenAccountIds(): Promise<string[]> {
    return Object.keys(await readJson<TokenVault>(this.vaultPath, {}))
  }

  async getTokens(accountId: string): Promise<GoogleTokens | undefined> {
    const encrypted = (await readJson<TokenVault>(this.vaultPath, {}))[accountId]
    if (!encrypted) return undefined
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.')
    const plaintext = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    return JSON.parse(plaintext) as GoogleTokens
  }

  async setTokens(accountId: string, tokens: GoogleTokens): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.')
    const vault = await readJson<TokenVault>(this.vaultPath, {})
    vault[accountId] = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64')
    await writeJson(this.vaultPath, vault)
  }

  async removeTokens(accountId: string): Promise<void> {
    const vault = await readJson<TokenVault>(this.vaultPath, {})
    delete vault[accountId]
    await writeJson(this.vaultPath, vault)
  }
}
