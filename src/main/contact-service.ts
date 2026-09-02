import type { ContactProfile } from '../shared/models'
import { GoogleAuth } from './google-auth'
import { MailCache } from './mail-cache'
import { MicrosoftAuth } from './microsoft-auth'

interface GooglePerson {
  names?: Array<{ displayName?: string }>
  emailAddresses?: Array<{ value?: string }>
  photos?: Array<{ url?: string; default?: boolean }>
}

interface OutlookContact {
  id: string
  displayName?: string
  emailAddresses?: Array<{ name?: string; address?: string }>
}

type StoredContact = ContactProfile & { avatar?: { mimeType: string; data: Buffer } }

const validEmail = (value?: string): value is string => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))

async function readAvatar(url: string, token: string): Promise<{ mimeType: string; data: Buffer } | undefined> {
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) return undefined
    const mimeType = response.headers.get('content-type') ?? ''
    if (!mimeType.startsWith('image/')) return undefined
    const data = Buffer.from(await response.arrayBuffer())
    return data.byteLength > 0 && data.byteLength <= 1024 * 1024 ? { mimeType, data } : undefined
  } catch { return undefined }
}

export class ContactService {
  constructor(private google: GoogleAuth, private microsoft: MicrosoftAuth, private cache: MailCache) {}

  async listContacts(accountId: string): Promise<ContactProfile[]> {
    const cached = this.cache.loadContacts(accountId)
    try {
      const contacts = accountId.startsWith('outlook:') ? await this.listOutlook(accountId) : await this.listGoogle(accountId)
      const unique = [...new Map(contacts.map(contact => [contact.email.toLowerCase(), contact])).values()]
      this.cache.saveContacts(accountId, unique)
      return unique.map(({ avatar, ...contact }) => ({ ...contact, avatarDataUrl: avatar ? `data:${avatar.mimeType};base64,${avatar.data.toString('base64')}` : undefined }))
    } catch {
      return cached
    }
  }

  private async listGoogle(accountId: string): Promise<StoredContact[]> {
    const token = await this.google.getAccessToken(accountId)
    const url = new URL('https://people.googleapis.com/v1/people/me/connections')
    url.search = new URLSearchParams({ personFields: 'names,emailAddresses,photos', pageSize: '200', sortOrder: 'LAST_MODIFIED_DESCENDING' }).toString()
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error('Google contacts require People API access and a reconnected account.')
    const payload = await response.json() as { connections?: GooglePerson[] }
    const people = payload.connections ?? []
    const avatars = await Promise.all(people.map((person, index) => {
      const photoUrl = person.photos?.find(photo => !photo.default && photo.url)?.url
      return photoUrl && index < 40 ? readAvatar(photoUrl, token) : undefined
    }))
    const contacts: StoredContact[] = []
    for (const [index, person] of people.entries()) {
      const name = person.names?.[0]?.displayName?.trim()
      for (const item of person.emailAddresses ?? []) {
        if (!validEmail(item.value)) continue
        contacts.push({ name: name || item.value.split('@')[0], email: item.value.toLowerCase(), avatar: avatars[index] })
      }
    }
    return contacts
  }

  private async listOutlook(accountId: string): Promise<StoredContact[]> {
    const token = await this.microsoft.getAccessToken(accountId)
    const response = await fetch('https://graph.microsoft.com/v1.0/me/contacts?$top=200&$select=id,displayName,emailAddresses', { headers: { authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error('Microsoft contacts require Contacts.Read and a reconnected account.')
    const payload = await response.json() as { value?: OutlookContact[] }
    const people = payload.value ?? []
    const avatars = await Promise.all(people.map((person, index) => index < 40 ? readAvatar(`https://graph.microsoft.com/v1.0/me/contacts/${encodeURIComponent(person.id)}/photo/$value`, token) : undefined))
    const contacts: StoredContact[] = []
    for (const [index, person] of people.entries()) {
      for (const item of person.emailAddresses ?? []) {
        if (!validEmail(item.address)) continue
        contacts.push({ name: person.displayName?.trim() || item.name?.trim() || item.address.split('@')[0], email: item.address.toLowerCase(), avatar: avatars[index] })
      }
    }
    return contacts
  }
}
