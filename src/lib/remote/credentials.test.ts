import { describe, expect, it } from 'vitest'
import {
  CODE_CHARS,
  CODE_LENGTH,
  codesMatch,
  fingerprint,
  formatCode,
  hashToken,
  newCode,
  newToken,
  normaliseCode,
  tokenMatches,
} from './credentials'

describe('the code alphabet', () => {
  it('is the exact string, pinned', () => {
    expect(CODE_CHARS).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    expect(CODE_CHARS.length).toBe(31)
  })

  it('has no visually ambiguous glyph in it', () => {
    /*
      The whole reason this alphabet exists. A person reads the code off a
      terminal and types it into a browser, and `0` for `O` is not a security
      problem — it is somebody deciding the tool is broken.
    */
    for (const character of ['0', 'O', '1', 'I', 'L']) {
      expect(CODE_CHARS.includes(character), character).toBe(false)
    }
  })

  it('has no duplicate character', () => {
    expect(new Set(CODE_CHARS).size).toBe(CODE_CHARS.length)
  })
})

describe('generating a code', () => {
  it('is sixteen characters from the alphabet', () => {
    for (let run = 0; run < 50; run += 1) {
      const code = newCode()
      expect(code.length).toBe(CODE_LENGTH)
      for (const character of code) expect(CODE_CHARS.includes(character), code).toBe(true)
    }
  })

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => newCode()))
    expect(codes.size).toBe(200)
  })

  it('groups into fours for reading', () => {
    expect(formatCode('ABCDEFGHJKMNPQRS'.slice(0, 16))).toBe('ABCD-EFGH-JKMN-PQRS')
  })
})

describe('what somebody typed', () => {
  it('accepts the grouped form, the bare form, and either case', () => {
    const stored = 'ABCDEFGHJKMNPQRS'
    expect(codesMatch('ABCD-EFGH-JKMN-PQRS', stored)).toBe(true)
    expect(codesMatch('abcdefghjkmnpqrs', stored)).toBe(true)
    expect(codesMatch('  abcd efgh jkmn pqrs  ', stored)).toBe(true)
  })

  it('refuses a wrong code, a short one, and an empty one', () => {
    const stored = 'ABCDEFGHJKMNPQRS'
    expect(codesMatch('ABCDEFGHJKMNPQRT', stored)).toBe(false)
    expect(codesMatch('ABCD', stored)).toBe(false)
    expect(codesMatch('', stored)).toBe(false)
    expect(codesMatch('----', stored)).toBe(false)
  })

  it('refuses when the stored code is missing, rather than matching nothing', () => {
    expect(codesMatch('', '')).toBe(false)
    expect(codesMatch('ABCDEFGHJKMNPQRS', '')).toBe(false)
  })

  it('drops characters outside the alphabet rather than rejecting the input', () => {
    // `O` is not in the alphabet, so it is dropped — which makes this too short
    // and therefore a wrong code, along one path rather than two.
    expect(normaliseCode('ABCD-EFGH-JKMN-PQRO')).toBe('ABCDEFGHJKMNPQR')
    expect(codesMatch('ABCD-EFGH-JKMN-PQRO', 'ABCDEFGHJKMNPQRS')).toBe(false)
  })
})

describe('session tokens', () => {
  const secret = 'a'.repeat(40)

  it('are long, random and unique', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => newToken()))
    expect(tokens.size).toBe(100)
    expect(newToken().length).toBeGreaterThanOrEqual(43)
  })

  it('hash to the same value every time, and to a different one per secret', () => {
    const token = newToken()
    expect(hashToken(token, secret)).toBe(hashToken(token, secret))
    expect(hashToken(token, secret)).not.toBe(hashToken(token, 'b'.repeat(40)))
  })

  it('match their own hash and nothing else', () => {
    const token = newToken()
    const stored = hashToken(token, secret)
    expect(tokenMatches(token, stored, secret)).toBe(true)
    expect(tokenMatches(newToken(), stored, secret)).toBe(false)
    // Rotating PAYLOAD_SECRET ends every live session. That is the intent, so
    // it is pinned rather than left to be discovered.
    expect(tokenMatches(token, stored, 'b'.repeat(40))).toBe(false)
  })

  it('does not throw on an empty or malformed stored hash', () => {
    expect(tokenMatches(newToken(), '', secret)).toBe(false)
    expect(tokenMatches(newToken(), 'short', secret)).toBe(false)
  })
})

describe('the device fingerprint', () => {
  it('is stable, readable and different per key', () => {
    const one = fingerprint('AAAA')
    expect(one).toBe(fingerprint('AAAA'))
    expect(one).not.toBe(fingerprint('AAAB'))
    expect(one).toMatch(/^[0-9a-f]{4}(:[0-9a-f]{4}){7}$/)
  })
})
