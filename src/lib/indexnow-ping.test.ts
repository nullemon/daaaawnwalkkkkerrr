import { describe, expect, it } from 'vitest'
import {
  HOURLY_MAX,
  MAX_PER_FLUSH,
  PingQueue,
  QUIET_MS,
  isPublication,
  pingAllowed,
} from './indexnow-ping'

const live = {
  NEXT_RUNTIME: 'nodejs',
  NEXT_PUBLIC_SITE_URL: 'https://example.com',
}

describe('whether to ping at all', () => {
  it('pings from the serving site on a real origin', () => {
    const verdict = pingAllowed(live)
    expect(verdict.ok).toBe(true)
    if (verdict.ok) expect(verdict.origin).toBe('https://example.com')
  })

  it('never pings from a seed run, whatever it publishes', () => {
    /*
      `pnpm db:reset` publishes every record on the network. It runs under tsx,
      which has no NEXT_RUNTIME, and this is the guard that means a rebuild
      cannot turn into a submission of the whole sitemap.
    */
    const verdict = pingAllowed({ NEXT_PUBLIC_SITE_URL: 'https://example.com' })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.why).toMatch(/not the serving site/)
  })

  it('never pings a localhost URL at a search engine', () => {
    expect(pingAllowed({ ...live, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }).ok).toBe(false)
    expect(pingAllowed({ ...live, NEXT_PUBLIC_SITE_URL: '' }).ok).toBe(false)
    expect(pingAllowed({ ...live, NEXT_PUBLIC_SITE_URL: 'not a url' }).ok).toBe(false)
  })

  it('is switched off by INDEXNOW_PING=off and by nothing else', () => {
    expect(pingAllowed({ ...live, INDEXNOW_PING: 'off' }).ok).toBe(false)
    expect(pingAllowed({ ...live, INDEXNOW_PING: 'OFF' }).ok).toBe(false)
    expect(pingAllowed({ ...live, INDEXNOW_PING: 'on' }).ok).toBe(true)
    // There is no value that forces a submission past the checks above.
    expect(pingAllowed({ INDEXNOW_PING: 'on', NEXT_PUBLIC_SITE_URL: 'https://example.com' }).ok).toBe(
      false,
    )
  })
})

describe('what counts as a publication', () => {
  it('announces a draft going live, once', () => {
    expect(
      isPublication({ operation: 'update', status: 'published', previousStatus: 'draft', hasDrafts: true }),
    ).toBe(true)
    expect(
      isPublication({ operation: 'create', status: 'published', previousStatus: undefined, hasDrafts: true }),
    ).toBe(true)
  })

  it('never announces a draft — a URL that 404s is worse than no URL', () => {
    expect(
      isPublication({ operation: 'create', status: 'draft', previousStatus: undefined, hasDrafts: true }),
    ).toBe(false)
    expect(
      isPublication({ operation: 'update', status: 'draft', previousStatus: 'draft', hasDrafts: true }),
    ).toBe(false)
  })

  it('does not re-announce an edit to something already published', () => {
    expect(
      isPublication({
        operation: 'update',
        status: 'published',
        previousStatus: 'published',
        hasDrafts: true,
      }),
    ).toBe(false)
  })

  it('treats every save as live on a collection with no drafts', () => {
    expect(isPublication({ operation: 'create', hasDrafts: false })).toBe(true)
    expect(isPublication({ operation: 'update', hasDrafts: false })).toBe(true)
  })
})

/** A queue whose clock and timer the test drives. */
const harness = () => {
  let now = 1_000_000
  const timers: { run: () => void; at: number }[] = []
  const sent: string[][] = []
  const said: string[] = []
  const queue = new PingQueue({
    now: () => now,
    schedule: (run, ms) => timers.push({ run, at: now + ms }),
    send: (urls) => {
      sent.push(urls)
    },
    log: (message) => said.push(message),
  })
  /** Advance the clock and run anything due, keeping anything that is not. */
  const advance = (ms: number) => {
    now += ms
    const due = timers.filter((timer) => timer.at <= now)
    const later = timers.filter((timer) => timer.at > now)
    timers.length = 0
    timers.push(...later)
    due.forEach((timer) => timer.run())
  }
  return { queue, advance, sent, said, at: () => now }
}

describe('the queue', () => {
  it('coalesces a handful of publishes into one submission', () => {
    const { queue, advance, sent } = harness()
    queue.add('https://example.com/a')
    queue.add('https://example.com/b')
    queue.add('https://example.com/a')
    advance(QUIET_MS + 1)
    expect(sent).toEqual([['https://example.com/a', 'https://example.com/b']])
  })

  it('waits for quiet rather than sending a batch that is still growing', () => {
    const { queue, advance, sent } = harness()
    queue.add('https://example.com/a')
    advance(QUIET_MS - 1000)
    queue.add('https://example.com/b')
    advance(1001)
    expect(sent).toEqual([])
    advance(QUIET_MS)
    expect(sent).toEqual([['https://example.com/a', 'https://example.com/b']])
  })

  it('drops a bulk batch whole, and says what to run instead', () => {
    /*
      The flood guard. A seed publishing hundreds of records should not reach
      here at all — `pingAllowed` refuses a script outright — so this is the
      backstop for the one that does: a generator run through the admin, a
      restore, a future caller nobody has written yet. It drops rather than
      trims, because sending an arbitrary twenty-five of four hundred is a
      submission that looks successful and announced the wrong pages.
    */
    const { queue, advance, sent, said } = harness()
    for (let index = 0; index <= MAX_PER_FLUSH; index += 1) {
      queue.add(`https://example.com/page-${index}`)
    }
    advance(QUIET_MS + 1)
    expect(sent).toEqual([])
    expect(said[0]).toMatch(/nothing submitted/)
    expect(said[0]).toMatch(/pnpm indexnow -- --send/)
  })

  it('sends a batch of exactly the ceiling, so the limit is not off by one', () => {
    const { queue, advance, sent } = harness()
    for (let index = 0; index < MAX_PER_FLUSH; index += 1) {
      queue.add(`https://example.com/page-${index}`)
    }
    advance(QUIET_MS + 1)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(MAX_PER_FLUSH)
  })

  it('stops at an hourly ceiling and starts again the next hour', () => {
    const { queue, advance, sent, said } = harness()
    let published = 0
    const batch = () => {
      for (let index = 0; index < MAX_PER_FLUSH; index += 1) {
        queue.add(`https://example.com/p-${published}-${index}`)
      }
      published += 1
      advance(QUIET_MS + 1)
    }
    while (published < HOURLY_MAX / MAX_PER_FLUSH) batch()
    expect(sent).toHaveLength(HOURLY_MAX / MAX_PER_FLUSH)

    batch()
    expect(sent).toHaveLength(HOURLY_MAX / MAX_PER_FLUSH)
    expect(said.join(' ')).toMatch(/already submitted this hour/)

    advance(3_600_000)
    batch()
    expect(sent).toHaveLength(HOURLY_MAX / MAX_PER_FLUSH + 1)
  })

  it('says each refusal once, so a loop cannot fill a log with it', () => {
    const { queue, advance, said } = harness()
    for (let round = 0; round < 3; round += 1) {
      for (let index = 0; index <= MAX_PER_FLUSH; index += 1) {
        queue.add(`https://example.com/r${round}-${index}`)
      }
      advance(QUIET_MS + 1)
    }
    expect(said.filter((line) => /nothing submitted/.test(line))).toHaveLength(1)
  })

  it('sends nothing when nothing was added', () => {
    const { queue, sent } = harness()
    queue.flush()
    expect(sent).toEqual([])
  })
})
