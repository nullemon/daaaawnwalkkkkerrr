import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'
import { slugify } from '../fields/shared'
import { SECTION_PATH, type GameScopedCollection } from '../lib/tenancy'

/**
 * The second, deeper pass of guide writing.
 *
 *   pnpm seed:deep
 *
 * `query-articles.ts` writes the eight topics every game can answer from its
 * store page. This adds the rest, and it is where the count goes from roughly
 * a dozen per wiki to forty or more.
 *
 * Three kinds of page, and all three are grounded in records this database
 * already holds rather than in anything invented:
 *
 *   1. **Fact topics** — engine, composer, series, DLC, storage, controller
 *      support, age rating. Each answers a search that Steam's listing or
 *      Wikipedia's infobox settles outright.
 *
 *   2. **Rarity roundups** — one page per achievement band. "The ultra-rare
 *      achievements in X" is a different search from "all achievements in X",
 *      and for a completionist it is the more useful one.
 *
 *   3. **Category roundups** — "Every Locust enemy", "Every COG character".
 *      The harvested entities carry the categories their wiki filed them
 *      under, so these group real records by a real attribute.
 *
 * What is still not written: anything needing somebody to have played. The
 * ceiling on an honest wiki for an unreleased game is lower than for a
 * released one, and these pages do not pretend otherwise.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const GAME_DIR = path.join(dirname, 'raw', 'games')
const REF_DIR = path.join(dirname, 'raw', 'reference')
const ENTITY_DIR = path.join(dirname, 'raw', 'wiki-entities')
const ART_DIR = path.resolve('assets/_games')

type Row = { id: string | number; title: string; slug: string; [key: string]: unknown }

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`

const listOf = (values: string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`

/** Categories that describe the wiki's housekeeping, not the subject. */
const NOT_A_GROUPING =
  /\b(articles?|stubs?|pages?|canon|legends|real world|images?|galler|templates?|candidates|needing|browse|wiki|unidentified|conjectural|all )\b/i

const RARITY = [
  { key: 'ultra-rare', label: 'ultra-rare', gloss: 'fewer than one player in twenty' },
  { key: 'very-rare', label: 'very rare', gloss: 'between one in twenty and one in ten' },
  { key: 'rare', label: 'rare', gloss: 'between one in ten and one in four' },
  { key: 'uncommon', label: 'uncommon', gloss: 'a quarter to a half of players' },
]

/** A different screenshot per page, cycling the game's own library. */
const screenshots = (slug: string, payload: Payload, credit: string) => {
  const dir = path.join(ART_DIR, slug)
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^screenshot-\d+\.(jpg|png)$/i.test(name)).sort()
    : []
  let index = 0

  return async (pageSlug: string, alt: string): Promise<number | string | null> => {
    if (files.length === 0) return null
    const file = files[index % files.length]
    index += 1

    const filename = `${slug}-deep-${pageSlug}${path.extname(file)}`.slice(0, 90)
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

async function upsert(
  payload: Payload,
  gameId: number | string,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'guides',
    where: { and: [{ slug: { equals: slug } }, { game: { equals: gameId } }] },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) {
    await payload.update({ collection: 'guides', id: existing.docs[0].id, data: { ...data, game: gameId } as never, depth: 0 })
    return
  }
  await payload.create({ collection: 'guides', data: { ...data, game: gameId } as never, depth: 0 })
}

async function run(): Promise<void> {
  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 50, sort: 'title', depth: 0 })
  const authors = await payload.find({ collection: 'authors', limit: 20, depth: 0 })
  const byline = (role: RegExp) =>
    authors.docs.find((a) => role.test(String(a.role ?? '')))?.id ?? authors.docs[0]?.id

  let total = 0

  for (const game of games.docs) {
    const name = (game.shortTitle as string) || (game.title as string)
    const where = { game: { equals: game.id } }

    const readJson = (dir: string) => {
      const file = path.join(dir, `${game.slug}.json`)
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
    }

    const steam = readJson(GAME_DIR)
    const reference = readJson(REF_DIR)
    const harvest = readJson(ENTITY_DIR)
    const wiki = reference?.wikipedia?.facts ?? {}

    const sources = [
      ...(steam?.storeUrl
        ? [{ title: `${steam.title} — official store page`, url: steam.storeUrl, retrieved: steam.fetchedAt }]
        : []),
      ...(reference?.wikipedia
        ? [
            {
              title: `${reference.wikipedia.title} — Wikipedia (${reference.wikipedia.licence})`,
              url: reference.wikipedia.url,
              retrieved: reference.fetchedAt,
            },
          ]
        : []),
    ]

    const pick = screenshots(
      game.slug as string,
      payload,
      `${game.title} © ${steam?.publishers?.[0] ?? 'its publisher'}. Used for identification and commentary.`,
    )

    let written = 0

    const write = async (
      slug: string,
      title: string,
      query: string,
      summary: string,
      blocks: Block[],
      role: RegExp = /Launch|Performance|Achievements/,
    ) => {
      const image = await pick(slug, `${game.title} — ${title}`)
      await upsert(payload, game.id, slug, {
        title,
        slug,
        targetQuery: query,
        summary: summary.slice(0, 320),
        body: rich(...blocks),
        ...(image ? { image } : {}),
        author: byline(role),
        sources,
        confidence: 'high',
      })
      written += 1
      total += 1
    }

    // --- 1. Fact topics ----------------------------------------------------

    if (wiki.engine) {
      await write(
        'what-engine',
        `What engine does ${name} run on?`,
        `${name} engine`,
        `${game.title} runs on ${wiki.engine}, and what that tells you about the PC version before it ships.`,
        [
          `${game.title} runs on **${wiki.engine}**.`,
          { h: 'Why the engine is worth knowing' },
          'It is the best predictor a PC player has before release. An engine brings its own settings menu, its own approach to ultrawide and uncapped frame rates, and its own familiar problems — all of which are known quantities months before anybody has benchmarked the game itself.',
          { h: 'What it does not tell you' },
          'How well this particular game is optimised. Two games on the same engine can perform nothing alike, and anybody quoting frame rates before release is quoting a preview build on hardware you do not own.',
        ],
        /Performance/,
      )
    }

    if (wiki.composer) {
      await write(
        'soundtrack-and-composer',
        `Who composed the ${name} soundtrack?`,
        `${name} soundtrack composer`,
        `${wiki.composer} scored ${game.title}. Who they are and what else they have written.`,
        [
          `${game.title} is scored by **${wiki.composer}**.`,
          { h: 'The rest of the credits' },
          {
            ul: [
              ...(wiki.director ? [`Director: ${wiki.director}`] : []),
              ...(wiki.writer ? [`Writer: ${wiki.writer}`] : []),
              ...(wiki.artist ? [`Artist: ${wiki.artist}`] : []),
              ...(wiki.producer ? [`Producer: ${wiki.producer}`] : []),
            ],
          },
          'Credits are the most reliable signal a game gives before release — considerably more than a trailer, which is cut to sell rather than to describe.',
        ],
        /Launch/,
      )
    }

    if (wiki.series) {
      await write(
        'series-order',
        `Is ${name} a sequel? Where it sits in the ${wiki.series} series`,
        `is ${name} a sequel`,
        `${game.title} is part of the ${wiki.series} series. Whether you need the earlier games first.`,
        [
          `${game.title} belongs to the **${wiki.series}** series.`,
          { h: 'Do you need the earlier games?' },
          'This wiki will not tell you until somebody here has played it. What can be said now is what the publisher has said: the series it is in, and the release order above. Whether the story assumes you know the others is a question about the game, and answering it from marketing copy would be guessing.',
          { h: 'What is confirmed' },
          {
            ul: [
              `Series: ${wiki.series}`,
              ...(wiki.released ? [`Released: ${wiki.released}`] : []),
              ...(wiki.genre ? [`Genre: ${wiki.genre}`] : []),
              ...(wiki.modes ? [`Modes: ${wiki.modes}`] : []),
            ],
          },
        ],
        /Launch/,
      )
    }

    const storage = (steam?.requirements?.minimum ?? []).find((row: { label: string }) =>
      /storage|hard drive|disk/i.test(row.label),
    )
    if (storage) {
      await write(
        'download-size',
        `How big is ${name}? Download and install size`,
        `${name} file size`,
        `${game.title} lists ${storage.value} of storage. What the figure covers and what it usually misses.`,
        [
          `The store listing asks for **${storage.value}**.`,
          { h: 'What that figure is' },
          'The publisher’s own minimum, set before launch. It is the install footprint they expect, and it is routinely exceeded — day-one patches, high-resolution texture packs and later content all land on top of it.',
          { h: 'Plan for more' },
          'Leaving half again on top of the stated figure is the usual advice, and it is a habit rather than a measurement. This page carries the publisher’s number because that is the one that is sourced.',
        ],
        /Performance/,
      )
    }

    const categories: string[] = steam?.categories ?? []
    const deck = categories.find((c: string) => /steam deck/i.test(c))
    const controller = categories.filter((c: string) => /controller|gamepad/i.test(c))
    if (deck || controller.length > 0) {
      await write(
        'controller-and-steam-deck',
        `${name} controller and Steam Deck support`,
        `${name} steam deck`,
        `What ${game.title} declares for controllers${deck ? ' and Steam Deck' : ''}, and the difference between a rating and a promise.`,
        [
          deck
            ? `${game.title} carries a Steam Deck rating: **${deck}**. That one is Valve’s own testing rather than a publisher’s claim, which makes it the more reliable line on the store page.`
            : `${game.title} has no Steam Deck rating on its listing yet. That usually means untested rather than unsupported.`,
          { h: 'Controller support, as declared' },
          { ul: controller.length > 0 ? controller : ['Nothing declared on the store page.'] },
          { h: 'Declared is not the same as good' },
          'A tag means the game claims a feature. It says nothing about whether the prompts are right, whether the menus are navigable on a pad, or whether remapping works — none of which can be known from a listing.',
        ],
        /Performance/,
      )
    }

    if (steam?.contentDescriptors) {
      await write(
        'age-rating-and-content',
        `Is ${name} suitable? Age rating and content warnings`,
        `${name} age rating`,
        `What ${game.title} contains, in the publisher's own description, and who it is not for.`,
        [
          'The publisher’s own content description, restated:',
          steam.contentDescriptors,
          { h: 'Why this is on its own page' },
          'It is one of the most-searched questions about any game and the answer is usually buried. Putting it plainly, sourced, and without editorialising is more useful than a rating badge.',
        ],
        /Launch/,
      )
    }

    if ((steam?.dlc ?? []).length > 0) {
      await write(
        'dlc-and-extras',
        `${name} DLC: what is available`,
        `${name} dlc`,
        `${game.title} lists ${plural(steam.dlc.length, 'separate add-on')}. What is confirmed and what is not.`,
        [
          `The store listing carries ${plural(steam.dlc.length, 'separate add-on')} for ${game.title}.`,
          { h: 'What is not here' },
          'What each one contains, and whether it is worth buying. Add-on listings are marketing copy, and restating them adds nothing a reader cannot get from the store in one click. When somebody here has played them, that judgement goes on this page.',
          ...(steam.editions?.length > 1
            ? ([
                { h: 'Bundled instead?' },
                `${game.title} is sold in ${steam.editions.length} editions, and the larger ones usually include add-ons at a lower total price than buying separately. The editions page has the list.`,
              ] as Block[])
            : []),
        ],
        /Launch/,
      )
    }

    // --- 2. Rarity roundups ------------------------------------------------

    const achievements = (
      await payload.find({ collection: 'achievements', where, limit: 1000, depth: 0, pagination: false })
    ).docs as unknown as (Row & { rarity?: string; globalPercent?: number; hidden?: boolean })[]

    for (const band of RARITY) {
      const inBand = achievements
        .filter((a) => a.rarity === band.key)
        .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
      if (inBand.length < 3) continue

      await write(
        `${band.key}-achievements`,
        `The ${band.label} achievements in ${name}`,
        `${name} ${band.label} achievements`,
        `${plural(inBand.length, 'achievement')} in ${game.title} held by ${band.gloss}, rarest first.`,
        [
          `${plural(inBand.length, 'achievement')} sit in the ${band.label} band — held by ${band.gloss}. Rarest first.`,
          { h: `All ${inBand.length}` },
          {
            ul: inBand.map(
              (a) => `${a.title} — ${a.globalPercent}%${a.hidden ? ' (hidden)' : ''}`,
            ),
          },
          { h: 'What the band means' },
          'The percentage is what the platform reports and it moves: an achievement gets commoner as more people finish the game, so a band is a snapshot rather than a property. Each achievement page records the date its figure was read.',
        ],
        /Achievements/,
      )
    }

    if (achievements.some((a) => a.hidden)) {
      const hidden = achievements.filter((a) => a.hidden)
      await write(
        'hidden-achievements',
        `Every hidden achievement in ${name}`,
        `${name} hidden achievements`,
        `${plural(hidden.length, 'hidden achievement')} in ${game.title} — the ones the game will not describe until you earn them.`,
        [
          `${game.title} has ${plural(hidden.length, 'hidden achievement')}: the game withholds the description until it is unlocked.`,
          { h: 'The list' },
          { ul: hidden.map((a) => `${a.title}${a.globalPercent ? ` — ${a.globalPercent}%` : ''}`) },
          { h: 'Why the names are here but not the methods' },
          'The names are published by the developer, so listing them is restating a fact. What each actually asks for is not published, and working it out needs somebody who has done it — which is why those pages are blank rather than filled with a reading of the title.',
        ],
        /Achievements/,
      )
    }

    // --- 3. Category roundups ---------------------------------------------

    if (harvest?.entities?.length) {
      const groups = new Map<string, { collection: string; titles: string[] }>()

      for (const entity of harvest.entities as {
        title: string
        collection: string
        categories: string[]
      }[]) {
        for (const category of entity.categories ?? []) {
          if (NOT_A_GROUPING.test(category)) continue
          // Skip a category that just names the game — that is the wiki index.
          if (category.toLowerCase().includes(String(name).toLowerCase())) continue
          const existing = groups.get(category) ?? { collection: entity.collection, titles: [] }
          existing.titles.push(entity.title)
          groups.set(category, existing)
        }
      }

      /*
        Four is the floor for a grouping worth its own page. Three is a
        coincidence of filing; four is the point where a reader scanning the
        list gets something a search result would not have given them. The cap
        is twenty because Gears alone has thirty-eight eligible groups, and
        past twenty they are groups of exactly four with overlapping members.
      */
      const worthwhile = [...groups.entries()]
        .filter(([, group]) => new Set(group.titles).size >= 4)
        .sort((a, b) => b[1].titles.length - a[1].titles.length)
        .slice(0, 20)

      for (const [category, group] of worthwhile) {
        const slug = `all-${slugify(category)}`.slice(0, 60)
        const sectionPath = SECTION_PATH[group.collection as GameScopedCollection] ?? ''
        const unique = [...new Set(group.titles)].sort()

        await write(
          slug,
          `Every ${category} in ${name}`,
          `${name} ${category.toLowerCase()}`,
          `${plural(unique.length, 'entry')} filed under ${category} in ${game.title}, including ${listOf(unique.slice(0, 3))}.`,
          [
            `${plural(unique.length, 'entry')} in ${game.title} are filed under ${category}. Each links to what is recorded about it.`,
            { h: `All ${unique.length}` },
            { ul: unique },
            { h: 'Where the grouping comes from' },
            `This is not our categorisation — it is the one the community wiki these records came from uses, restated. That makes it a real grouping rather than an invented one, and it also means it inherits their judgement calls.${sectionPath ? ` The full section is at ${sectionPath}.` : ''}`,
          ],
        )
      }
    }

    console.log(`  ${name.padEnd(24)} ${written} deeper guides`)
  }

  console.log(`\n${total} guides written`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
