import { describe, expect, it, vi } from 'vitest'
import { WEBSUB_HUB, announceFeeds, feedUrls, publishBody } from './websub'

describe('feedUrls', () => {
  it('names both feeds at the root of the page’s own host', () => {
    expect(feedUrls('https://dawnwalker.example.com/quests/a-study-in-crimson')).toEqual([
      'https://dawnwalker.example.com/feed.xml',
      'https://dawnwalker.example.com/atom.xml',
    ])
  })

  it('keeps a custom subdomain, because that is the host the feed serves on', () => {
    expect(feedUrls('https://bod.example.com/items/x')[0]).toBe('https://bod.example.com/feed.xml')
  })
})

describe('publishBody', () => {
  it('is the hub’s form: publish mode and one hub.url per feed', () => {
    const body = publishBody(['https://a.example.com/feed.xml', 'https://a.example.com/atom.xml'])
    expect(body.get('hub.mode')).toBe('publish')
    expect(body.getAll('hub.url')).toEqual([
      'https://a.example.com/feed.xml',
      'https://a.example.com/atom.xml',
    ])
  })
})

describe('announceFeeds', () => {
  it('posts to the hub with Connection: close and reports a 204 as accepted', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const log = vi.fn()
    const ok = await announceFeeds('https://w.example.com/perks/compel', log, fetchImpl as unknown as typeof fetch)
    expect(ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(WEBSUB_HUB)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Connection).toBe('close')
    expect(String(init.body)).toContain('hub.mode=publish')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('2 feeds'))
  })

  it('never throws: a refusal and a dead network both come back false, with a line in the log', async () => {
    const log = vi.fn()
    const refused = vi.fn(async () => new Response('no', { status: 400 }))
    expect(await announceFeeds('https://w.example.com/x/y', log, refused as unknown as typeof fetch)).toBe(false)
    const dead = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    })
    expect(await announceFeeds('https://w.example.com/x/y', log, dead as unknown as typeof fetch)).toBe(false)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('400'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ENOTFOUND'))
  })
})
