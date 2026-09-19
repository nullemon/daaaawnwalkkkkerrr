import { describe, expect, it } from 'vitest'
import {
  badgeCounts,
  entityHref,
  fieldAnchor,
  groupFindings,
  listHref,
  type Finding,
} from './audit'
import { ADMIN_PATH } from './admin-path'
import fs from 'node:fs'
import path from 'node:path'
import { GUARDS_EMPTY_INDEX, LISTING_LIMIT } from './audit'
import { SECTION_PATH } from './tenancy'

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
      `${ADMIN_PATH}/collections/authors?limit=50&where[or][0][and][0][provisional][equals]=true`,
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
      `${ADMIN_PATH}/collections/media?limit=50` +
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
    expect(listHref('corrections')).toBe(`${ADMIN_PATH}/collections/corrections?limit=50`)
  })
})

describe('entityHref', () => {
  it('knows a global from a collection', () => {
    expect(entityHref({ kind: 'global', slug: 'site-settings', label: 'x' })).toBe(
      `${ADMIN_PATH}/globals/site-settings`,
    )
    expect(entityHref({ kind: 'collection', slug: 'authors', label: 'x' })).toBe(
      `${ADMIN_PATH}/collections/authors`,
    )
  })
})

describe('groupFindings', () => {
  it('collapses one job across eight wikis into one row with eight places', () => {
    const wikis = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const rows = groupFindings(
      wikis.map((slug, index) =>
        finding({ area: slug, target: target('games', `${ADMIN_PATH}/collections/games/${index}`) }),
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
        target: target('site-settings', `${ADMIN_PATH}/globals/site-settings#field-verification__google`, 'global'),
      }),
      finding({
        area: 'people',
        target: target('site-settings', `${ADMIN_PATH}/globals/site-settings#field-verification__google`, 'global'),
      }),
    ])
    expect(badges).toEqual([
      { entity: { kind: 'global', slug: 'site-settings', label: 'site-settings' }, count: 1 },
    ])
  })

  it('adds up distinct fields behind the same nav entry', () => {
    const badges = badgeCounts([
      finding({ area: 'a', target: target('games', `${ADMIN_PATH}/collections/games/1#field-a`) }),
      finding({ area: 'b', target: target('games', `${ADMIN_PATH}/collections/games/2#field-a`) }),
      finding({ area: 'c', target: target('authors', `${ADMIN_PATH}/collections/authors?x`), count: 36 }),
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
        finding({ actor: 'blocked', count: 78, target: target('quests', `${ADMIN_PATH}/collections/quests`) }),
      ]),
    ).toEqual([])
  })

  it('ignores a finding with nowhere to go', () => {
    // NEXT_PUBLIC_SITE_URL is an environment variable. A badge on a nav entry
    // that cannot set it is a badge that can never be cleared.
    expect(badgeCounts([finding({ target: undefined })])).toEqual([])
  })
})

/**
 * Two constants that restate a fact living in a route file, pinned against it.
 *
 * `GUARDS_EMPTY_INDEX` and `LISTING_LIMIT` are normally the thing this module
 * exists to avoid — a second copy of something. They cannot be imported: the
 * routes are Next.js server components that pull in the Payload config, and a
 * test that booted Payload to read a number is a test nobody runs. So they are
 * checked against the source of both ends instead, which needs no database and
 * fails on the commit that changes either one.
 *
 * Same shape as `sitemap-images.test.ts`, and for the same reason. The failure
 * it guards against is silent in both directions: a route that stops guarding
 * is a live page nobody links to, and a constant that goes stale is a whole
 * pass reported as fine.
 */
describe('GUARDS_EMPTY_INDEX matches what the section indexes actually do', () => {
  const root = path.resolve(__dirname, '..')

  const indexRoute = (collection: string): string =>
    path.join(
      root,
      'app',
      '(frontend)',
      '[game]',
      SECTION_PATH[collection as keyof typeof SECTION_PATH].replace(/^\//, ''),
      'page.tsx',
    )

  it('names a route for every game-scoped section', () => {
    // A mapping that silently found none would make every check below pass by
    // not running - the failure `seed:topics` and `seed:cite` shipped with.
    expect(Object.keys(SECTION_PATH).length).toBe(16)
    for (const collection of Object.keys(SECTION_PATH)) {
      expect(fs.existsSync(indexRoute(collection))).toBe(true)
    }
  })

  for (const collection of Object.keys(SECTION_PATH)) {
    it(`${collection} ${GUARDS_EMPTY_INDEX.has(collection as never) ? 'answers 404' : 'answers 200'} on an empty collection`, () => {
      const source = fs.readFileSync(indexRoute(collection), 'utf8')
      /*
        `if (endings.length === 0) notFound()` - the guard is always a length
        test on the collection this index is for, immediately followed by
        `notFound()`. A `notFound()` anywhere else in the file would be a false
        positive, which is why this matches the whole shape rather than the
        word.
      */
      const guarded = /\.length === 0\)\s*notFound\(\)/.test(source)
      expect(guarded).toBe(GUARDS_EMPTY_INDEX.has(collection as never))
    })
  }

  it('is every section, which is the state the orphan finding was written for', () => {
    // Nineteen live pages nothing linked to before this: /maps on all eight
    // wikis, /achievements on the four whose game is not out, /quests on four,
    // and one each of /regions, /enemies and /items.
    expect(GUARDS_EMPTY_INDEX.size).toBe(Object.keys(SECTION_PATH).length)
  })
})

describe('LISTING_LIMIT matches the limit each index actually passes', () => {
  const root = path.resolve(__dirname, '..')

  it('is the default every section index inherits from getAll', () => {
    const source = fs.readFileSync(path.join(root, 'lib', 'payload.ts'), 'utf8')
    expect(source).toContain(`options.limit ?? ${LISTING_LIMIT.section}`)
  })

  for (const [host, limit] of [
    ['companies', LISTING_LIMIT.companies],
    ['people', LISTING_LIMIT.people],
  ] as const) {
    it(`${host} reads ${limit}`, () => {
      const source = fs.readFileSync(
        path.join(root, 'app', '(frontend)', host, 'page.tsx'),
        'utf8',
      )
      expect(source).toContain(`limit: ${limit}`)
    })
  }
})
