import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { analyticsOrigins, type AnalyticsTags } from './analytics-origins'

describe('analyticsOrigins', () => {
  it('is empty when nothing is configured', () => {
    /*
      The state all eight wikis are actually in. A resource hint for an origin
      the page never contacts spends a DNS lookup on every page view and buys
      nothing, so an unconfigured site emits no <link> at all — the same rule
      `Analytics` already follows for the script tags themselves.
    */
    expect(analyticsOrigins({})).toEqual([])
    // Empty strings and nulls are what the fallback in `pick` actually yields
    // for a field nobody has filled in, so both have to read as absent.
    expect(analyticsOrigins({ ga4Id: '', gtmId: null, clarityId: null })).toEqual([])
  })

  it('names Google once even when GTM and GA4 are both set', () => {
    // Configuring both is the classic double-count; it is still one host.
    expect(analyticsOrigins({ gtmId: 'GTM-1', ga4Id: 'G-1' })).toEqual([
      'https://www.googletagmanager.com',
    ])
  })

  it('names each configured provider and no others', () => {
    expect(analyticsOrigins({ plausibleDomain: 'example.com' })).toEqual(['https://plausible.io'])
    expect(analyticsOrigins({ clarityId: 'abc' })).toEqual(['https://www.clarity.ms'])
  })

  it('ignores the headHtml escape hatch', () => {
    /*
      Whatever an owner pastes there could name any origin. Parsing one out of
      arbitrary markup is how a hint ends up pointing at a host the page does
      not use, so the escape hatch gets no hint rather than a guess.
    */
    expect(analyticsOrigins({ headHtml: '<script src="https://cdn.example.net/x.js"></script>' })).toEqual(
      [],
    )
  })

  it('hints only origins the Analytics component actually requests', () => {
    /*
      The drift this exists to stop: a hint that outlives the script it was
      written for. Nothing here is a type error — a `dns-prefetch` for a
      provider since removed resolves a name nobody uses, on every page, and
      no check would ever mention it. So the origins are read back out of
      `Analytics.tsx`, which is the file that owns the request.

      One direction only. A provider added there and not here means a missing
      hint, which costs a DNS lookup at script time and nothing else; a hint
      with no request behind it is the one worth failing over.
    */
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'components', 'Analytics.tsx'),
      'utf8',
    )
    const configured: AnalyticsTags = {
      gtmId: 'GTM-1',
      ga4Id: 'G-1',
      plausibleDomain: 'example.com',
      clarityId: 'abc',
    }
    const origins = analyticsOrigins(configured)
    expect(origins).toHaveLength(3)
    for (const origin of origins) {
      expect(source, `${origin} is hinted but nothing loads from it`).toContain(
        `${new URL(origin).host}/`,
      )
    }
  })
})
