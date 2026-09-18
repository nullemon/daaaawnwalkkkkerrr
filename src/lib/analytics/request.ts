import { createHash } from 'node:crypto'
import { UNKNOWN_COUNTRY } from './shape'

/**
 * Turning one request into one row — and refusing to invent the parts that are
 * not there.
 *
 * Everything here takes plain values rather than a `Request`, so all of it is
 * unit-testable without a server. The route does the reading; this does the
 * deciding.
 */

/* -------------------------------------------------------------------------- */
/* Country                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Headers a hosting platform sets with the country it resolved the address to.
 *
 * **There is no geo database in this repository and none is being added.** An
 * IP-to-country table is a licensed dataset with its own update cadence, and a
 * stale one produces a confident wrong answer rather than no answer — which is
 * the failure this project keeps finding. So the country is whatever the edge
 * in front of the app already worked out, and nothing else.
 *
 * In local development there is no edge, so every row is `unknown`. That is
 * the correct reading, it is what the admin shows, and it is labelled as the
 * absence of an answer rather than drawn as an empty bar.
 */
const COUNTRY_HEADERS = [
  'x-vercel-ip-country', // Vercel
  'cf-ipcountry', // Cloudflare
  'x-nf-geo-country', // Netlify (also sends x-nf-geo as JSON; this is the plain one)
  'fly-region', // not a country — rejected by the shape check below, kept as a note
  'x-appengine-country', // Google App Engine
  'x-geo-country',
  'x-country-code',
] as const

/**
 * Two letters, upper case, or unknown.
 *
 * `XX` and `T1` are what Cloudflare sends for "could not tell" and "Tor exit
 * node", and both have to become unknown rather than a country with a rising
 * line on somebody's chart. `fly-region` is in the list above because it is
 * the header people reach for on Fly and it holds a datacentre code such as
 * `lhr` — three characters, so this rejects it, which is the intended
 * behaviour and the reason the shape check is here rather than in the caller.
 */
export const countryFrom = (get: (name: string) => string | null | undefined): string => {
  for (const name of COUNTRY_HEADERS) {
    const raw = (get(name) ?? '').trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(raw) && raw !== 'XX' && raw !== 'T1') return raw
  }
  return UNKNOWN_COUNTRY
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The path, with the query string and fragment removed and never stored.
 *
 * A query string carries search terms, reset tokens and whatever an editor
 * happened to paste into a URL. None of it answers a question the owner has,
 * and all of it would be personal data sitting in a table forever. Dropping it
 * here is cheaper than a retention policy for it.
 *
 * A trailing slash is removed so `/quests` and `/quests/` are one page rather
 * than two rows that each look half as popular as the page really is.
 */
export const normalisePath = (input: string | null | undefined): string => {
  const raw = (input ?? '').trim()
  if (!raw.startsWith('/')) return '/'
  const path = raw.split('#')[0].split('?')[0]
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  return (trimmed || '/').slice(0, 512)
}

/** The first path segment, or `/` for a home page. What "Section" is grouped by. */
export const sectionOf = (path: string): string => {
  const first = path.split('/')[1] ?? ''
  return first ? `/${first}` : '/'
}

/**
 * Which site in the network this host is, as a label.
 *
 * The subdomain label where there is one — `dawnwalker`, `companies`, `people`
 * — and `hub` on the apex. Derived from the host rather than from the path,
 * because `proxy.ts` rewrites the path and the reader's URL never carries a
 * game prefix; the host is the only thing that knows which of the ten sites
 * this was.
 */
export const siteOf = (host: string, rootHost: string): string => {
  const clean = host.split(':')[0].toLowerCase()
  const base = rootHost.split(':')[0].toLowerCase()
  if (clean === base || clean === `www.${base}`) return 'hub'
  if (!clean.endsWith(`.${base}`)) return 'other'
  const label = clean.slice(0, -(base.length + 1))
  if (!label || label.includes('.') || label === 'www') return 'other'
  return label
}

/* -------------------------------------------------------------------------- */
/* The reader key                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A reader, for as long as one UTC day — and nothing that can be read back.
 *
 * This is the pattern `collections/Ratings.ts` already uses on this codebase,
 * with one deliberate change. There the key is stable forever, because a vote
 * has to be recognisable as the same person's vote next month. Here the day is
 * part of the input, so the same reader hashes to a different value tomorrow.
 *
 * What that buys: the table cannot be used to follow one person across a
 * fortnight, because there is no column that is the same person on two days.
 * What it costs is stated rather than hidden — **"unique readers" is exact
 * within a day and a ceiling across several**, since somebody who visits on
 * three days is three keys. The admin view labels every multi-day figure that
 * way instead of printing a number it cannot stand behind.
 *
 * The salt is load-bearing and not hygiene. An unsalted SHA-256 of an IPv4
 * address is reversible in seconds — four billion values is an afternoon — so
 * an unsalted column here would be a searchable index of who visited. If
 * `PAYLOAD_SECRET` is missing the caller refuses the write rather than falling
 * back to an unsalted digest; that decision is in the route, and it is the
 * same one `/api/rate` makes.
 *
 * **The raw address is never stored, and neither is the user-agent string.**
 * Both go in here and come out as sixty-four characters of hex; what the row
 * keeps of the agent is the three parsed families, which is what a question
 * about devices actually needs.
 */
export const visitorKey = (args: {
  ip: string
  userAgent: string
  day: string
  secret: string
}): string =>
  createHash('sha256')
    .update(`analytics:${args.secret}:${args.day}:${args.ip}:${args.userAgent}`)
    .digest('hex')

/**
 * The reader's address, as far as this process can tell.
 *
 * **The first entry of `x-forwarded-for`, not the last.** The header is
 * appended to by each hop, so the leftmost value is the original client and
 * the rightmost is the proxy nearest us. Taking the last would key every
 * reader behind our own edge to one value — one visitor for the entire
 * network, and a unique count that is always 1.
 *
 * The first entry is client-supplied and therefore forgeable. That is written
 * down rather than worked around, exactly as it is in `/api/rate`: a forged
 * header inflates the unique count and cannot deflate it, the figure is a
 * count of browsers rather than of people either way, and the admin says so.
 */
export const clientIp = (get: (name: string) => string | null | undefined): string => {
  const forwarded = get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = get('x-real-ip')?.trim()
  if (real) return real
  const cf = get('cf-connecting-ip')?.trim()
  if (cf) return cf
  return 'no-address'
}
