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
      `${provisional.length} of ${authors.totalDocs} are placeholders — their profiles are noindex and they are kept out of Article structured data until real people replace them`,
    )
  }
  const noAvatar = authors.docs.filter((doc) => !(doc as { avatar?: unknown }).avatar).length
  if (noAvatar > 0) add('warn', 'authors', `${noAvatar} have no avatar`)

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
