import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ConnectedAccount } from '../shared/models'
import { LocalStore, type GoogleTokens } from './local-store'
import { MailCache } from './mail-cache'

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const SCOPES = 'openid profile email offline_access User.Read Mail.ReadWrite Mail.Send'
const encode = (value: Buffer): string => value.toString('base64url')

export class MicrosoftAuth {
  constructor(private store: LocalStore, private cache?: MailCache) {}

  async connect(clientId?: string): Promise<ConnectedAccount> {
    const configured = clientId?.trim() || await this.store.getMicrosoftClientId()
    if (!configured || !/^[0-9a-f-]{30,40}$/i.test(configured)) throw new Error('A valid Microsoft desktop application client ID is required.')
    if (clientId?.trim()) await this.store.setMicrosoftClientId(configured)
    const verifier = encode(randomBytes(48)); const challenge = encode(createHash('sha256').update(verifier).digest()); const state = encode(randomBytes(24))
    const callback = await this.listen(state)
    const authorize = new URL(`${AUTHORITY}/authorize`)
    authorize.search = new URLSearchParams({ client_id: configured, response_type: 'code', redirect_uri: callback.redirectUri, response_mode: 'query', scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString()
    await shell.openExternal(authorize.toString())
    const code = await callback.code
    const response = await fetch(`${AUTHORITY}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: configured, code, redirect_uri: callback.redirectUri, grant_type: 'authorization_code', code_verifier: verifier, scope: SCOPES }) })
    if (!response.ok) throw new Error(`Microsoft token exchange failed (${response.status}).`)
    const payload = await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string }
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', { headers: { authorization: `Bearer ${payload.access_token}` } })
    if (!profileResponse.ok) throw new Error('Could not read the connected Microsoft profile.')
    const profile = await profileResponse.json() as { displayName?: string; mail?: string; userPrincipalName: string }
    const email = (profile.mail || profile.userPrincipalName).toLowerCase(); const accountId = `outlook:${email}`
    await this.store.setTokens(accountId, { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000, scope: payload.scope })
    let avatar: { mimeType: string; data: Buffer } | undefined
    const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', { headers: { authorization: `Bearer ${payload.access_token}` } })
    if (photoResponse.ok) { const data = Buffer.from(await photoResponse.arrayBuffer()); if (data.byteLength < 5 * 1024 * 1024) avatar = { mimeType: photoResponse.headers.get('content-type') ?? 'image/jpeg', data } }
    this.cache?.saveAccountProfile(accountId, 'outlook', email, { name: profile.displayName || email.split('@')[0] }, avatar)
    return { id: accountId, provider: 'outlook', name: profile.displayName || email.split('@')[0], email, color: '#3977c9', unread: 0, avatarDataUrl: avatar ? `data:${avatar.mimeType};base64,${avatar.data.toString('base64')}` : undefined, connected: true }
  }

  async listAccounts(): Promise<ConnectedAccount[]> { return (await this.store.listTokenAccountIds()).filter(id => id.startsWith('outlook:')).map(id => { const email = id.slice(8); const profile = this.cache?.getAccountProfile(id, email); return { id, provider: 'outlook', name: profile?.name ?? email.split('@')[0], email, color: '#3977c9', unread: 0, avatarDataUrl: profile?.avatarDataUrl, connected: true } }) }
  async disconnect(accountId: string): Promise<void> { await this.store.removeTokens(accountId) }

  async getAccessToken(accountId: string): Promise<string> {
    const tokens = await this.store.getTokens(accountId); if (!tokens) throw new Error('This Outlook account is no longer connected.')
    if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken
    if (!tokens.refreshToken) throw new Error('Reconnect this Microsoft account.')
    const clientId = await this.store.getMicrosoftClientId(); if (!clientId) throw new Error('Microsoft OAuth is not configured.')
    const response = await fetch(`${AUTHORITY}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, refresh_token: tokens.refreshToken, grant_type: 'refresh_token', scope: SCOPES }) })
    if (!response.ok) throw new Error(`Microsoft token refresh failed (${response.status}).`)
    const payload = await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string }
    const next: GoogleTokens = { accessToken: payload.access_token, refreshToken: payload.refresh_token ?? tokens.refreshToken, expiresAt: Date.now() + payload.expires_in * 1000, scope: payload.scope }
    await this.store.setTokens(accountId, next); return next.accessToken
  }

  private listen(expectedState: string): Promise<{ redirectUri: string; code: Promise<string> }> {
    let resolveCode!: (value: string) => void; let rejectCode!: (error: Error) => void
    const code = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
    return new Promise(resolve => {
      const server = createServer((request, response) => { const url = new URL(request.url ?? '/', 'http://127.0.0.1'); const value = url.searchParams.get('code'); const state = url.searchParams.get('state'); response.setHeader('content-type', 'text/html'); if (state !== expectedState || !value) { response.end('<h1>Microsoft connection cancelled</h1>'); rejectCode(new Error('Microsoft authorization was cancelled.')) } else { response.end('<h1>Outlook connected</h1><p>Return to SABLE.</p>'); resolveCode(value) } server.close() })
      server.listen(0, '127.0.0.1', () => resolve({ redirectUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth/microsoft`, code }))
    })
  }
}
