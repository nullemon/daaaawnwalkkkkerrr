import { describe, expect, it } from 'vitest'
import { networkName, oneLine, siteSettings } from './email-copy'

describe('oneLine', () => {
  /*
    The reason this function exists. A reader's 200-character summary becomes a
    `Subject:` header, and a carriage return inside a header is where somebody
    else's headers begin — a Bcc, for preference. Collapsing all whitespace is
    what removes the CR and the LF; the tidier line length is a side effect.
  */
  it('flattens a newline that would start a header of its own', () => {
    expect(oneLine('Bakir\r\nBcc: someone@evil.example')).toBe('Bakir Bcc: someone@evil.example')
    expect(oneLine('one\ttwo\n\nthree')).toBe('one two three')
  })

  it('trims and truncates with an ellipsis rather than mid-word silence', () => {
    expect(oneLine('  padded  ')).toBe('padded')
    expect(oneLine('abcdefghij', 5)).toBe('abcd…')
    expect(oneLine('abcde', 5)).toBe('abcde')
  })
})

describe('networkName', () => {
  /*
    Falls back to nothing, never to a name. Eight wikis share one account
    system, so a reset email reaches readers who have never heard of
    Dawnwalker; a default here would be the Regions index headed "Vale
    Sangora", delivered by mail.
  */
  it('is empty when the database will not answer', async () => {
    const broken = { findGlobal: async () => Promise.reject(new Error('no db')) }
    await expect(networkName(broken)).resolves.toBe('')
    await expect(siteSettings(broken)).resolves.toBeNull()
  })

  it('is empty when the field is blank or is not a string', async () => {
    await expect(networkName({ findGlobal: async () => ({ siteName: '   ' }) })).resolves.toBe('')
    await expect(networkName({ findGlobal: async () => ({}) })).resolves.toBe('')
    await expect(networkName({ findGlobal: async () => ({ siteName: 7 }) })).resolves.toBe('')
  })

  it('is the trimmed name when there is one', async () => {
    await expect(networkName({ findGlobal: async () => ({ siteName: ' Vellum ' }) })).resolves.toBe(
      'Vellum',
    )
  })
})
