import { describe, expect, it } from 'vitest'
import { acquisitionOf, referrerHost } from './acquisition'

const OURS = new Set(['example.com', 'www.example.com', 'dawnwalker.example.com'])

const from = (referrer: string | null, extra: Record<string, string> = {}) =>
  acquisitionOf({
    referrer,
    ourHosts: OURS,
    utmSource: extra.utmSource ?? null,
    utmMedium: extra.utmMedium ?? null,
    utmCampaign: extra.utmCampaign ?? null,
  })

describe('referrerHost', () => {
  it('keeps the host and drops everything else', () => {
    expect(referrerHost('https://www.google.com/search?q=dawnwalker+quests')).toBe('google.com')
    expect(referrerHost('https://old.reddit.com/r/games/comments/abc/')).toBe('old.reddit.com')
  })

  it('treats anything that is not an http URL as no referrer', () => {
    /*
      The value arrives from a client that can send whatever it likes. A column
      of hostile strings is a column somebody eventually renders, so anything
      that does not parse as http(s) becomes the same thing as absent.
    */
    expect(referrerHost('javascript:alert(1)')).toBe('')
    expect(referrerHost('not a url')).toBe('')
    expect(referrerHost(null)).toBe('')
    expect(referrerHost('')).toBe('')
  })
})

describe('acquisitionOf', () => {
  it('calls no referrer direct, and nothing else direct', () => {
    expect(from('').channel).toBe('direct')
    expect(from(null).channel).toBe('direct')
    expect(from(null).source).toBe('direct')
  })

  it('separates AI assistants from search', () => {
    /*
      Not a nicety. An answer engine citing a page is a different arrival from
      a results page, the owner will want to watch it separately, and folding
      it into Search would hide the one number that is changing fastest.
    */
    expect(from('https://chatgpt.com/c/abc').channel).toBe('ai')
    expect(from('https://claude.ai/chat/abc').channel).toBe('ai')
    expect(from('https://gemini.google.com/app').channel).toBe('ai')
    expect(from('https://www.google.com/search?q=x').channel).toBe('search')
  })

  it('reads search, social and everything else apart', () => {
    expect(from('https://duckduckgo.com/').channel).toBe('search')
    expect(from('https://www.bing.com/search').channel).toBe('search')
    expect(from('https://www.reddit.com/r/games').channel).toBe('social')
    expect(from('https://discord.com/channels/1/2').channel).toBe('social')
    expect(from('https://somebodys-blog.example.org/post').channel).toBe('referral')
  })

  it('does not let a lookalike host pretend to be Google', () => {
    /*
      A plain endsWith makes evilgoogle.com a search engine and notreddit.com a
      social network. The label boundary is what stops a misattribution nobody
      would ever think to look for.
    */
    expect(from('https://evilgoogle.com/search').channel).toBe('referral')
    expect(from('https://notreddit.com/r/x').channel).toBe('referral')
    /* A genuine subdomain still is one. */
    expect(from('https://news.google.com/').channel).toBe('search')
  })

  it('never counts the network linking to itself as an arrival', () => {
    expect(from('https://dawnwalker.example.com/quests').channel).toBe('internal')
    expect(from('https://example.com/wikis').channel).toBe('internal')
  })

  it('uses a campaign tag only when there is nothing observed to use', () => {
    // A real referrer wins: it was observed, the tag was written by whoever
    // built the link.
    const tagged = from('https://www.reddit.com/r/games', { utmSource: 'newsletter' })
    expect(tagged.channel).toBe('social')
    expect(tagged.source).toBe('reddit.com')

    const untagged = from('', { utmSource: 'newsletter', utmCampaign: 'launch' })
    expect(untagged.channel).toBe('campaign')
    expect(untagged.source).toBe('newsletter')
    expect(untagged.campaign).toBe('launch')
  })

  it('honours a utm_medium that names a channel it already has', () => {
    expect(from('', { utmSource: 'google', utmMedium: 'organic' }).channel).toBe('search')
    expect(from('', { utmSource: 'twitter', utmMedium: 'social' }).channel).toBe('social')
  })
})
