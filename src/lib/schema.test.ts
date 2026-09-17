import { describe, expect, it } from 'vitest'
import { breadcrumbs, isoDate, orgRef, organization, person, videoGame } from './schema'

/*
  Structured data is the one thing on this site that nobody proofreads. It is
  emitted for machines, it does not render, and a wrong claim in it looks
  exactly like a right one — which is why the previous `videoGame` sat for
  months with Dawnwalker's publisher hardcoded and a `datePublished` that was
  not even Dawnwalker's. These tests are what makes the claims visible.
*/

const BASE = 'http://dawnwalker.localhost:3000'

describe('isoDate', () => {
  it('passes a full date through', () => {
    expect(isoDate('1978-03-12')).toBe('1978-03-12')
    expect(isoDate('1978-03-12T00:00:00.000Z')).toBe('1978-03-12')
  })

  it('refuses a bare year rather than inventing 1 January', () => {
    // The cost of a tidy guess here is a wrong date of birth for a living
    // person, published as machine-readable fact.
    expect(isoDate('1970')).toBeUndefined()
  })

  it('refuses the shapes sources actually write', () => {
    expect(isoDate('c. 1970')).toBeUndefined()
    expect(isoDate('1980s')).toBeUndefined()
    expect(isoDate('')).toBeUndefined()
    expect(isoDate(null)).toBeUndefined()
  })
})

describe('orgRef', () => {
  it('points at the profile when there is one', () => {
    const ref = orgRef('Capcom', new Set(['capcom'])) as Record<string, string>
    expect(ref['@id']).toContain('/capcom#organization')
    expect(ref.name).toBeUndefined()
  })

  it('degrades to a named organisation rather than a dangling id', () => {
    // A reference to a page that 404s is worse than an unlinked name: a
    // consumer will follow it.
    const ref = orgRef('Some Studio', new Set()) as Record<string, string>
    expect(ref['@id']).toBeUndefined()
    expect(ref.name).toBe('Some Studio')
    expect(ref['@type']).toBe('Organization')
  })
})

describe('videoGame', () => {
  const game = {
    title: 'The Blood of Dawnwalker',
    shortTitle: 'Dawnwalker',
    summary: 'A run planner and database.',
    platforms: ['PC', null],
    developer: 'Rebel Wolves',
    publisher: 'Bandai Namco Entertainment',
    releaseDate: '2026-09-03T12:00:00.000Z',
    releaseDateConfirmed: true,
    storeUrl: 'https://store.steampowered.com/app/3751260/',
    profile: { genre: 'Action role-playing', engine: 'Unreal Engine 5', modes: ['single-player'] },
  }

  it('describes the game it was given, not a hardcoded one', () => {
    const data = videoGame(BASE, game) as Record<string, unknown>
    expect(data.name).toBe('The Blood of Dawnwalker')
    expect(data['@id']).toBe(`${BASE}#videogame`)
    expect(data.gamePlatform).toEqual(['PC'])
    expect(data.genre).toBe('Action role-playing')
    expect(data.playMode).toEqual(['SinglePlayer'])
  })

  it('publishes a confirmed date and withholds an unconfirmed one', () => {
    const confirmed = videoGame(BASE, game) as Record<string, unknown>
    expect(confirmed.datePublished).toBe('2026-09-03')

    // An announced window is not a publication date, and a machine reading it
    // cannot tell the difference.
    const window = videoGame(BASE, { ...game, releaseDateConfirmed: false }) as Record<string, unknown>
    expect(window.datePublished).toBeUndefined()
  })

  it('never claims to sell the game or to have rated it', () => {
    const data = videoGame(BASE, game) as Record<string, unknown>
    expect(data.offers).toBeUndefined()
    expect(data.aggregateRating).toBeUndefined()
    // The store page is another page about the same game, which is what
    // sameAs means.
    expect(data.sameAs).toContain('https://store.steampowered.com/app/3751260/')
  })

  it('omits everything the record does not have', () => {
    const bare = videoGame(BASE, { title: 'Untitled' }) as Record<string, unknown>
    expect(bare.name).toBe('Untitled')
    expect(bare.gamePlatform).toBeUndefined()
    expect(bare.genre).toBeUndefined()
    expect(bare.publisher).toBeUndefined()
    expect(bare.datePublished).toBeUndefined()
  })
})

describe('organization', () => {
  it('links a parent and its subsidiaries by id, so the graph joins', () => {
    const data = organization(
      { name: 'Remedy Entertainment', slug: 'remedy-entertainment', founded: '1995' },
      { parent: { slug: 'tencent' }, subsidiaries: [{ slug: 'vanguard-entertainment' }] },
    ) as Record<string, Record<string, string>[] | Record<string, string>>

    expect((data.parentOrganization as Record<string, string>)['@id']).toContain('/tencent#organization')
    expect((data.subOrganization as Record<string, string>[])[0]['@id']).toContain(
      '/vanguard-entertainment#organization',
    )
    expect(data.foundingDate).toBe('1995')
  })

  it('says when a studio has closed', () => {
    // The single most useful thing this kind of page carries, and the one most
    // often missing elsewhere.
    const data = organization({ name: 'Gone', slug: 'gone', defunct: '2015' }) as Record<string, unknown>
    expect(data.dissolutionDate).toBe('2015')
  })

  it('does not invent a founding date from prose', () => {
    const data = organization({ name: 'X', slug: 'x', founded: 'the early 1990s' }) as Record<string, unknown>
    expect(data.foundingDate).toBeUndefined()
  })
})

describe('person', () => {
  it('links to the companies and games by id', () => {
    const data = person(
      { name: 'Sam Lake', slug: 'sam-lake', knownFor: 'Creative director' },
      { companies: [{ slug: 'remedy-entertainment' }], games: [{ url: BASE }] },
    ) as Record<string, Record<string, string>[]>

    expect(data.worksFor[0]['@id']).toContain('/remedy-entertainment#organization')
    expect(data.subjectOf[0]['@id']).toBe(`${BASE}#videogame`)
  })

  it('withholds a birth date the source only approximates', () => {
    const data = person({ name: 'X', slug: 'x', born: 'c. 1970' }) as Record<string, unknown>
    expect(data.birthDate).toBeUndefined()
  })
})

describe('breadcrumbs', () => {
  it('numbers from one and only links the crumbs that have a href', () => {
    const data = breadcrumbs(BASE, [{ label: 'Home', href: '/' }, { label: 'Here' }]) as {
      itemListElement: Record<string, unknown>[]
    }
    expect(data.itemListElement[0]).toMatchObject({ position: 1, item: `${BASE}/` })
    expect(data.itemListElement[1].item).toBeUndefined()
  })
})
