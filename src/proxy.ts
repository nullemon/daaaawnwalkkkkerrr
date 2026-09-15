import { NextResponse, type NextRequest } from 'next/server'

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
])

/**
 * First path segments that belong to the hub and must never be read as a game
 * slug. The Games collection refuses these as slugs, so the two lists agreeing
 * is enforced rather than hoped for — see RESERVED_SLUGS in
 * `collections/Games.ts`, which imports this very set.
 */
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
  'favicon.ico',
  'icon.svg',
  'og.png',
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
