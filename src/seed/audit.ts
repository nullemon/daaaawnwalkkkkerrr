import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'
import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'
import { hostFor, hostLabelProblem } from '../lib/host-label'

/**
 * Is this network actually ready to launch?
 *
 *   pnpm check:launch
 *
 * Not `pnpm audit` — that is pnpm's own command, which prints a CVE report for
 * the dependency tree and never runs a line of this file.
 *
 * Checks the things that do not fail loudly. A wiki with no favicon still
 * renders; a record with no meta description still serves; an image with no
 * alt text still displays. None of them errors, no test catches them, and each
 * one is only noticed by somebody who was going to be a reader.
 *
 * Exits non-zero if anything in the BLOCKING list is wrong, so it can gate a
 * deploy. Everything else is reported and left to judgement — a wiki for a
 * game that is not out has empty sections by design, and an audit that calls
 * that a failure is an audit people learn to ignore.
 */

type Finding = { level: 'blocking' | 'warn' | 'note'; area: string; detail: string }

/** A whole `export const metadata: Metadata = { … }` object, braces included. */
const METADATA_OBJECT = new RegExp(String.raw`export const metadata: Metadata = \{[\s\S]*?\n\}`)
const TITLE_OR_DESCRIPTION = new RegExp(String.raw`\btitle:|\bdescription:`)

const findings: Finding[] = []
const add = (level: Finding['level'], area: string, detail: string) =>
  findings.push({ level, area, detail })

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const root = (process.env.NEXT_PUBLIC_SITE_URL || 'example.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  const games = await payload.find({ collection: 'games', limit: 100, sort: 'title', depth: 1 })

  // --- The network itself --------------------------------------------------
  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    add('warn', 'network', 'NEXT_PUBLIC_SITE_URL is unset — fine locally, required in production')
  }
  if (settings.legalProvisional) {
    add(
      'blocking',
      'network',
      'Legal details are still stand-ins (Site settings → Legal & contact). Privacy, terms and contact render a warning until this is unticked.',
    )
  }
  if (!settings.siteName || settings.siteName === 'Vellum') {
    add('note', 'network', `Network is still called "${settings.siteName}" — a working name`)
  }

  const networkVerification = (settings.verification as { google?: string } | undefined)?.google
  const networkAnalytics = settings.analytics as
    | { ga4Id?: string; gtmId?: string; plausibleDomain?: string }
    | undefined
  const hasNetworkAnalytics = Boolean(
    networkAnalytics?.ga4Id || networkAnalytics?.gtmId || networkAnalytics?.plausibleDomain,
  )

  // --- Per wiki ------------------------------------------------------------
  for (const game of games.docs) {
    const where = { game: { equals: game.id } }

    /*
      The host this wiki will answer on.

      There is nothing to configure per wiki - the deployment serves
      `*.<domain>` behind a wildcard certificate and `proxy.ts` maps the label
      onto the path - so the only way this goes wrong is a label DNS will not
      accept. That is now refused in the admin, but a record created before
      the check existed, or written by a script, can still carry one.
    */
    const wikiHost = String((game as { subdomain?: string }).subdomain || game.slug)
    const hostProblem = hostLabelProblem(wikiHost)
    if (hostProblem) {
      add('blocking', String(game.slug), `host label "${wikiHost}" will not resolve — ${hostProblem}`)
    } else {
      add('note', String(game.slug), `serves on ${hostFor(wikiHost, root)}`)
    }

    const counts = await Promise.all(
      GAME_SCOPED.map(async (collection) => ({
        collection,
        n: (await payload.count({ collection, where })).totalDocs,
      })),
    )
    const records = counts.reduce((sum, row) => sum + row.n, 0)
    const label = `${game.slug}`

    const theme = game.theme as { hero?: unknown; logo?: unknown; accent?: string } | undefined
    if (!theme?.hero) add('warn', label, 'no hero art — the wiki home opens on a flat background')
    if (!theme?.logo) add('warn', label, 'no capsule art — the hub rail falls back to a generic icon')
    if (!theme?.accent) add('note', label, 'no accent colour set')

    if (!game.summary) add('warn', label, 'no summary — used as the meta description and card blurb')
    if (!game.tagline) add('note', label, 'no tagline')
    if (!game.releaseDate) add('note', label, 'no release date')

    if (game.status === 'live' || game.status === 'building') {
      const own = game.verification as { google?: string } | undefined
      if (!own?.google && !networkVerification) {
        add('warn', label, 'no Search Console token — each subdomain is its own property')
      }

      const analytics = game.analytics as
        | { ga4Id?: string; gtmId?: string; plausibleDomain?: string }
        | undefined
      if (
        !analytics?.ga4Id &&
        !analytics?.gtmId &&
        !analytics?.plausibleDomain &&
        !hasNetworkAnalytics
      ) {
        add('note', label, 'no analytics configured')
      }
    }

    if (records === 0 && game.status !== 'planned') {
      add('warn', label, 'live with no content at all')
    }
  }

  // --- Content quality across every wiki -----------------------------------
  for (const collection of GAME_SCOPED) {
    const all = await payload.find({ collection, limit: 2000, depth: 0, pagination: false })

    const noSummary = all.docs.filter((doc) => !(doc as { summary?: string }).summary).length
    if (noSummary > 0) {
      add(
        'warn',
        collection,
        `${noSummary} of ${all.totalDocs} have no summary — that is the meta description too`,
      )
    }

    const noSources = all.docs.filter(
      (doc) => !((doc as { sources?: unknown[] }).sources ?? []).length,
    ).length
    if (noSources > 0) {
      add('note', collection, `${noSources} of ${all.totalDocs} carry no source citation`)
    }
  }

  // --- Media ---------------------------------------------------------------
  const media = await payload.find({ collection: 'media', limit: 2000, depth: 0, pagination: false })
  const noAlt = media.docs.filter((doc) => !(doc as { alt?: string }).alt).length
  if (noAlt > 0) add('blocking', 'media', `${noAlt} images have no alt text`)

  const noCredit = media.docs.filter((doc) => !(doc as { credit?: string }).credit).length
  if (noCredit > 0) {
    add('note', 'media', `${noCredit} of ${media.totalDocs} images have no credit line`)
  }

  // --- Contributors --------------------------------------------------------
  const authors = await payload.find({ collection: 'authors', limit: 100, depth: 0 })
  const provisional = authors.docs.filter((doc) => (doc as { provisional?: boolean }).provisional)
  if (provisional.length > 0) {
    add(
      'note',
      'authors',
      `${provisional.length} of ${authors.totalDocs} are placeholders — each profile page carries a placeholder notice; the bylines on their guides print the name as written, and the profiles stay indexed unless "noindex" is ticked separately`,
    )
  }
  const noAvatar = authors.docs.filter((doc) => !(doc as { avatar?: unknown }).avatar).length
  if (noAvatar > 0) add('warn', 'authors', `${noAvatar} have no avatar`)

  // --- Copy that cannot vary per wiki --------------------------------------
  /*
    A `export const metadata` object under `[game]` is one title and one
    description served by all eight wikis at once — eight pages competing for
    the same search result, seven of them describing a game they are not about.
    It is invisible: the page renders, the build is green, and the only symptom
    is a ranking nobody was watching. Ten pages shipped like this.

    A noindex page is exempt, because nothing is competing for anything.
  */
  const routes = path.resolve('src', 'app', '(frontend)')
  const walk = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
          const full = path.join(dir, entry.name)
          return entry.isDirectory() ? walk(full) : entry.name === 'page.tsx' ? [full] : []
        })
      : []

  for (const file of walk(path.join(routes, '[game]'))) {
    const source = fs.readFileSync(file, 'utf8')
    const block = source.match(METADATA_OBJECT)
    if (!block) continue
    if (/index: false/.test(block[0])) continue
    if (!TITLE_OR_DESCRIPTION.test(block[0])) continue
    add(
      'blocking',
      'per-wiki copy',
      `${path.relative(process.cwd(), file)} exports a static metadata title or description — every wiki serves the same one`,
    )
  }

  /*
    An override row pointing at a key nobody kept. It does nothing, looks
    saved, and reads exactly like an edit that would not stick.
  */
  try {
    const ui = await payload.findGlobal({ slug: 'ui-strings', depth: 0 })
    const registry = await import('../lib/ui-registry')
    const orphans = [
      ...((ui?.strings ?? []) as { key?: string | null }[]).filter(
        (row) => row?.key && !(row.key in registry.UI_DEFAULTS),
      ),
      ...((ui?.labels ?? []) as { key?: string | null }[]).filter(
        (row) => row?.key && !(row.key in registry.LABEL_DEFAULTS),
      ),
    ].map((row) => row.key)
    if (orphans.length > 0) {
      add(
        'warn',
        'interface text',
        `${orphans.length} override${orphans.length === 1 ? '' : 's'} point at keys that no longer exist: ${orphans.slice(0, 5).join(', ')}`,
      )
    }
  } catch {
    // The global has never been saved. Nothing to orphan.
  }

  // --- Shared static files -------------------------------------------------
  const publicDir = path.resolve('public')
  for (const file of ['icon.svg', 'favicon-32.png', 'icon-512.png', 'apple-touch-icon.png', 'og.png']) {
    if (!fs.existsSync(path.join(publicDir, file))) {
      add('blocking', 'static', `public/${file} is missing`)
    }
  }

  // --- Report --------------------------------------------------------------
  const order: Finding['level'][] = ['blocking', 'warn', 'note']
  const LABEL = { blocking: 'BLOCKING', warn: 'worth fixing', note: 'for information' }

  console.log('')
  for (const level of order) {
    const rows = findings.filter((finding) => finding.level === level)
    if (rows.length === 0) continue
    console.log(`${LABEL[level]} (${rows.length})`)
    for (const row of rows) console.log(`  ${row.area.padEnd(32)} ${row.detail}`)
    console.log('')
  }

  const blocking = findings.filter((finding) => finding.level === 'blocking').length
  console.log(
    blocking === 0
      ? 'Nothing blocking. Anything above is a judgement call.'
      : `${blocking} blocking issue${blocking === 1 ? '' : 's'}.`,
  )
  process.exit(blocking === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
