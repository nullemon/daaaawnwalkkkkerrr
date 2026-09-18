import { describe, expect, it } from 'vitest'
import { clientIp, countryFrom, normalisePath, sectionOf, siteOf, visitorKey } from './request'
import { UNKNOWN_COUNTRY } from './shape'

const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null

describe('countryFrom', () => {
  it('reads the platform header when there is one', () => {
    expect(countryFrom(headers({ 'x-vercel-ip-country': 'PH' }))).toBe('PH')
    expect(countryFrom(headers({ 'cf-ipcountry': 'gb' }))).toBe('GB')
  })

  it('is unknown in development, where no edge sets one', () => {
    /*
      There is no geo database in this repository and none is being added, so
      an absent header is the absence of an answer. "Unknown is not zero" is a
      rule this project already states about segment costs and it applies
      exactly: a guess here would be a confident wrong country on a chart.
    */
    expect(countryFrom(headers({}))).toBe(UNKNOWN_COUNTRY)
  })

  it('rejects the placeholders a platform sends when it could not tell', () => {
    expect(countryFrom(headers({ 'cf-ipcountry': 'XX' }))).toBe(UNKNOWN_COUNTRY)
    expect(countryFrom(headers({ 'cf-ipcountry': 'T1' }))).toBe(UNKNOWN_COUNTRY)
  })

  it('rejects a datacentre code that is not a country at all', () => {
    // `fly-region` holds things like `lhr`. Three characters, so the shape
    // check refuses it rather than storing an airport as a country.
    expect(countryFrom(headers({ 'fly-region': 'lhr' }))).toBe(UNKNOWN_COUNTRY)
  })
})

describe('normalisePath', () => {
  it('drops the query string and the fragment', () => {
    /*
      A query string carries search terms and whatever somebody pasted into a
      URL. None of it answers a question the owner has and all of it would be
      personal data sitting in a table forever.
    */
    expect(normalisePath('/search?q=who+is+coen')).toBe('/search')
    expect(normalisePath('/quests/night-terrors#rewards')).toBe('/quests/night-terrors')
  })

  it('makes a trailing slash the same page', () => {
    expect(normalisePath('/quests/')).toBe('/quests')
    expect(normalisePath('/')).toBe('/')
  })

  it('refuses anything that is not a path', () => {
    expect(normalisePath('https://elsewhere.example/x')).toBe('/')
    expect(normalisePath(null)).toBe('/')
  })
})

describe('sectionOf', () => {
  it('is the first segment, or the home page', () => {
    expect(sectionOf('/quests/night-terrors')).toBe('/quests')
    expect(sectionOf('/quests')).toBe('/quests')
    expect(sectionOf('/')).toBe('/')
  })
})

describe('siteOf', () => {
  it('reads the wiki off the host, because the path no longer says', () => {
    /*
      proxy.ts rewrites the game prefix out of the reader's URL, so the Host
      header is the only thing that knows which of the ten sites this was.
    */
    expect(siteOf('dawnwalker.example.com', 'example.com')).toBe('dawnwalker')
    expect(siteOf('companies.example.com', 'example.com')).toBe('companies')
    expect(siteOf('example.com', 'example.com')).toBe('hub')
    expect(siteOf('www.example.com', 'example.com')).toBe('hub')
  })

  it('works in development, where the network domain has one label', () => {
    expect(siteOf('dawnwalker.localhost:3000', 'localhost:3000')).toBe('dawnwalker')
    expect(siteOf('localhost:3000', 'localhost:3000')).toBe('hub')
  })

  it('does not read a host that is not ours as one of ours', () => {
    expect(siteOf('evilexample.com', 'example.com')).toBe('other')
    expect(siteOf('a.b.example.com', 'example.com')).toBe('other')
  })
})

describe('clientIp', () => {
  it('takes the first entry of x-forwarded-for, not the last', () => {
    /*
      The header is appended to by each hop, so the leftmost value is the
      client and the rightmost is our own edge. Taking the last would key every
      reader on the network to one value and make the unique count permanently
      1 — a number that looks like a number.
    */
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 10.0.0.1' }))).toBe(
      '203.0.113.9',
    )
  })

  it('falls back rather than throwing, because a 500 is worse than a weak key', () => {
    expect(clientIp(headers({}))).toBe('no-address')
  })
})

describe('visitorKey', () => {
  const base = { ip: '203.0.113.9', userAgent: 'Mozilla/5.0', day: '2026-09-18', secret: 's3cret' }

  it('is stable for the same reader on the same day', () => {
    expect(visitorKey(base)).toBe(visitorKey({ ...base }))
  })

  it('changes at UTC midnight, so nothing can follow a person across days', () => {
    expect(visitorKey(base)).not.toBe(visitorKey({ ...base, day: '2026-09-19' }))
  })

  it('is salted, so the table is not a reversible index of addresses', () => {
    /*
      Load-bearing, not hygiene. An unsalted SHA-256 of an IPv4 address is four
      billion values and therefore an afternoon's work to reverse — an unsalted
      column here would be a searchable list of who visited.
    */
    expect(visitorKey(base)).not.toBe(visitorKey({ ...base, secret: 'another' }))
  })

  it('stores nothing that can be read back', () => {
    const key = visitorKey(base)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('203.0.113.9')
    expect(key).not.toContain('Mozilla')
  })
})
