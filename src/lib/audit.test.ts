import { describe, expect, it } from 'vitest'
import {
  badgeCounts,
  entityHref,
  fieldAnchor,
  groupFindings,
  listHref,
  type Finding,
} from './audit'

/**
 * The parts of the audit that can be wrong without anything erroring.
 *
 * The pass itself needs a database and is checked by running
 * `pnpm check:launch`. What is pinned here is everything that turns a finding
 * into something the owner clicks, because every failure mode in this file is
 * silent: a `where` Payload cannot parse shows a list view with every row in
 * it and no error, an anchor Payload does not recognise scrolls nowhere, and a
 * badge that double-counts one field just reads as a bigger number.
 */

const target = (slug: string, href: string, kind: 'collection' | 'global' = 'collection') => ({
  entity: { kind, slug, label: slug },
  href,
})

const finding = (over: Partial<Finding> = {}): Finding => ({
  level: 'warn',
  actor: 'owner',
  area: 'dawnwalker',
  detail: 'no Search Console token — each subdomain is its own property',
  count: 1,
  ...over,
})

describe('fieldAnchor', () => {
  it('matches the id Payload puts on a field input', () => {
    /*
      `field-${path.replace(/\./g, '__')}` — TextInput in @payloadcms/ui. If
      this drifts, the anchor scrolls nowhere and the row still looks like a
      deep link, which is the failure worth a test.
    */
    expect(fieldAnchor('siteName')).toBe('#field-siteName')
    expect(fieldAnchor('verification.google')).toBe('#field-verification__google')
    expect(fieldAnchor('theme.hero')).toBe('#field-theme__hero')
  })
})

describe('listHref', () => {
  it('serialises an AND group the way the list view parses it', () => {
    expect(listHref('authors', [[{ provisional: { equals: true } }]])).toBe(
      '/admin/collections/authors?limit=50&where[or][0][and][0][provisional][equals]=true',
    )
  })

  it('expresses "empty or never set" as two OR groups', () => {
    /*
      Payload hands back '' or null or undefined depending on how a field was
      emptied, so a filter testing only one of them shows a list that looks
      complete and is not — and the count beside it, which tests both, would
      then disagree with the list it links to.
    */
    expect(
      listHref('media', [[{ credit: { exists: false } }], [{ credit: { equals: '' } }]]),
    ).toBe(
      '/admin/collections/media?limit=50' +
        '&where[or][0][and][0][credit][exists]=false' +
        '&where[or][1][and][0][credit][equals]=',
    )
  })

  it('encodes a dotted field path and an operand with URL characters', () => {
    expect(listHref('guides', [[{ 'sources.url': { exists: false } }]])).toContain(
      'where[or][0][and][0][sources.url][exists]=false',
    )
    expect(listHref('games', [[{ slug: { equals: 'a b&c' } }]])).toContain(
      '[slug][equals]=a%20b%26c',
    )
  })

  it('still names the collection when there is nothing to filter on', () => {
    expect(listHref('corrections')).toBe('/admin/collections/corrections?limit=50')
  })
})

describe('entityHref', () => {
  it('knows a global from a collection', () => {
    expect(entityHref({ kind: 'global', slug: 'site-settings', label: 'x' })).toBe(
      '/admin/globals/site-settings',
    )
    expect(entityHref({ kind: 'collection', slug: 'authors', label: 'x' })).toBe(
      '/admin/collections/authors',
    )
  })
})

describe('groupFindings', () => {
  it('collapses one job across eight wikis into one row with eight places', () => {
    const wikis = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const rows = groupFindings(
      wikis.map((slug, index) =>
        finding({ area: slug, target: target('games', `/admin/collections/games/${index}`) }),
      ),
      'owner',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(8)
    expect(rows[0].places.map((place) => place.area)).toEqual(wikis)
    // They share a home, so the row can carry one and the nav can badge it.
    expect(rows[0].entity?.slug).toBe('games')
  })

  it('keeps the real total rather than the number of rows', () => {
    /*
      "36 of 36 contributors are placeholders" is 36. A row saying 1 because
      there is one finding is a count wrong in the reassuring direction, which
      this project has shipped enough of.
    */
    const rows = groupFindings(
      [finding({ detail: '36 of 36 are placeholders', count: 36, area: 'authors' })],
      'owner',
    )
    expect(rows[0].count).toBe(36)
  })

  it('never lists an informational answer as a task', () => {
    // "serves on companies.example.com" is an answer. A list that mixes
    // answers into tasks stops being a list of tasks.
    const rows = groupFindings(
      [finding({ actor: 'info', detail: 'serves on x.example.com' })],
      'info',
    )
    expect(rows).toEqual([])
  })

  it('separates who can act, so blocked work is never offered as a chore', () => {
    const all = [
      finding({ actor: 'owner', detail: 'no analytics configured' }),
      finding({ actor: 'editorial', detail: 'no hero art' }),
      finding({ actor: 'blocked', detail: '78 of 93 quests have no published segment cost', count: 78 }),
    ]
    expect(groupFindings(all, 'owner').map((row) => row.detail)).toEqual([
      'no analytics configured',
    ])
    expect(groupFindings(all, 'editorial').map((row) => row.detail)).toEqual(['no hero art'])
    expect(groupFindings(all, 'blocked').map((row) => row.count)).toEqual([78])
  })

  it('drops the shared entity when the places do not share one', () => {
    // Two findings with the same sentence but different homes. Badging one of
    // them would put a count on a nav entry that cannot clear it.
    const rows = groupFindings(
      [
        finding({ area: 'companies', target: target('site-settings', '/a', 'global') }),
        finding({ area: 'dawnwalker', target: target('games', '/b') }),
      ],
      'owner',
    )
    expect(rows[0].entity).toBeUndefined()
  })

  it('puts the blocking tier first and the biggest count above the rest', () => {
    const rows = groupFindings(
      [
        finding({ level: 'note', detail: 'small note', count: 2 }),
        finding({ level: 'note', detail: 'big note', count: 40 }),
        finding({ level: 'blocking', detail: 'legal details are stand-ins' }),
      ],
      'owner',
    )
    expect(rows.map((row) => row.detail)).toEqual([
      'legal details are stand-ins',
      'big note',
      'small note',
    ])
  })
})

describe('badgeCounts', () => {
  it('counts one field once however many findings point at it', () => {
    /*
      The companies host and the people host both report a missing Search
      Console token and both point at the one network field. Two badges' worth
      of alarm for one empty box.
    */
    const badges = badgeCounts([
      finding({
        area: 'companies',
        target: target('site-settings', '/admin/globals/site-settings#field-verification__google', 'global'),
      }),
      finding({
        area: 'people',
        target: target('site-settings', '/admin/globals/site-settings#field-verification__google', 'global'),
      }),
    ])
    expect(badges).toEqual([
      { entity: { kind: 'global', slug: 'site-settings', label: 'site-settings' }, count: 1 },
    ])
  })

  it('adds up distinct fields behind the same nav entry', () => {
    const badges = badgeCounts([
      finding({ area: 'a', target: target('games', '/admin/collections/games/1#field-a') }),
      finding({ area: 'b', target: target('games', '/admin/collections/games/2#field-a') }),
      finding({ area: 'c', target: target('authors', '/admin/collections/authors?x'), count: 36 }),
    ])
    expect(badges).toEqual([
      { entity: { kind: 'collection', slug: 'authors', label: 'authors' }, count: 36 },
      { entity: { kind: 'collection', slug: 'games', label: 'games' }, count: 2 },
    ])
  })

  it('never badges blocked work', () => {
    // A badge is a chore. Seventy-eight quests nobody has a source for is not.
    expect(
      badgeCounts([
        finding({ actor: 'blocked', count: 78, target: target('quests', '/admin/collections/quests') }),
      ]),
    ).toEqual([])
  })

  it('ignores a finding with nowhere to go', () => {
    // NEXT_PUBLIC_SITE_URL is an environment variable. A badge on a nav entry
    // that cannot set it is a badge that can never be cleared.
    expect(badgeCounts([finding({ target: undefined })])).toEqual([])
  })
})
