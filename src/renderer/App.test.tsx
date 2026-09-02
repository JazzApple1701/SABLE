// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App, FormattedParagraph } from './App'
import { buildEmailDocument } from './email-html'

describe('Postbird sample interface', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('filters the unified inbox by search text', () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search mail' }), { target: { value: 'Copenhagen' } })
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    expect(screen.getByText('The Copenhagen notes', { selector: '.subject-line' })).toBeInTheDocument()
  })

  it('opens and closes the keyboard-accessible composer', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New message' }))
    expect(screen.getByRole('dialog', { name: 'New message' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close composer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('suggests contacts and creates removable To, Cc, and Bcc recipient capsules', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New message' }))
    const to = screen.getByRole('textbox', { name: 'To recipients' })
    fireEvent.change(to, { target: { value: 'Maya' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /Maya Chen.*maya@fieldnotes\.studio/i }))
    expect(screen.getByRole('button', { name: 'Remove maya@fieldnotes.studio' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cc · Bcc' }))
    const cc = screen.getByRole('textbox', { name: 'Cc recipients' })
    fireEvent.change(cc, { target: { value: 'copy@example.com' } })
    fireEvent.keyDown(cc, { key: 'Enter' })
    const bcc = screen.getByRole('textbox', { name: 'Bcc recipients' })
    fireEvent.change(bcc, { target: { value: 'private@example.com' } })
    fireEvent.keyDown(bcc, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Remove copy@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove private@example.com' })).toBeInTheDocument()
  })

  it('persists the selected color theme locally', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('keeps account mailboxes collapsed until the account tree is opened', () => {
    render(<App />)
    const sidebar = screen.getByRole('complementary', { name: 'Mailboxes' })
    expect(within(sidebar).queryByText('alex@example.com')).not.toBeInTheDocument()
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Accounts' }))
    fireEvent.click(within(sidebar).getByRole('button', { name: /Personal alex@example.com/i }))
    expect(within(sidebar).getAllByRole('button', { name: 'Drafts' })).toHaveLength(2)
    expect(within(sidebar).getAllByRole('button', { name: 'Deleted' })).toHaveLength(2)
  })

  it('persists the individual-account mailbox layout from settings', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('radio', { name: /Individual accounts/i }))
    expect(localStorage.getItem('mailbox-layout')).toBe('accounts')
    expect(screen.queryByText('Unified mailboxes')).not.toBeInTheDocument()
  })

  it('explains secure Google setup before starting OAuth', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail account/i }))
    expect(screen.getByRole('dialog', { name: 'Connect Gmail' })).toBeInTheDocument()
    expect(screen.getByText(/not your Gmail password/i)).toBeInTheDocument()
  })

  it('renders plain-text email emphasis without exposing markdown markers', () => {
    render(<FormattedParagraph text="**Good Morning!** The awareness fund is open." />)
    expect(screen.getByText('Good Morning!').tagName).toBe('STRONG')
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
  })

  it('opens and closes the temporary attachment quick view', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Copenhagen field notes\.pdf/i }))
    expect(screen.getByRole('complementary', { name: 'Attachment quick view' })).toBeInTheDocument()
    expect(screen.getByText(/connected account/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close quick view' }))
    expect(screen.queryByRole('complementary', { name: 'Attachment quick view' })).not.toBeInTheDocument()
  })

  it('wraps visual email HTML in a restrictive content policy', () => {
    const document = buildEmailDocument('<h1>Newsletter</h1><script>alert(1)</script>')
    expect(document).toContain("default-src 'none'")
    expect(document).toContain('form-action')
    expect(document).toContain('<h1>Newsletter</h1>')
    expect(document).toContain('img-src data: blob: https:')
    expect(buildEmailDocument('<img src="https://example.com/a.png">', false)).not.toContain('img-src data: blob: https:')
  })
})
