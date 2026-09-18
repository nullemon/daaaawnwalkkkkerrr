import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * Fill each game's profile from the store listing and its Wikipedia infobox.
 *
 *   pnpm seed:game-profile
 *
 * Everything here is read off a source that already exists in
 * `src/seed/raw/`. Nothing is inferred and nothing is estimated — the three
 * commercial fields the profile can show (budget, marketing spend, headcount)
 * are deliberately left alone, because no feed carries them and a figure from
 * a forum is the exact thing this project refuses everywhere else. They are
 * editable in the admin for whoever finds a real one.
 *
 * No third party's review score. The store listing carries one and this pass
 * deliberately does not read it: the only rating this network publishes is its
 * own, from `pnpm seed:ratings`, and a borrowed number sitting in the same
 * factsheet turns a signed opinion into an aggregate of somebody else's work.
 *
 * Idempotent: it writes the same values from the same files every run, so it
 * belongs in `db:reset` alongside the other passes.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STORE = path.join(HERE, 'raw', 'games')
const REFERENCE = path.join(HERE, 'raw', 'reference')

/** Store categories to the modes a reader recognises. */
const MODE_FOR: Record<string, string> = {
  'single-player': 'single-player',
  'multi-player': 'multiplayer',
  'co-op': 'co-op',
  'online co-op': 'online-co-op',
  pvp: 'pvp',
  'online pvp': 'online-pvp',
  'cross-platform multiplayer': 'cross-platform',
}

const read = (dir: string, slug: string): Record<string, unknown> | null => {
  const file = path.join(dir, `${slug}.json`)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** A price string only counts when it names an amount or says free. */
const priceOf = (editions: { priceText?: string }[] | undefined) => {
  const text = editions?.[0]?.priceText?.trim()
  if (!text) return { priceText: undefined, isFree: false }
  if (/free/i.test(text)) return { priceText: text, isFree: true }
  return { priceText: /\d/.test(text) ? text : undefined, isFree: false }
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'slug' })

  let filled = 0
  for (const game of games.docs as unknown as {
    id: string | number
    slug: string
    title: string
    releaseDate?: string | null
  }[]) {
    const currentDate = game.releaseDate
    const store = read(STORE, game.slug)
    const reference = read(REFERENCE, game.slug)
    const wiki = (reference?.wikipedia as { facts?: Record<string, string> } | undefined)?.facts ?? {}

    if (!store && !reference) {
      console.log(`  ${game.slug}: no store listing and no reference facts, skipped`)
      continue
    }

    const categories = ((store?.categories as string[]) ?? []).map((c) => c.toLowerCase())
    const modes = [...new Set(categories.map((c) => MODE_FOR[c]).filter(Boolean))]
    const editions = (store?.editions as { priceText?: string }[]) ?? []
    const { priceText, isFree } = priceOf(editions)

    /*
      Whether the internet is needed, as far as the categories actually say.
      A listing with online modes and a single-player mode needs it for the
      first and not the second; one with neither says nothing at all, and
      "unknown" is the honest value rather than "no".
    */
    const online = modes.some((m) => m.startsWith('online'))
    const solo = modes.includes('single-player')
    const onlineRequired = online && solo ? 'multiplayer' : online ? 'yes' : solo ? 'no' : 'unknown'

    /*
      The release date, where the game record has none.

      Dawnwalker is the case this exists for: it is the one wiki with no store
      listing in the pipeline, so nothing ever filled its date and
      `check:launch` reported "no release date" for a game that had shipped.
      Its Wikipedia infobox has carried "3 September 2026" the whole time,
      already harvested, already sitting in raw/reference — nobody had wired
      the field to the fact.

      Only filled when the record is empty, so a date an editor set by hand is
      never overwritten by this, and marked confirmed because an infobox date
      for a released game is a stated fact rather than a window.
    */
    const stated = wiki.released
    /*
      Midday UTC, not local midnight.

      `new Date('3 September 2026')` is parsed in the machine's own zone, so on
      a box east of UTC it stores 2 September 18:30Z and every page that
      formats it in UTC prints the day before the one the source states. A
      release date is a calendar date rather than an instant; anchoring it at
      midday puts it the same side of midnight in every zone the site is read
      in.
    */
    const parsed = stated ? new Date(stated) : null
    const utcNoon =
      parsed && !Number.isNaN(parsed.getTime())
        ? new Date(
            Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0),
          )
        : null
    const dateFields =
      !currentDate && utcNoon
        ? { releaseDate: utcNoon.toISOString(), releaseDateConfirmed: true }
        : {}

    /*
      Do the two sources agree? Three of the eight do not, by a day each.
      Recorded rather than resolved.
    */
    const storeDate = store?.releaseDate ? new Date(String(store.releaseDate)) : null
    const storeDay =
      storeDate && !Number.isNaN(storeDate.getTime()) ? storeDate.toISOString().slice(0, 10) : null
    const wikiDay = utcNoon ? utcNoon.toISOString().slice(0, 10) : null
    const releaseNote =
      storeDay && wikiDay && storeDay !== wikiDay
        ? `Sources differ: the store listing gives ${store?.releaseDate}, Wikipedia gives ${stated}. Both are recorded rather than one being picked.`
        : undefined

    const profile = {
      releaseNote,
      priceText,
      isFree,
      microtransactions: categories.includes('in-app purchases'),
      dlcCount: ((store?.dlc as unknown[]) ?? []).length,
      editionCount: editions.length,
      modes,
      onlineRequired,
      engine: wiki.engine || undefined,
      series: wiki.series || undefined,
      director: wiki.director || undefined,
      composer: wiki.composer || undefined,
      designer: wiki.designer || undefined,
      artist: wiki.artist || undefined,
      writer: wiki.writer || undefined,
      genre: wiki.genre || undefined,
    }

    await payload.update({
      collection: 'games',
      id: game.id,
      data: { profile, ...dateFields } as never,
    })
    filled += 1
    console.log(
      `  ${game.slug.padEnd(32)} ${priceText ?? (isFree ? 'free' : '—')} · ` +
        `${modes.length} modes · ${profile.dlcCount} dlc` +
        (profile.engine ? ` · ${profile.engine}` : '') +
        (profile.microtransactions ? ' · in-app purchases' : '') +
        (dateFields.releaseDate ? ` · released ${stated}` : ''),
    )
  }

  console.log(`\n${filled} profiles filled from store listings and reference facts.`)
  console.log('Budget, marketing spend and headcount left blank — no feed publishes them.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
