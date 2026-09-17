import { NextResponse, type NextRequest } from 'next/server'
import { KEY_FILE_PATTERN } from './lib/indexnow'

/**
 * Host-to-path routing for the network.
 *
 * This file is `proxy.ts`, not `middleware.ts`: Next.js 16 renamed the
 * convention. The old name still works and is deprecated, so anything written
 * against middleware docs from memory silently never runs.
 *
 * Two jobs, and the second matters as much as the first:
 *
 *   1. `dawnwalker.example.com/quests/night-terrors`
 *        is rewritten to `/dawnwalker/quests/night-terrors`.
 *      A rewrite, not a redirect — the reader's URL never carries a game
 *      prefix, which is what lets every internal link in the site stay
 *      root-relative and is most of why subdomains were cheaper to adopt than
 *      paths would have been.
 *
 *   2. `example.com/dawnwalker/quests/night-terrors`
 *        is redirected, permanently, to the game's own host.
 *      Without this every page would be reachable at two URLs and would
 *      compete with itself in search. The internal path scheme is an
 *      implementation detail and no crawler should ever see it.
 *
 * This runs per request while every page is prerendered, so the rewrite maps a
 * host onto an already-built static page and adds no rendering work.
 */

/**
 * Served from the app root on every host, game or apex, and never rewritten.
 *
 * `robots.txt` and `sitemap.xml` are here because both answer per host by
 * reading the Host header themselves — see `app/robots.ts` and
 * `app/sitemap.ts`. Rewriting either into a game prefix would look for a file
 * that does not exist, and in the sitemap's case the game-prefixed route
 * cannot be written at all: `sitemap` is a Next metadata convention and it
 * claims any route folder of that name.
 */
const PASS_THROUGH = new Set([
  '_next',
  'api',
  'admin',
  'robots.txt',
  'sitemap.xml',
  // Per-wiki favicons and share cards, in public/wiki-assets/<slug>/. They are
  // referenced by absolute path from whichever host is serving, so rewriting
  // them onto a game prefix would look for a file that is not there.
  'wiki-assets',
  /*
    The network's own icon set and share card, in `public/`, for exactly the
    same reason as the line above: they are referenced by absolute path from
    whichever host is serving.

    Only `icon.svg` and `og.png` were exempt, and only on the apex — they were
    in `APEX_ONLY` and not here — so of the four icons the hub's own
    `generateMetadata` declares, three answered a 308 to
    `favicon-32.png.<domain>`, a host that does not exist. Nothing errored: a
    browser that cannot fetch a declared icon falls back to the next one and
    says nothing, and `pnpm check:launch` passed the whole time because it
    checks that the five files are on disk, not that a request for one is
    answered. Counting files is not checking pages.

    Off the apex they were unreachable outright, which is why the companies and
    people hosts could not have a favicon at all.
  */
  'icon.svg',
  'favicon-32.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'og.png',
])

/**
 * First path segments that belong to the hub and must never be read as a game
 * slug. The Games collection refuses these as slugs, so the two lists agreeing
 * is enforced rather than hoped for — see RESERVED_SLUGS in
 * `collections/Games.ts`, which imports this very set.
 */
/**
 * Hosts of the network that are not wikis.
 *
 * `companies.<root>` serves the studio and publisher profiles. It needs no
 * special routing - the rewrite below maps any subdomain label onto the
 * matching first path segment, so this one lands on `/companies/...` exactly
 * as a game lands on `/<game>/...`, and the apex redirect sends
 * `example.com/companies/x` to `companies.example.com/x` for free.
 *
 * What it does need is reserving: `Games.ts` validates a new game's slug
 * against this as well as against APEX_ONLY, so no wiki can ever be created
 * that would shadow it.
 */
export const NETWORK_SUBDOMAINS = new Set(['companies', 'people'])

export const APEX_ONLY = new Set([
  ...PASS_THROUGH,
  'about',
  'contact',
  'privacy',
  'terms',
  'authors',
  'account',
  'wikis',
  'search',
  /* No such file, and that is the point: the name must never be read as a
     wiki slug. The rest of the icon set is in `PASS_THROUGH` above, which this
     spreads in, so it is not restated here. */
  'favicon.ico',
])

/**
 * The host label in front of the network's own domain, or null on the apex.
 *
 * Matched by suffix rather than by counting dots, because the number of labels
 * in the network domain is not fixed — `example.com` has two, `example.co.uk`
 * has three, and `dawnwalker.localhost` has one.
 */
export const subdomainOf = (host: string, root: string): string | null => {
  const clean = host.split(':')[0].toLowerCase()
  const base = root.split(':')[0].toLowerCase()
  if (clean === base || clean === `www.${base}`) return null
  if (!clean.endsWith(`.${base}`)) return null
  const label = clean.slice(0, -(base.length + 1))
  // Only a single label is a wiki. Anything deeper is not ours.
  if (!label || label.includes('.') || label === 'www') return null
  return label
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl
  const host = request.headers.get('host') ?? ''

  /*
    The network's own domain, read from the environment rather than inferred
    from the request. Inferring it from the Host header is how a site becomes
    routable as any domain an attacker cares to send.
  */
  const configured = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const root = new URL(configured).host

  const label = subdomainOf(host, root)
  const first = url.pathname.split('/')[1] ?? ''

  if (PASS_THROUGH.has(first)) return NextResponse.next()

  /*
    The IndexNow key file, which has to answer on every host.

    IndexNow verifies ownership by fetching `<host>/<key>.txt` and checking it
    contains the key. The submission is rejected if it 404s — and it did, on
    every host: the file sat in `public/` and nothing exempted it, so a wiki
    host rewrote it into `/<game>/<key>.txt` and the apex *redirected* it to
    `<key>.txt.<domain>` because an unreserved first segment is read as a game
    slug. `tools/indexnow.mjs` states in its own docstring that the key "is
    served by every subdomain already". It never was, and every submission the
    tool has ever made would have failed verification.

    Matched by shape rather than by name, which is what lets the owner rotate
    the key from the admin: there is no filename here to keep in sync with a
    settings field. The `.txt` is what makes shape-matching safe — no game slug
    can contain a dot, because `slugField` strips it — so a key file can never
    be read as a wiki and a wiki can never shadow a key file.

    Rewritten rather than passed through, because the key may now be a settings
    value with no file behind it. The route answers for whichever key is live
    and 404s for every other, including the committed one after a rotation;
    passing through would serve only keys that exist in `public/`, which is the
    scheme this replaced.

    `/<key>.txt` and nothing deeper. `first` is only the first segment, so
    without the whole-path check `/<key>.txt/anything` would rewrite to the
    same route and be answered 200 for a URL no engine ever asked for.
  */
  if (KEY_FILE_PATTERN.test(first) && url.pathname === `/${first}`) {
    const rewritten = url.clone()
    rewritten.pathname = `/api/indexnow/${first.slice(0, -4)}`
    return NextResponse.rewrite(rewritten)
  }

  // --- On a wiki's host: hide the game prefix ------------------------------
  if (label) {
    // Already prefixed means this was rewritten once already. Leave it alone
    // rather than producing /dawnwalker/dawnwalker/quests.
    if (first === label) return NextResponse.next()

    const rewritten = url.clone()
    rewritten.pathname = `/${label}${url.pathname === '/' ? '' : url.pathname}`
    return NextResponse.rewrite(rewritten)
  }

  // --- On the apex: send game paths to the game's own host -----------------
  if (first && !APEX_ONLY.has(first)) {
    const target = new URL(configured)
    target.host = `${first}.${root}`
    target.pathname = url.pathname.slice(first.length + 1) || '/'
    target.search = url.search
    return NextResponse.redirect(target, 308)
  }

  return NextResponse.next()
}

export const config = {
  /*
    Everything but Next's own build output. Dotted paths are deliberately NOT
    excluded here: `/feed.xml`, `/atom.xml` and `/search-index.json` are served
    per game and have to be rewritten onto the game prefix like any other page.
    The handful that must not be are in PASS_THROUGH above, which is checked
    inside the function where the reason for each can be written down.
  */
  matcher: ['/((?!_next/static|_next/image).*)'],
}
