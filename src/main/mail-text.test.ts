import { describe, expect, it } from 'vitest'
import { decodeMailText } from './mail-text'

describe('decodeMailText', () => {
  it('decodes HTML entities and removes invisible marketing-email padding', () => {
    const source = 'Save on School Essentials &#128717; &nbsp;&zwnj;&nbsp;&zwnj;&nbsp; 100'
    expect(decodeMailText(source)).toBe('Save on School Essentials 🛍 100')
  })

  it('preserves useful paragraph breaks', () => {
    expect(decodeMailText('Hello&nbsp;Alex\n\n\nNext line')).toBe('Hello Alex\n\nNext line')
  })
})
