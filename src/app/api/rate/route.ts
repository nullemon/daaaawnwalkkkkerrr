import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { Where } from 'payload'
import { cookies, headers } from 'next/headers'
import { client } from '@/lib/payload'
import { readerScore, type ReaderScore } from '@/lib/ratings'

/**
 * One reader, one score, out of ten.
 *
 * ## Why this route exists at all
 *
 * `Ratings` has `create: () => false`, so Payload's own REST API cannot write
 * here. That is deliberate and this file is the reason: a rating carries a
 * `voter` key, and a caller that could supply its own `voter` could vote as
 * many times as it had patience for. The key is computed here, from things the
 * server can see, and the only write in the codebase that passes
 * `overrideAccess: true` to the ratings collection is below.
 *
 * ## Where this lives in the route tree
 *
 * `/api` is in `PASS_THROUGH` in `proxy.ts`, so this answers identically on
 * every host in the network and is never rewritten onto a game prefix. That is
 * why the game arrives in the body rather than being read from the subdomain —
 * there is no subdomain here to read.
 *
 * It sits outside both route groups so the static `/api/rate` segment wins
 * over Payload's generated `(payload)/api/[...slug]` catch-all. A static
 * segment beats a catch-all in Next's matcher; if that ever stops being true
 * the symptom is a Payload 404 body coming back from this URL, not a build
 * error.
 *
 * ## Contract
 *
 *   POST /api/rate   { "game": "dawnwalker" | 3, "score": 1..10 }
 *     200 { ok: true, score, readers: { average, votes } }
 *     400 { ok: false, error }   bad body, bad score, unknown game
 *     429 { ok: false, error }   rate limited
 *     500 { ok: false, error }   no PAYLOAD_SECRET, or the write failed
 *
 *   GET  /api/rate?game=dawnwalker
 *     200 { ok: true, readers: { average, votes } }
 *
 * The GET is not decoration. Every public page here is prerendered, so the
 * vote count baked into the HTML is the count as of the last deploy and would
 * otherwise never move for a reader who does not vote. `StarRating` asks for a
 * fresh one when a page opts in.
 */

/* Not a static route: it reads headers and cookies and writes rows. */
export const dynamic = 'force-dynamic'

const COOKIE = 'dw-voter'
/* A year. The cookie is the only half of the key that survives a new IP, so a
   short expiry would quietly turn one reader into several over a season. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

type Body = { game?: unknown; score?: unknown }

const fail = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status })

/**
 * The reader's address, as far as this process can tell.
 *
 * **The first entry, not the last.** `x-forwarded-for` is appended to by each
 * hop, so the leftmost value is the original client and the rightmost is the
 * proxy nearest us. Taking the last would key every reader behind our own edge
 * to the same value — one vote for the entire network.
 *
 * The cost of taking the first is that it is client-supplied and therefore
 * forgeable. That is written down rather than worked around: the cookie half
 * of the key is client-supplied too (a reader can simply drop it), so this
 * changes nothing about what the key defends. See the limits section in
 * `collections/Ratings.ts` — casual double-voting, and nothing more.
 *
 * Falls back to a fixed placeholder rather than throwing. There is no address
 * on a unix socket or in some test harnesses, and a 500 on a star click would
 * be a worse outcome than a weaker key for the handful of requests affected.
 */
const clientIp = (h: Headers): string => {
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = h.get('x-real-ip')?.trim()
  if (real) return real
  return 'unknown-ip'
}

/**
 * The voter key: a salted hash of the address and the cookie, and nothing that
 * can be read back.
 *
 * The salt is load-bearing, not hygiene. An unsalted SHA-256 of an IPv4
 * address is reversible in seconds — the whole address space is four billion
 * values and anybody with the table can enumerate it — so an unsalted column
 * here would be a searchable index of who visited, which is the exact opposite
 * of what `Ratings`' docstring promises. If `PAYLOAD_SECRET` is missing we
 * refuse the write rather than fall back to an unsalted digest.
 */
const voterKey = (ip: string, token: string, secret: string): string =>
  createHash('sha256').update(`rating:${secret}:${ip}:${token}`).digest('hex')

/* ------------------------------------------------------------------------ */
/* Rate limiting                                                             */
/* ------------------------------------------------------------------------ */

/**
 * A fixed window per voter, and a ceiling for the whole process.
 *
 * Changing your mind is normal and must not be punished, so the per-voter
 * allowance is generous: thirty writes a minute is more clicking than anyone
 * does deliberately and still bounds a stuck loop in someone's browser.
 *
 * The process ceiling is the one that matters. An attacker who forges
 * `x-forwarded-for` gets a fresh voter key on every request and so never fills
 * a per-voter bucket — the per-voter limit alone would be no limit at all
 * against the case this is for. The ceiling is what keeps a flood from
 * reaching SQLite, which on this stack is a single file that the whole network
 * writes through.
 *
 * In memory, so: it resets on deploy and it is per process. Two instances
 * behind a load balancer mean two ceilings. That is an acceptable trade for
 * having no dependency and no shared store, and it is a floor on protection
 * rather than a guarantee — say so rather than implying otherwise.
 */
const WINDOW_MS = 60_000
const PER_VOTER = 30
const PER_PROCESS = 600

type Window = { count: number; resetAt: number }

const buckets = new Map<string, Window>()
let processWindow: Window = { count: 0, resetAt: 0 }

const takeToken = (bucket: Map<string, Window>, key: string, limit: number, now: number) => {
  const current = bucket.get(key)
  if (!current || now >= current.resetAt) {
    bucket.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

const rateLimited = (voter: string): boolean => {
  const now = Date.now()

  if (now >= processWindow.resetAt) processWindow = { count: 0, resetAt: now + WINDOW_MS }
  if (processWindow.count >= PER_PROCESS) return true

  /*
    Sweep expired buckets before adding another. Without this the map is an
    unbounded leak keyed by a value an attacker controls the supply of — the
    rate limiter would become the denial of service.
  */
  if (buckets.size > 5_000) {
    for (const [key, window] of buckets) if (now >= window.resetAt) buckets.delete(key)
  }

  if (!takeToken(buckets, voter, PER_VOTER, now)) return true
  processWindow.count += 1
  return false
}

/* ------------------------------------------------------------------------ */

/**
 * The game, by id or by slug, or null.
 *
 * Not `lib/payload.ts`'s `getGame`: that one calls `notFound()` for an unknown
 * slug, which in a route handler renders Next's 404 page instead of the JSON
 * body a fetch() caller is waiting to parse. An unknown game is a 400 here —
 * the caller sent something wrong, and it should be able to read why.
 */
const resolveGame = async (value: unknown): Promise<{ id: number } | null> => {
  const payload = await client()

  const asNumber = typeof value === 'number' ? value : Number(value)
  const byId = Number.isInteger(asNumber) && asNumber > 0

  /*
    Published wikis only, matching `getPublishedGames`. A planned game has no
    reachable page, so a vote on one could only arrive from something poking
    the endpoint by hand — and the rows would sit invisible until launch day
    and then turn up as a score nobody cast on a wiki that had no readers.
  */
  const result = await payload.find({
    collection: 'games',
    where: {
      and: [
        byId ? { id: { equals: asNumber } } : { slug: { equals: String(value) } },
        { status: { in: ['building', 'live', 'archived'] } },
      ],
    },
    limit: 1,
    depth: 0,
  })

  const game = result.docs[0]
  return game ? { id: game.id } : null
}

/**
 * Write the vote, whether or not one is already there.
 *
 * The unique index on `(game, voter)` is the thing that makes a second vote a
 * correction rather than a second ballot, and it is also a race: two clicks in
 * flight at once both see no existing row and both insert. The second insert
 * fails on the constraint, and the right response to that failure is to do
 * what the first one should have done — look the row up and update it. Treated
 * as an error it would surface as a 500 on an ordinary double-click.
 */
const upsertVote = async (gameId: number, voter: string, score: number): Promise<void> => {
  const payload = await client()
  /*
    Annotated, not inferred. TypeScript widens the array literal to a union of
    two differently-shaped objects, which is not assignable to `Where` — and
    the error it produces points at the query rather than at the array.
  */
  const where: Where = { and: [{ game: { equals: gameId } }, { voter: { equals: voter } }] }

  const existing = await payload.find({
    collection: 'ratings',
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs[0]) {
    await payload.update({
      collection: 'ratings',
      id: existing.docs[0].id,
      data: { score },
      overrideAccess: true,
    })
    return
  }

  try {
    await payload.create({
      collection: 'ratings',
      data: { game: gameId, score, voter },
      overrideAccess: true,
    })
  } catch {
    const raced = await payload.find({
      collection: 'ratings',
      where,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!raced.docs[0]) throw new Error('rating write failed')
    await payload.update({
      collection: 'ratings',
      id: raced.docs[0].id,
      data: { score },
      overrideAccess: true,
    })
  }
}

export async function POST(request: Request) {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    // Refusing beats writing an unsalted hash of somebody's address.
    console.error('/api/rate: PAYLOAD_SECRET is not set; refusing to store a voter key.')
    return fail(500, 'Ratings are unavailable.')
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail(400, 'Expected a JSON body.')
  }

  const score = typeof body.score === 'number' ? body.score : NaN
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return fail(400, 'Score must be a whole number from 1 to 10.')
  }

  if (body.game === undefined || body.game === null || body.game === '') {
    return fail(400, 'Which game?')
  }

  const game = await resolveGame(body.game)
  if (!game) return fail(400, 'No such game.')

  const jar = await cookies()
  const existingToken = jar.get(COOKIE)?.value
  /*
    Shape-checked rather than trusted. The cookie is only ever hashed, so a
    hostile value cannot reach the database as itself — but a caller sending a
    fresh token per request would silently mint a fresh voter every time, and
    replacing anything that is not our own 32-hex form at least makes that no
    easier than dropping the cookie entirely.
  */
  const valid = existingToken && /^[0-9a-f]{32}$/.test(existingToken)
  const token = valid ? existingToken : randomBytes(16).toString('hex')

  const voter = voterKey(clientIp(await headers()), token, secret)

  if (rateLimited(voter)) {
    return fail(429, 'Too many votes just now. Try again in a minute.')
  }

  try {
    await upsertVote(game.id, voter, score)
  } catch (caught) {
    console.error('/api/rate: could not store a vote', caught)
    return fail(500, 'That vote could not be saved.')
  }

  const readers: ReaderScore = await readerScore(game.id)
  const response = NextResponse.json({ ok: true, score, readers })

  if (!valid) {
    response.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
      /*
        Secure only off localhost: a `secure` cookie is dropped over plain
        HTTP, which is every developer's dev server, and the symptom would be
        a voter key that changes on every click with nothing saying why.
      */
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return response
}

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get('game')
  if (!asked) return fail(400, 'Which game?')

  const game = await resolveGame(asked)
  if (!game) return fail(400, 'No such game.')

  return NextResponse.json({ ok: true, readers: await readerScore(game.id) })
}
