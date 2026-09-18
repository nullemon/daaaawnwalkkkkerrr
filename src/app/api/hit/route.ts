import { NextResponse, after } from 'next/server'
import { headers } from 'next/headers'
import { client } from '@/lib/payload'
import { botRuleFor, browserFor, deviceFor, osFor } from '@/lib/analytics/agent'
import { acquisitionOf } from '@/lib/analytics/acquisition'
import {
  clientIp,
  countryFrom,
  normalisePath,
  sectionOf,
  siteOf,
  visitorKey,
} from '@/lib/analytics/request'
import { dayKey } from '@/lib/analytics/shape'
import { maintainAnalytics } from '@/lib/analytics/maintain'

/**
 * One page view, from a page that was built months ago.
 *
 * ## Why this route is the whole design
 *
 * Every public page on this network prerenders to static HTML. There is no
 * per-request server render to hook, and adding one to count visits would give
 * up the thing that makes the site fast in exchange for a number. So the only
 * component that ever sees a request is a route handler, and the only way a
 * static page reaches one is a beacon from the browser after paint:
 * `src/components/Beacon.tsx` posts here.
 *
 * `/api` is in `PASS_THROUGH` in `proxy.ts`, so this answers identically on all
 * ten hosts and is never rewritten onto a game prefix. That is exactly what is
 * needed, because **which host** is one of the dimensions — the Host header on
 * this request is the only thing that knows which of the ten sites the reader
 * was on, since `proxy.ts` has already hidden the game prefix from their URL.
 *
 * It sits outside both route groups so the static `/api/hit` segment wins over
 * Payload's generated `(payload)/api/[...slug]` catch-all — the same
 * arrangement, and the same reasoning, as `/api/rate`.
 *
 * ## What the client is allowed to say
 *
 * The path, the referrer and the URL's own UTM tags, and nothing else. Every
 * other field is derived here from something the client does not control, or
 * from the user-agent, which it does control and which is therefore recorded
 * as a claim and labelled as one throughout.
 *
 * In particular the client may **not** send a visitor id, a country or a
 * device class. A caller that could supply its own visitor key could be as
 * many readers as it had patience for, which is the same reason `ratings` has
 * `create: () => false` and this collection does too.
 *
 * ## Contract
 *
 *   POST /api/hit   { "p": "/quests/x", "r": "https://…", "q": "utm_source=…", "w": false }
 *     204            recorded, or deliberately not recorded. No body either way.
 *     400            not JSON, or no path
 *     429            rate limited
 *
 * **204 even when nothing was written.** The response is read by `sendBeacon`,
 * which discards it, and by a `fetch` whose failure would appear in a reader's
 * console. Telling a page whether its own visit was counted tells a script how
 * to tune itself until it is; and a reader has no use for the answer. What is
 * never silent is the *server* side: a refusal for a missing secret is logged
 * with the variable named.
 */

/* Reads headers and writes rows: never a static route. */
export const dynamic = 'force-dynamic'

const noContent = () => new NextResponse(null, { status: 204 })
const fail = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status })

type Body = {
  /** Path of the page, from `location.pathname`. */
  p?: unknown
  /** `document.referrer`, which is '' for a direct visit and often for others. */
  r?: unknown
  /** `location.search`, read here for UTM tags only. */
  q?: unknown
  /** `navigator.webdriver`. See the note where it is used. */
  w?: unknown
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A fixed window per address, and a ceiling for the whole process.
 *
 * The per-address allowance is generous because a reader clicking through a
 * wiki genuinely does produce a page view every few seconds, and throttling a
 * fast reader would quietly under-count the most engaged person on the site —
 * a bias in the flattering direction for bounce rate and the unflattering one
 * for depth.
 *
 * The process ceiling is the one that does the work. Somebody forging
 * `x-forwarded-for` gets a fresh bucket on every request and never fills a
 * per-address one, so the per-address limit alone would be no limit at all
 * against the case it is for. The ceiling is what keeps a flood from reaching
 * SQLite, which on this stack is one file the whole network writes through.
 *
 * In memory, so it resets on deploy and is per process: two instances behind a
 * load balancer are two ceilings. That is a floor on protection rather than a
 * guarantee, and saying so is better than implying otherwise — the same note
 * `/api/rate` carries.
 */
const WINDOW_MS = 60_000
const PER_ADDRESS = 120
const PER_PROCESS = 3_000

type Window = { count: number; resetAt: number }
const buckets = new Map<string, Window>()
let processWindow: Window = { count: 0, resetAt: 0 }

const rateLimited = (key: string): boolean => {
  const now = Date.now()
  if (now >= processWindow.resetAt) processWindow = { count: 0, resetAt: now + WINDOW_MS }
  if (processWindow.count >= PER_PROCESS) return true

  /*
    Sweep before growing. Without this the map is an unbounded leak keyed by a
    value an attacker controls the supply of — the rate limiter becomes the
    denial of service.
  */
  if (buckets.size > 10_000) {
    for (const [existing, window] of buckets) if (now >= window.resetAt) buckets.delete(existing)
  }

  const current = buckets.get(key)
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    processWindow.count += 1
    return false
  }
  if (current.count >= PER_ADDRESS) return true
  current.count += 1
  processWindow.count += 1
  return false
}

/* -------------------------------------------------------------------------- */

/** The network's own hosts, so a click from the hub to a wiki is not an arrival. */
const ourHostsFor = (root: string, thisHost: string): Set<string> => {
  const base = root.split(':')[0].toLowerCase()
  const here = thisHost.split(':')[0].toLowerCase().replace(/^www\./, '')
  return new Set([base, `www.${base}`, here])
}

/**
 * Is `host` this network's, including any subdomain of it?
 *
 * The set above covers the apex and the host being served; this covers the
 * other nine. Written as a suffix test on a label boundary rather than
 * `endsWith`, for the reason `acquisition.ts` records: a plain `endsWith` makes
 * `evilexample.com` part of the network.
 */
const isOurs = (host: string, root: string): boolean => {
  const base = root.split(':')[0].toLowerCase()
  return host === base || host.endsWith(`.${base}`)
}

export async function POST(request: Request) {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    /*
      Refusing beats writing an unsalted hash of somebody's address. Logged
      naming the variable, because the symptom otherwise is an analytics page
      that stays at zero with nothing anywhere saying why.
    */
    console.error('/api/hit: PAYLOAD_SECRET is not set; refusing to store a visitor key.')
    return noContent()
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail(400, 'Expected a JSON body.')
  }

  const path = normalisePath(typeof body.p === 'string' ? body.p : null)
  if (path === '/' && typeof body.p !== 'string') return fail(400, 'Which page?')

  const head = await headers()
  const get = (name: string) => head.get(name)

  const ip = clientIp(get)
  if (rateLimited(ip)) return fail(429, 'Too many page views just now.')

  const userAgent = get('user-agent') ?? ''
  const host = (get('host') ?? '').toLowerCase()
  const configured = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const root = new URL(configured).host

  /*
    `navigator.webdriver`, which the page reports and a real browser leaves
    false. It is a client claim like the user-agent, and a hostile client can
    lie about it — but nothing *honest* sets it, and the automation tools that
    do set it are exactly the traffic that would otherwise look like a reader
    with a perfect Chrome user-agent. Recorded as its own rule id so an
    exclusion made on this basis is distinguishable from one made on the agent
    string.
  */
  const rule = botRuleFor(userAgent)
  const botRule = rule ? rule.id : body.w === true ? 'webdriver' : null

  const tags = new URLSearchParams(typeof body.q === 'string' ? body.q.slice(0, 1024) : '')
  const acquisition = acquisitionOf({
    referrer: typeof body.r === 'string' ? body.r : null,
    ourHosts: ourHostsFor(root, host),
    utmSource: tags.get('utm_source'),
    utmMedium: tags.get('utm_medium'),
    utmCampaign: tags.get('utm_campaign'),
  })

  /* The suffix test the host set above cannot do: the other nine hosts. */
  const channel =
    acquisition.channel === 'referral' && isOurs(acquisition.source, root)
      ? 'internal'
      : acquisition.channel

  const now = new Date()

  try {
    const payload = await client()
    await payload.create({
      collection: 'analytics-events',
      data: {
        site: siteOf(host, root),
        host: host.slice(0, 255),
        path,
        section: sectionOf(path),
        channel,
        source: acquisition.source.slice(0, 255) || 'direct',
        campaign: acquisition.campaign || undefined,
        device: deviceFor(userAgent),
        browser: browserFor(userAgent),
        os: osFor(userAgent),
        country: countryFrom(get),
        visitor: visitorKey({ ip, userAgent, day: dayKey(now), secret }),
        botRule: botRule ?? undefined,
      },
      overrideAccess: true,
    })
  } catch (caught) {
    /*
      Logged and swallowed. A failed page-view write must never become an error
      in a reader's console or a red request in their network tab: they came
      here to read about a quest, and the count is our problem.
    */
    console.error('/api/hit: could not record a page view', caught)
    return noContent()
  }

  /*
    Retention and rollups, after the response and at most once an hour per
    process.

    There is no scheduler on this stack, and a maintenance pass that only ever
    runs by hand is a pass that is missing the first time somebody needs the
    history — the same lesson `seed:topics` and `seed:cite` taught when they
    were left out of the `db:reset` chain and the only symptom was a hundred
    and thirty-eight fewer guides. `pnpm analytics:roll` does the same work
    deliberately and is the thing to run from a real scheduler; this is the
    floor under it.
  */
  after(() => maintainAnalytics().catch(() => {}))

  return noContent()
}
