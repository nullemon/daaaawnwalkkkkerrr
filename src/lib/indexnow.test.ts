import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  KEY_FILE_PATTERN,
  KEY_PATTERN,
  indexNowKeyRefusal,
  isIndexNowKey,
  resolveIndexNowKey,
} from './indexnow'

describe('what counts as an IndexNow key', () => {
  it('accepts the shapes the engines issue', () => {
    // Bing hands out 32 hex characters; a self-generated one usually matches.
    expect(isIndexNowKey('b13095133f25dbe79f5e68795c352c58')).toBe(true)
    expect(isIndexNowKey('ABCDEF0123456789')).toBe(true)
    // The specification allows hyphens and mixed case, so refusing them here
    // would reject a key somebody already has verified elsewhere.
    expect(isIndexNowKey('my-index-now-key-01')).toBe(true)
    expect(isIndexNowKey('a'.repeat(128))).toBe(true)
  })

  it('refuses what the engines will', () => {
    expect(isIndexNowKey('short12')).toBe(false)
    expect(isIndexNowKey('a'.repeat(129))).toBe(false)
    expect(isIndexNowKey('has spaces in it')).toBe(false)
    expect(isIndexNowKey('has/a/slash/init')).toBe(false)
    expect(isIndexNowKey('trailing.dot.txt')).toBe(false)
  })

  it('says what is wrong rather than only that something is', () => {
    expect(indexNowKeyRefusal('short12')).toMatch(/8 to 128 characters; this is 7/)
    expect(indexNowKeyRefusal('abcdefgh/ijkl')).toMatch(/Remove: \//)
  })

  it('treats blank as nothing to refuse — blank means use the shipped key', () => {
    expect(indexNowKeyRefusal('')).toBeNull()
    expect(indexNowKeyRefusal('   ')).toBeNull()
  })
})

describe('which key is live', () => {
  it('prefers what the owner typed', () => {
    expect(
      resolveIndexNowKey({ settings: 'aaaaaaaaaaaaaaaa', env: 'bbbbbbbbbbbbbbbb', shipped: 'cccccccccccccccc' }),
    ).toEqual({ key: 'aaaaaaaaaaaaaaaa', source: 'settings' })
  })

  it('falls back through the environment to the shipped key', () => {
    expect(resolveIndexNowKey({ settings: '', env: 'bbbbbbbbbbbbbbbb', shipped: 'cccccccccccccccc' })).toEqual({
      key: 'bbbbbbbbbbbbbbbb',
      source: 'env',
    })
    expect(resolveIndexNowKey({ settings: null, env: undefined, shipped: 'cccccccccccccccc' })).toEqual({
      key: 'cccccccccccccccc',
      source: 'shipped',
    })
  })

  /*
    Payload hands back '', null or undefined depending on how a field was
    emptied. All three mean the same thing and none of them may take the key
    file down — the docs/COPY.md rule, applied to a value that is not copy.
  */
  it('treats every flavour of empty as "use what shipped"', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(resolveIndexNowKey({ settings: empty, shipped: 'cccccccccccccccc' })?.source).toBe('shipped')
    }
  })

  it('ignores a stored key that is not a key rather than serving nothing', () => {
    // The admin refuses one of these, so it arrived by another door — a direct
    // API write or a restored backup. Falling over would take verification
    // down on all ten hosts for a value nobody can see.
    expect(resolveIndexNowKey({ settings: 'no good', shipped: 'cccccccccccccccc' })).toEqual({
      key: 'cccccccccccccccc',
      source: 'shipped',
    })
  })

  it('has no key at all when nothing supplies one', () => {
    expect(resolveIndexNowKey({})).toBeNull()
  })
})

describe('the key file path', () => {
  it('matches a key with .txt and nothing else', () => {
    expect(KEY_FILE_PATTERN.test('b13095133f25dbe79f5e68795c352c58.txt')).toBe(true)
    expect(KEY_FILE_PATTERN.test('b13095133f25dbe79f5e68795c352c58')).toBe(false)
    expect(KEY_FILE_PATTERN.test('short12.txt')).toBe(false)
  })

  /*
    The reason shape-matching a root path is safe at all. `slugField` strips
    dots, so no wiki slug can ever contain one — which is what keeps a key file
    from being read as a game and a game from shadowing a key file.
  */
  it('never matches a wiki slug', () => {
    for (const slug of ['dawnwalker', 'silent-hill-townfall', 'onimusha-way-of-the-sword', 'companies', 'people']) {
      expect(KEY_FILE_PATTERN.test(slug)).toBe(false)
    }
  })
})

/*
  `tools/indexnow.mjs` is plain node and cannot import this module, so it
  restates the pattern. The two disagreeing is a key the site serves and the
  submitter refuses, or the reverse — and IndexNow reports that as a 422 that
  names neither half. Read the source and pin them.
*/
describe('the submitting script agrees on the pattern', () => {
  it('restates KEY_PATTERN exactly', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'tools', 'indexnow.mjs'), 'utf8')
    const match = source.match(/^const KEY_PATTERN = (.+)$/m)
    expect(match, 'tools/indexnow.mjs no longer declares KEY_PATTERN').toBeTruthy()
    expect(match?.[1]).toBe(String(KEY_PATTERN))
  })
})
