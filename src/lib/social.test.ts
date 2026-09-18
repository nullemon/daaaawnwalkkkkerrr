import fs from 'fs'
import path from 'path'
import type { ResolvingMetadata } from 'next'
import { describe, expect, it } from 'vitest'
import { SECTION_PATH } from './tenancy'
import { SOCIAL_LOCALE, hostCard, recordImage, socialMeta } from './social'

/** A parent whose card is a wiki's, which is what every page under one inherits. */
const wikiParent = (
  images: unknown[] = [
    { url: 'https://w.example.com/og.jpg', width: 1200, height: 630, alt: 'Key art' },
  ],
) =>
  Promise.resolve({
    openGraph: { siteName: 'Dawnwalker Wiki', locale: SOCIAL_LOCALE, images },
  }) as unknown as ResolvingMetadata

const noParent = () => Promise.resolve({ openGraph: null }) as unknown as ResolvingMetadata

/*
  `Metadata['openGraph']` is a union discriminated on `type`, so reading `type`
  off it is a compile error until it is narrowed - and narrowing it in a test
  would assert the shape the test is there to check. Read as a plain bag
  instead: these assertions are about which tags reach the document.
*/
type Card = { type?: string; siteName?: string; locale?: string; url?: unknown; images?: unknown }
const og = (meta: { openGraph?: unknown }) => meta.openGraph as Card
const tw = (meta: { twitter?: unknown }) => meta.twitter as { card?: string; images?: unknown }

describe('recordImage', () => {
  it('never shares a generated emblem', () => {
    /*
      The six collections in `GENERATED_ART` have no photographic art and will
      not get any. What they carry is an emblem drawn from the record's slug,
      which depicts nothing on purpose - so an `og:image` of one tells somebody
      scrolling Discord that they are looking at a picture of Walking Fortress.
      Same rule the image sitemap applies, read from the same set.
    */
    const emblem = { url: '/api/media/file/walking-fortress.png', width: 512, height: 512 }
    for (const collection of [
      'perks',
      'endings',
      'builds',
      'courts',
      'court-activities',
      'skill-trees',
    ]) {
      expect(recordImage(collection, emblem)).toBeNull()
    }
  })

  it('is the picture the page renders, with its own dimensions', () => {
    expect(
      recordImage('characters', {
        url: '/api/media/file/coen.jpg',
        width: 800,
        height: 1200,
        alt: 'Coen, hooded, at dusk',
      }),
    ).toEqual({
      url: '/api/media/file/coen.jpg',
      width: 800,
      height: 1200,
      alt: 'Coen, hooded, at dusk',
    })
  })

  it('is nothing for an unpopulated upload', () => {
    // At depth 0 an upload field is an id, and an id is not a picture. The
    // detail routes read at depth 1 for exactly this reason.
    expect(recordImage('characters', 1234)).toBeNull()
    expect(recordImage('items', null)).toBeNull()
    expect(recordImage('items', {})).toBeNull()
  })

  it('leaves alt out rather than inventing one', () => {
    /*
      `og:image:alt` describes the picture. Falling back to the record's title
      would have this site assert what the photograph shows, which is the claim
      `PageHeader` and `docs/ASSETS.md` already refuse to make.
    */
    expect(recordImage('items', { url: '/a.jpg', alt: '  ' })?.alt).toBeUndefined()
  })
})

describe('socialMeta', () => {
  it('carries the host card through when the page has no picture of its own', async () => {
    const meta = await socialMeta(wikiParent(), { path: '/quests/bad-blood' })
    expect(og(meta).siteName).toBe('Dawnwalker Wiki')
    expect(og(meta).images).toEqual([
      { url: 'https://w.example.com/og.jpg', width: 1200, height: 630, alt: 'Key art' },
    ])
  })

  it('writes one picture to both tag families', async () => {
    /*
      The regression this file exists for. The guide route set its own
      `og:image` and left `twitter:image` inherited, so one page offered
      Facebook the article's picture and X the wiki's key art - two different
      pictures for one URL, from one route, and nothing anywhere said so.
    */
    const image = { url: '/api/media/file/anca-guide.jpg', width: 1600, height: 900 }
    const meta = await socialMeta(wikiParent(), {
      path: '/guides/anca-guide',
      image,
      type: 'article',
    })
    expect(og(meta).images).toEqual([image])
    expect(tw(meta).images).toEqual([image])
    expect(og(meta).type).toBe('article')
  })

  it('restates the whole card rather than only the part it changes', async () => {
    /*
      Next merges metadata shallowly: a segment that sets `openGraph` replaces
      its parent's outright. Setting only `images` is how 408 guides lost
      `og:site_name`, `og:type` and `og:locale`, and how the two with no lead
      image came to serve no Open Graph tags at all.
    */
    const meta = await socialMeta(wikiParent(), { path: '/guides/x', image: { url: '/a.jpg' } })
    expect(og(meta).siteName).toBe('Dawnwalker Wiki')
    expect(og(meta).locale).toBe(SOCIAL_LOCALE)
    expect(og(meta).type).toBe('website')
  })

  it('is a complete card even where the parent declared none', async () => {
    const meta = await socialMeta(noParent(), { path: '/about' })
    expect(og(meta).type).toBe('website')
    expect(og(meta).url).toBe('/about')
    expect(tw(meta).card).toBe('summary_large_image')
  })

  it('names the page in og:url, which is what Facebook and Reddit key on', async () => {
    const meta = await socialMeta(wikiParent(), { path: '/characters/coen' })
    expect(og(meta).url).toBe('/characters/coen')
  })

  it('normalises a parent image given as a bare string', async () => {
    // `twitter.images` was declared as `['/og.png']` on three hosts while the
    // Open Graph half carried dimensions and alt text, so both shapes reach
    // here and both have to come out the same.
    const meta = await socialMeta(wikiParent(['/og.png']), { path: '/' })
    expect(og(meta).images).toEqual([{ url: '/og.png' }])
    expect(tw(meta).images).toEqual([{ url: '/og.png' }])
  })
})

describe('hostCard', () => {
  it('states a locale Open Graph accepts', () => {
    /*
      Every host shipped `locale: 'en'`. Open Graph wants
      `language_TERRITORY`; a bare language is malformed and Facebook's
      debugger rejects it, so ten hosts were publishing a tag no consumer could
      use.
    */
    expect(SOCIAL_LOCALE).toMatch(/^[a-z]{2}_[A-Z]{2}$/)
  })

  it('gives the two tag families the same picture', () => {
    const card = hostCard({
      siteName: 'Vellum',
      image: { url: '/og.png', width: 1200, height: 630, alt: 'Vellum' },
    })
    expect(tw(card).images).toEqual(og(card).images)
  })

  it('declares no url, because every page under it would inherit one', () => {
    // A layout's metadata is what every page under it inherits, so an `og:url`
    // here would file every article on the host as the host's front page.
    const card = hostCard({ siteName: 'Vellum', image: { url: '/og.png' } })
    expect('url' in og(card)).toBe(false)
  })
})

/**
 * The half no unit test can infer: that the routes actually go through here.
 *
 * Nothing about a hand-written `openGraph:` in a route is a type error. It
 * compiles, it renders, and what it does is silently delete the four keys the
 * layout set one segment up - which is exactly what happened, on 408 pages,
 * for as long as guides have had pictures. So the check reads the source.
 */
describe('every route builds its card through this module', () => {
  const root = path.resolve(__dirname, '..')
  const app = path.join(root, 'app', '(frontend)')

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return walk(full)
      return entry.name === 'page.tsx' || entry.name === 'layout.tsx' ? [full] : []
    })

  const routes = walk(app)

  it('finds the routes at all', () => {
    // A walk that matched nothing would make every check below pass by not
    // running - the failure `seed:topics` and `seed:cite` shipped with.
    expect(routes.length).toBeGreaterThan(50)
  })

  for (const file of routes) {
    const source = fs.readFileSync(file, 'utf8')
    if (!/openGraph|twitter/.test(source)) continue
    it(`${path.relative(app, file).split(path.sep).join('/')} declares no card of its own`, () => {
      /*
        `hostCard` is the only place a literal `openGraph` belongs, and it
        lives in this module. A route that writes one inline has replaced its
        parent's whole card without meaning to.
      */
      expect(source).not.toMatch(/^\s*openGraph: \{/m)
      expect(source).not.toMatch(/^\s*twitter: \{/m)
    })
  }
})

/**
 * Each detail route asks `recordImage` for its picture, and passes its own
 * collection slug.
 *
 * All sixteen ask, including the six whose answer is always no. That is the
 * point: the call being identical everywhere means there is nowhere to put a
 * hand-rolled `images: [...]` that would slip an emblem onto a card, and a
 * seventeenth route copied from any of these inherits the rule.
 */
describe('every detail route routes its image through recordImage', () => {
  const root = path.resolve(__dirname, '..')

  for (const [collection, segment] of Object.entries(SECTION_PATH)) {
    it(`${collection}`, () => {
      const file = path.join(
        root,
        'app',
        '(frontend)',
        '[game]',
        segment.replace(/^\//, ''),
        '[slug]',
        'page.tsx',
      )
      const source = fs.readFileSync(file, 'utf8')
      /*
        The collection slug, not the route folder: `/court` reads `courts` and
        `/skills` reads `skill-trees`, and `GENERATED_ART` is keyed on the
        collection - so passing the folder would quietly re-enable emblems on
        two of the six.
      */
      expect(source).toMatch(new RegExp(`recordImage\\('${collection}',`))
    })
  }
})
