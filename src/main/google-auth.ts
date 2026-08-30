import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ConnectedAccount } from '../shared/models'
import { LocalStore, type GoogleTokens } from './local-store'
import { MailCache } from './mail-cache'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GMAIL_SCOPE = 'openid email profile https://www.googleapis.com/auth/gmail.modify'
const encode = (value: Buffer): string => value.toString('base64url')
const googleError = async (response: Response, fallback: string): Promise<Error> => {
  try {
    const payload = await response.json() as { error?: string; error_description?: string }
    return new Error(payload.error_description || payload.error || `${fallback} (${response.status}).`)
  } catch { return new Error(`${fallback} (${response.status}).`) }
}

export class GoogleAuth {
  private activeAuthorization?: { url: string; cancel: () => void }
  constructor(private store: LocalStore, private cache?: MailCache) {}

  async connect(clientId?: string, clientSecret?: string): Promise<ConnectedAccount> {
    const configured = clientId?.trim() || await this.store.getGoogleClientId()
    if (!configured || !configured.endsWith('.apps.googleusercontent.com')) throw new Error('A valid Google desktop OAuth client ID is required.')
    if (clientId?.trim()) await this.store.setGoogleClientId(configured)
    const configuredSecret = clientSecret?.trim() || await this.store.getGoogleClientSecret()
    if (!configuredSecret) throw new Error('The Google desktop OAuth client secret is required.')
    if (clientSecret?.trim()) await this.store.setGoogleClientSecret(configuredSecret)

    const verifier = encode(randomBytes(48))
    const challenge = encode(createHash('sha256').update(verifier).digest())
    const state = encode(randomBytes(24))
    const callback = await this.listenForAuthorization(state)
    const url = new URL(AUTHORIZE_URL)
    url.search = new URLSearchParams({
      client_id: configured, redirect_uri: callback.redirectUri, response_type: 'code',
      scope: GMAIL_SCOPE, access_type: 'offline', prompt: 'consent select_account',
      code_challenge: challenge, code_challenge_method: 'S256', state
    }).toString()

    this.cancelGoogleLogin()
    this.activeAuthorization = { url: url.toString(), cancel: callback.cancel }
    try {
      await shell.openExternal(url.toString())
      const code = await callback.code
      const response = await fetch(TOKEN_URL, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: configured, client_secret: configuredSecret, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: callback.redirectUri })
      })
      if (!response.ok) throw await googleError(response, 'Google token exchange failed')
      const payload = await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string }
      const profile = await this.fetchProfile(payload.access_token)
      const accountId = `gmail:${profile.email.toLowerCase()}`
      await this.store.setTokens(accountId, { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, scope: payload.scope })
      let avatar: { mimeType: string; data: Buffer } | undefined
      if (profile.picture?.startsWith('https://')) { const response = await fetch(profile.picture); const data = Buffer.from(await response.arrayBuffer()); if (response.ok && data.byteLength < 5 * 1024 * 1024) avatar = { mimeType: response.headers.get('content-type') ?? 'image/jpeg', data } }
      this.cache?.saveAccountProfile(accountId, 'gmail', profile.email, { name: profile.name || profile.email.split('@')[0] }, avatar)
      return { id: accountId, provider: 'gmail', name: profile.name || profile.email.split('@')[0], email: profile.email, color: '#d95d50', unread: 0, avatarDataUrl: avatar ? `data:${avatar.mimeType};base64,${avatar.data.toString('base64')}` : undefined, connected: true }
    } finally { this.activeAuthorization = undefined }
  }

  async reopenGoogleLogin(): Promise<void> {
    if (!this.activeAuthorization) throw new Error('No Google login is currently waiting.')
    await shell.openExternal(this.activeAuthorization.url)
  }

  cancelGoogleLogin(): void {
    this.activeAuthorization?.cancel()
    this.activeAuthorization = undefined
  }

  async listAccounts(): Promise<ConnectedAccount[]> {
    const ids = await this.store.listTokenAccountIds()
    return ids.filter(id => id.startsWith('gmail:')).map(id => {
      const email = id.slice(6)
      const profile = this.cache?.getAccountProfile(id, email)
      return { id, provider: 'gmail', name: profile?.name ?? email.split('@')[0], email, color: '#d95d50', unread: 0, avatarDataUrl: profile?.avatarDataUrl, connected: true }
    })
  }

  async getAccessToken(accountId: string): Promise<string> {
    const tokens = await this.store.getTokens(accountId)
    if (!tokens) throw new Error('This Gmail account is no longer connected.')
    if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken
    if (!tokens.refreshToken) throw new Error('Google did not return a refresh token. Reconnect the account.')
    const clientId = await this.store.getGoogleClientId()
    const clientSecret = await this.store.getGoogleClientSecret()
    if (!clientId || !clientSecret) throw new Error('Google OAuth credentials are not configured.')
    const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refreshToken, grant_type: 'refresh_token' }) })
    if (!response.ok) throw await googleError(response, 'Unable to refresh Google authorization')
    const payload = await response.json() as { access_token: string; expires_in: number; scope?: string }
    const refreshed: GoogleTokens = { ...tokens, accessToken: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000, scope: payload.scope ?? tokens.scope }
    await this.store.setTokens(accountId, refreshed)
    return refreshed.accessToken
  }

  async disconnect(accountId: string): Promise<void> {
    const tokens = await this.store.getTokens(accountId)
    const token = tokens?.refreshToken ?? tokens?.accessToken
    if (token) await fetch(REVOKE_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }).catch(() => undefined)
    await this.store.removeTokens(accountId)
  }

  private async fetchProfile(accessToken: string): Promise<{ email: string; name?: string; picture?: string }> {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error('Could not read the connected Gmail profile.')
    return response.json() as Promise<{ email: string; name?: string; picture?: string }>
  }

  private async listenForAuthorization(expectedState: string): Promise<{ redirectUri: string; code: Promise<string>; cancel: () => void }> {
    let resolveCode!: (code: string) => void
    let rejectCode!: (error: Error) => void
    const code = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      response.setHeader('content-type', 'text/html; charset=utf-8')
      if (url.searchParams.get('state') !== expectedState) { response.end('<h1>Authorization rejected</h1><p>Return to Postbird and try again.</p>'); rejectCode(new Error('Google OAuth state validation failed.')); server.close(); return }
      const error = url.searchParams.get('error')
      const value = url.searchParams.get('code')
      if (error || !value) { response.end('<h1>Connection cancelled</h1><p>You can close this window.</p>'); rejectCode(new Error(error ?? 'Google did not return an authorization code.')); server.close(); return }
      response.end('<h1>Gmail connected</h1><p>You can close this window and return to Postbird.</p>')
      resolveCode(value); server.close()
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as AddressInfo).port
    const timeout = setTimeout(() => { rejectCode(new Error('Google authorization timed out.')); server.close() }, 5 * 60_000)
    void code.then(() => clearTimeout(timeout), () => clearTimeout(timeout))
    return { redirectUri: `http://127.0.0.1:${port}`, code, cancel: () => { rejectCode(new Error('Google login was cancelled.')); server.close() } }
  }
}
