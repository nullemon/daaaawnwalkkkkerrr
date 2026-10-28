import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { hasWikiAssets, wikiAssetsFor, wikiIcon, wikisWithoutAssets } from './wiki-assets'

/*
  Against the real `public/`, deliberately. The failure this module exists for
  was a path built from a slug alone; a test that mocked the disk would be
  testing that the mock agrees with itself.
*/
describe('wiki assets', () => {
  it('finds the set a wiki actually has on disk', () => {
    expect(fs.existsSync('public/wiki-assets/dawnwalker/icon-32.png')).toBe(true)
    expect(hasWikiAssets('dawnwalker')).toBe(true)
    expect(wikiIcon('dawnwalker')).toBe('/wiki-assets/dawnwalker/icon-32.png')
    expect(wikiAssetsFor('dawnwalker')).toEqual({
      icon32: '/wiki-assets/dawnwalker/icon-32.png',
      icon512: '/wiki-assets/dawnwalker/icon-512.png',
      apple: '/wiki-assets/dawnwalker/apple-touch-icon.png',
      og: '/wiki-assets/dawnwalker/og.jpg',
      own: true,
    })
  })

  it('falls back to the network set for a wiki with no folder, and to no icon at all in a list', () => {
    expect(hasWikiAssets('no-such-wiki-ever')).toBe(false)
    expect(wikiIcon('no-such-wiki-ever')).toBeNull()
    const assets = wikiAssetsFor('no-such-wiki-ever')
    expect(assets.own).toBe(false)
    for (const file of [assets.icon32, assets.icon512, assets.apple, assets.og]) {
      // Every fallback is a file that is really in public/, or the fallback is a second 404.
      expect(fs.existsSync('public' + file)).toBe(true)
    }
  })

  it('names the wikis that would otherwise 404', () => {
    expect(wikisWithoutAssets(['dawnwalker', 'no-such-wiki-ever'])).toEqual(['no-such-wiki-ever'])
  })
})
