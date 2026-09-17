import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { GENERATED_ART, absoluteImage, imagesFor, shownImage } from './sitemap-images'
import { SECTION_PATH } from './tenancy'

describe('shownImage', () => {
  it('is nothing for an unpopulated upload field', () => {
    // depth 0 hands back an id, and an id is not a picture.
    expect(shownImage(1234)).toBeNull()
    expect(shownImage(null)).toBeNull()
    expect(shownImage(undefined)).toBeNull()
  })

  it('is nothing for a record with no image at all', () => {
    expect(shownImage({})).toBeNull()
    expect(shownImage({ url: '' })).toBeNull()
  })

  it('names the original when no size is asked for', () => {
    expect(shownImage({ url: '/api/media/file/a.jpg' })).toBe('/api/media/file/a.jpg')
  })

  it('names the size the page renders when one is asked for', () => {
    const media = {
      url: '/api/media/file/a.jpg',
      sizes: { card: { url: '/api/media/file/a-768.jpg' } },
    }
    expect(shownImage(media, 'card')).toBe('/api/media/file/a-768.jpg')
  })

  it('falls back to the original when the size was never generated', () => {
    /*
      The case that actually happens: Payload writes a size row for every
      configured size and leaves `url` null where the source was too small to
      make one. Most company logos are under 768px, so `card` is a row of
      nulls and the component falls through — this must follow it, or the
      sitemap names a URL that 404s.
    */
    const media = { url: '/api/media/file/logo.png', sizes: { card: { url: null } } }
    expect(shownImage(media, 'card')).toBe('/api/media/file/logo.png')
  })
})

describe('absoluteImage', () => {
  it('puts the page’s own origin in front of a stored path', () => {
    expect(absoluteImage('https://dawnwalker.example.com', '/api/media/file/a.jpg')).toBe(
      'https://dawnwalker.example.com/api/media/file/a.jpg',
    )
  })

  it('does not double the slash when the origin carries one', () => {
    expect(absoluteImage('https://example.com/', '/a.jpg')).toBe('https://example.com/a.jpg')
  })

  it('leaves an absolute URL alone', () => {
    expect(absoluteImage('https://example.com', 'https://cdn.example.net/a.jpg')).toBe(
      'https://cdn.example.net/a.jpg',
    )
  })

  it('drops anything a crawler could not resolve', () => {
    // A sitemap has no base to resolve a relative path against, so a
    // half-absolute entry is worse than no entry.
    expect(absoluteImage('https://example.com', 'media/a.jpg')).toBeNull()
    expect(absoluteImage('https://example.com', null)).toBeNull()
  })
})

describe('imagesFor', () => {
  it('is undefined rather than an empty array when there is no picture', () => {
    // An <image:image> with no <image:loc> in it is malformed, not quiet.
    expect(imagesFor('https://example.com', null)).toBeUndefined()
    expect(imagesFor('https://example.com', 4321)).toBeUndefined()
  })

  it('is a single absolute URL when there is one', () => {
    expect(imagesFor('https://example.com', { url: '/api/media/file/a.jpg' })).toEqual([
      'https://example.com/api/media/file/a.jpg',
    ])
  })
})

/**
 * The half of this that a unit test cannot infer: whether the field name the
 * sitemap reads is the field the page renders.
 *
 * Nothing about this is a type error. `imageField: 'image'` on `achievements`
 * would compile, run, and emit no images at all for 187 pages — or, if a route
 * were later changed to a different upload field, emit the wrong picture for
 * every one of them with a real URL behind it. Both are the shape of failure
 * this project keeps meeting: green everywhere, wrong in the one file nobody
 * opens. So the check reads the source of both ends.
 */
describe('every section names the image its own route renders', () => {
  const root = path.resolve(__dirname, '..')

  /*
    `SECTIONS` is read out of its own source rather than imported.

    `lib/sections.ts` pulls in `countRecords`, which pulls in the Payload
    config, which needs a database — and the whole point of this file, like
    `reachability.ts`, is to be checkable without one. Reading the literal is
    also the stricter test: it asserts against what is written in the file
    rather than against whatever a build step might have produced.
  */
  const sectionsSource = fs.readFileSync(path.join(root, 'lib', 'sections.ts'), 'utf8')
  const SECTIONS = [
    ...sectionsSource.matchAll(/collection: '([\w-]+)',[^\n]*?imageField: '(\w+)'/g),
  ].map((match) => ({ collection: match[1], imageField: match[2] }))

  it('reads every section in the list', () => {
    // A parse that silently found three of sixteen would make every check
    // below pass by not running.
    expect(SECTIONS.length).toBe(Object.keys(SECTION_PATH).length)
  })

  const collectionFiles = fs
    .readdirSync(path.join(root, 'collections'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, source: fs.readFileSync(path.join(root, 'collections', name), 'utf8') }))

  const configFor = (slug: string): string => {
    const found = collectionFiles.find((file) =>
      new RegExp(`slug:\\s*'${slug}'`).test(file.source),
    )
    if (!found) throw new Error(`No collection config declares slug '${slug}'`)
    return found.source
  }

  /** Every `type: 'upload'` field name in a collection config. */
  const uploadFields = (source: string): string[] => [
    ...new Set(
      [...source.matchAll(/name:\s*'([\w-]+)',\s*type:\s*'upload'/g)].map((match) => match[1]),
    ),
  ]

  for (const section of SECTIONS) {
    it(`${section.collection} → ${section.imageField}`, () => {
      expect(uploadFields(configFor(section.collection))).toContain(section.imageField)

      const segment = SECTION_PATH[section.collection as keyof typeof SECTION_PATH]
      const route = path.join(
        root,
        'app',
        '(frontend)',
        '[game]',
        segment.replace(/^\//, ''),
        '[slug]',
        'page.tsx',
      )
      const source = fs.readFileSync(route, 'utf8')
      // `doc.image`, `quest.image`, `ending.image`, `doc.icon`, `doc.portrait` —
      // whatever the route calls its record, it reads this field off it.
      expect(source).toMatch(new RegExp(`\\b\\w+\\.${section.imageField}\\b`))
    })
  }
})

describe('GENERATED_ART', () => {
  it('names only collections the wiki sitemap actually walks', () => {
    // A typo here is silent in the other direction: the section keeps its
    // images and nobody notices the rule was meant to apply to it.
    const known = new Set(Object.keys(SECTION_PATH))
    for (const collection of GENERATED_ART) expect(known).toContain(collection)
  })

  it('is the six that docs/ASSETS.md says will never have photographic art', () => {
    expect([...GENERATED_ART].sort()).toEqual([
      'builds',
      'court-activities',
      'courts',
      'endings',
      'perks',
      'skill-trees',
    ])
  })
})
