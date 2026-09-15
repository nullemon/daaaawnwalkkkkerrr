import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'
import { rarityFor } from '../collections/Achievements'
import { slugify } from '../fields/shared'

/**
 * A screenshot for each generated mechanics page, cycling through the game's
 * own library so no two pages share one.
 *
 * Decorative placement: these illustrate the game, not a claim about a named
 * place or person, which is what `docs/ASSETS.md` permits.
 */
const screenshotPicker = (slug: string, payload: Payload, credit: string) => {
  const dir = path.resolve('assets/_games', slug)
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^screenshot-\d+\.(jpg|png)$/i.test(name)).sort()
    : []
  let index = 0

  return async (pageSlug: string, alt: string): Promise<number | string | null> => {
    if (files.length === 0) return null
    const file = files[index % files.length]
    index += 1

    const filename = `${slug}-mechanic-${pageSlug}${path.extname(file)}`
    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs.length > 0) return existing.docs[0].id

    try {
      const created = await payload.create({
        collection: 'media',
        data: { alt, credit } as never,
        file: {
          data: fs.readFileSync(path.join(dir, file)),
          mimetype: file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          name: filename,
          size: fs.statSync(path.join(dir, file)).size,
        },
      })
      return created.id
    } catch {
      return null
    }
  }
}

/**
 * Turns `src/seed/raw/games/*.json` into pages on each new wiki.
 *
 *   pnpm seed:games
 *
 * ## What this does and does not write
 *
 * Every record it creates restates something the publisher's own store page
 * says, and carries that page as its source with the date it was read. System
 * requirements, editions, platform features, supported languages, the
 * achievement list and each achievement's global unlock rate.
 *
 * It writes no walkthroughs, no boss strategies, no item locations and no
 * opinions about how a game plays, because nothing it reads from knows any of
 * that. Those sections exist on every wiki and stay empty until somebody has
 * played the game — which is the whole difference between this network and the
 * six competitors that will have "complete" wikis up on launch day.
 *
 * Idempotent on (game, slug), so re-running after a re-fetch updates rather
 * than duplicates. Safe to run as often as the store pages change.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const RAW_DIR = path.join(dirname, 'raw', 'games')

type RawGame = {
  slug: string
  appId: number
  storeUrl: string
  fetchedAt: string
  title: string
  developers: string[]
  publishers: string[]
  releaseDate: string | null
  comingSoon: boolean
  shortDescription: string
  genres: string[]
  categories: string[]
  languages: string
  contentDescriptors: string | null
  platforms: string[]
  requirements: {
    minimum: { label: string; value: string }[]
    recommended: { label: string; value: string }[]
  }
  editions: { title: string; priceText: string | null }[]
  dlc: number[]
  metacritic: number | null
  achievements: {
    title: string
    description: string | null
    icon: string
    globalPercent: number | null
  }[]
}

/** The store page, as a citation. Every record gets this and nothing else. */
const sourceFor = (game: RawGame) => [
  {
    title: `${game.title} on Steam`,
    url: game.storeUrl,
    retrieved: game.fetchedAt,
  },
]

/** "6 October 2026", or null. */
const prettyDate = (value: string | null): string | null => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const list = (values: string[]): string =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`

/**
 * The mechanics pages every wiki gets, built from store facts.
 *
 * These are the pages a reader looks for before they own a game, which is
 * exactly the window a new wiki can compete in: nobody needs our walkthrough
 * on launch day, but plenty of people need to know whether their machine will
 * run it.
 */
const mechanicsFor = (game: RawGame) => {
  const pages: {
    slug: string
    title: string
    summary: string
    blocks: Block[]
    keyFacts?: { label: string; value: string; confidence?: string }[]
  }[] = []

  const released = !game.comingSoon
  const date = prettyDate(game.releaseDate)
  const studio = list(game.developers)
  const publisher = list(game.publishers)

  // --- Release ------------------------------------------------------------
  pages.push({
    slug: 'release-date-and-platforms',
    title: 'Release date and platforms',
    summary: released
      ? `${game.title} is out. ${date ? `It released on ${date}.` : ''} Who made it, who publishes it, and where it runs.`.trim()
      : `${game.title} is not out yet. ${date ? `The publisher lists ${date}.` : ''} What has been confirmed so far.`.trim(),
    blocks: [
      released
        ? `${game.title} released${date ? ` on ${date}` : ''}. It is developed by ${studio}${publisher && publisher !== studio ? ` and published by ${publisher}` : ''}.`
        : `${game.title} has not released yet. The publisher's own store page lists${date ? ` ${date}` : ' no firm date'}. It is developed by ${studio}${publisher && publisher !== studio ? ` and published by ${publisher}` : ''}.`,
      released
        ? 'Everything on this wiki that describes how the game plays is written by somebody who has played it. Anything not written yet is left blank rather than guessed.'
        : 'Until it ships, this wiki carries what the publisher has actually stated and nothing else. No walkthroughs written from trailers, no item lists assembled from preview footage. Those pages appear when there is something real to put on them.',
    ],
    keyFacts: [
      ...(date ? [{ label: released ? 'Released' : 'Expected', value: date }] : []),
      { label: 'Developer', value: studio },
      ...(publisher && publisher !== studio ? [{ label: 'Publisher', value: publisher }] : []),
      ...(game.genres.length ? [{ label: 'Genre', value: list(game.genres) }] : []),
      ...(game.metacritic ? [{ label: 'Metacritic', value: String(game.metacritic) }] : []),
    ],
  })

  // --- System requirements ------------------------------------------------
  if (game.requirements.minimum.length > 0) {
    const rows = (entries: { label: string; value: string }[]) =>
      entries.map((entry) => `${entry.label}: ${entry.value}`)

    pages.push({
      slug: 'pc-system-requirements',
      title: 'PC system requirements',
      summary: `The minimum and recommended specification ${game.title} ships with, as the publisher states them.`,
      blocks: [
        `These are the figures on the game's own store page, not a benchmark. Treat minimum as "it starts and runs", not "it runs well" — publishers set that bar at the lowest configuration they are willing to support.`,
        { h: 'Minimum' },
        { ul: rows(game.requirements.minimum) },
        ...(game.requirements.recommended.length > 0
          ? ([{ h: 'Recommended' }, { ul: rows(game.requirements.recommended) }] as Block[])
          : []),
      ],
    })
  }

  // --- Editions -----------------------------------------------------------
  if (game.editions.length > 1) {
    pages.push({
      slug: 'editions',
      title: 'Editions',
      summary: `The ${game.editions.length} editions of ${game.title} the publisher sells, and what separates them.`,
      blocks: [
        `${game.title} is sold in ${game.editions.length} editions. What each one contains is set by the publisher and changes; the list below is what the store page showed when this was last checked.`,
        {
          ul: game.editions.map((edition) =>
            edition.priceText ? `${edition.title} — ${edition.priceText}` : edition.title,
          ),
        },
        'Prices are the publisher’s US list price and are not tracked here. Regional pricing, sales and storefront exclusives all vary, and a figure quoted on a wiki is out of date the week after it is written.',
      ],
    })
  }

  // --- Features -----------------------------------------------------------
  if (game.categories.length > 0) {
    pages.push({
      slug: 'features-and-platform-support',
      title: 'Features and platform support',
      summary: `Controller support, save sync, multiplayer and accessibility — what ${game.title} declares it supports.`,
      blocks: [
        'Declared by the publisher on the store page. A feature being listed means the game claims it, which is worth knowing before buying and is not the same as it working well.',
        { ul: game.categories },
      ],
    })
  }

  // --- Languages ----------------------------------------------------------
  if (game.languages) {
    pages.push({
      slug: 'supported-languages',
      title: 'Supported languages',
      summary: `Which languages ${game.title} is translated into, and which are dubbed.`,
      blocks: [
        'As listed by the publisher. An asterisk on the store page marks a language with full audio; the rest are subtitles and interface only.',
        game.languages,
      ],
    })
  }

  // --- Content warnings ---------------------------------------------------
  if (game.contentDescriptors) {
    pages.push({
      slug: 'content-warnings',
      title: 'Content warnings',
      summary: `What ${game.title} contains, as its publisher describes it.`,
      blocks: [
        'The publisher’s own content description, restated.',
        game.contentDescriptors,
      ],
    })
  }

  return pages
}

async function upsert(
  payload: Payload,
  collection: 'mechanics' | 'achievements',
  gameId: number | string,
  slug: string,
  data: Record<string, unknown>,
): Promise<'created' | 'updated'> {
  const existing = await payload.find({
    collection,
    where: { and: [{ slug: { equals: slug } }, { game: { equals: gameId } }] },
    limit: 1,
    depth: 0,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection,
      id: existing.docs[0].id,
      data: { ...data, game: gameId } as never,
      depth: 0,
    })
    return 'updated'
  }

  await payload.create({ collection, data: { ...data, game: gameId } as never, depth: 0 })
  return 'created'
}

async function run(): Promise<void> {
  if (!fs.existsSync(RAW_DIR)) {
    console.log(`No ${RAW_DIR}. Run \`node tools/fetch-game-data.mjs\` first.`)
    process.exit(0)
  }

  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  const files = fs.readdirSync(RAW_DIR).filter((name) => name.endsWith('.json'))
  let totalMechanics = 0
  let totalAchievements = 0

  for (const file of files) {
    const game: RawGame = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8'))

    const found = await payload.find({
      collection: 'games',
      where: { slug: { equals: game.slug } },
      limit: 1,
      depth: 0,
    })
    if (found.docs.length === 0) {
      console.log(`  ${game.slug}: no such game in the database, skipped`)
      continue
    }
    const gameId = found.docs[0].id

    console.log(`${game.title}`)

    // --- Mechanics --------------------------------------------------------
    const pickShot = screenshotPicker(
      game.slug,
      payload,
      `${game.title} © ${game.publishers[0] ?? 'its publisher'}. Used for identification and commentary.`,
    )

    let mechanics = 0
    for (const page of mechanicsFor(game)) {
      const image = await pickShot(page.slug, `${game.title} — ${page.title}`)
      await upsert(payload, 'mechanics', gameId, page.slug, {
        ...(image ? { image } : {}),
        title: page.title,
        slug: page.slug,
        summary: page.summary,
        body: rich(...page.blocks),
        keyFacts: page.keyFacts,
        sources: sourceFor(game),
        // Everything here restates a first-party page, which is the strongest
        // sourcing this project recognises.
        confidence: 'high',
      })
      mechanics += 1
    }
    console.log(`  ${mechanics} mechanics pages`)
    totalMechanics += mechanics

    // --- Achievements -----------------------------------------------------
    let achievements = 0
    const seen = new Set<string>()
    for (const entry of game.achievements) {
      let slug = slugify(entry.title)
      if (!slug) continue
      // Two achievements can share a name across a game's DLC. The compound
      // (game, slug) index would reject the second, so disambiguate rather
      // than silently drop it.
      if (seen.has(slug)) {
        let suffix = 2
        while (seen.has(`${slug}-${suffix}`)) suffix += 1
        slug = `${slug}-${suffix}`
      }
      seen.add(slug)

      const percent = entry.globalPercent
      await upsert(payload, 'achievements', gameId, slug, {
        title: entry.title,
        slug,
        description: entry.description ?? undefined,
        globalPercent: percent ?? undefined,
        rarity: rarityFor(percent),
        // A blank description is how the platform marks a hidden achievement.
        hidden: !entry.description,
        summary: entry.description
          ? `${entry.title}: ${entry.description}`.slice(0, 300)
          : `${entry.title} — a hidden achievement in ${game.title}. The game withholds its description until it is unlocked.`,
        sources: sourceFor(game),
        confidence: 'high',
      })
      achievements += 1
    }
    if (achievements > 0) console.log(`  ${achievements} achievements`)
    else console.log('  no achievements published yet (game not released)')
    totalAchievements += achievements
  }

  console.log(`\n${totalMechanics} mechanics pages, ${totalAchievements} achievements`)
  console.log('Run `pnpm assets` to attach the art.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
