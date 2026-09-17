import 'dotenv/config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'
import { GAME_SCOPED, SECTION_PATH } from '../lib/tenancy'

/**
 * Writes the roundup guides for every wiki.
 *
 *   pnpm seed:guides
 *
 * ## Why these and not "how to beat the final boss"
 *
 * These are the shapes people actually type. Not "Onimusha lore" but "all
 * Onimusha weapons", "Gears E-Day system requirements", "hardest achievements
 * in Zero Company" — list-and-answer queries, which is most of what a game
 * search is.
 *
 * Every one is written from records this database already holds, so a guide
 * cannot claim something the wiki does not have, and it stays correct when the
 * records change because the counts and the lists are read at build time
 * rather than typed in. A guide for a section with nothing in it is not
 * written at all.
 *
 * What is *not* here is the walkthrough. No "best build", no boss strategy, no
 * route. Those need somebody who has played the game, and writing them from a
 * database of names would be exactly the invention this network exists not to
 * do.
 *
 * Idempotent on (game, slug).
 */

type Row = { title: string; slug: string; summary?: string | null; [key: string]: unknown }

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`

/** A sentence listing the first few, for a summary. */
const nameSome = (rows: Row[], limit = 4) =>
  rows
    .slice(0, limit)
    .map((row) => row.title)
    .join(', ')

/*
  `nouns` is written out rather than derived.

  `plural()` defaults to noun + "s", which turned "enemy" into "enemys" — in
  the summary, and so in the meta description, of the enemy roundup on every
  wiki that has one. Every other noun here happens to take a plain "s", which
  is exactly why nobody noticed the one that does not: a rule that is right
  five times out of six is the shape this repository keeps being caught by.
*/
const SECTION_COPY: Record<
  string,
  { noun: string; nouns: string; heading: (game: string) => string; query: (game: string) => string }
> = {
  characters: {
    noun: 'character',
    nouns: 'characters',
    heading: (game) => `Every character in ${game}`,
    query: (game) => `${game} characters`,
  },
  enemies: {
    noun: 'enemy',
    nouns: 'enemies',
    heading: (game) => `Every enemy and boss in ${game}`,
    query: (game) => `${game} bosses`,
  },
  items: {
    noun: 'item',
    nouns: 'items',
    heading: (game) => `Every weapon and item in ${game}`,
    query: (game) => `${game} weapons`,
  },
  regions: {
    noun: 'location',
    nouns: 'locations',
    heading: (game) => `Every location in ${game}`,
    query: (game) => `${game} locations`,
  },
  quests: {
    noun: 'chapter',
    nouns: 'chapters',
    heading: (game) => `Every chapter and mission in ${game}`,
    query: (game) => `${game} chapters`,
  },
  achievements: {
    noun: 'achievement',
    nouns: 'achievements',
    heading: (game) => `All achievements in ${game}`,
    query: (game) => `${game} achievements`,
  },
}

/*
  Every generated guide is published, explicitly.

  `Guides` has `versions: { drafts: true }`, and Payload defaults a document
  it creates to `_status: 'draft'`. A draft is a complete, correct, fully
  populated row that the public site will not serve: the page 404s,
  `generateStaticParams` never sees it, and every count taken against the
  database still agrees the page is there. Nothing errors and nothing warns.
  Three hundred and thirty-five pages were written that way.

  If a generated page should ever start life unpublished, that has to be a
  decision somebody writes down here - not the default winning by silence.
*/
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
    await payload.update({
      collection: 'guides',
      id: existing.docs[0].id,
      data: { ...data, game: gameId, _status: 'published' } as never,
      depth: 0,
    })
    return
  }
  await payload.create({
    collection: 'guides',
    data: { ...data, game: gameId, _status: 'published' } as never,
    depth: 0,
  })
}

async function run(): Promise<void> {
  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 50, sort: 'title', depth: 0 })
  const authors = await payload.find({ collection: 'authors', limit: 20, depth: 0 })

  /** Whoever covers this beat, so a guide is signed rather than anonymous. */
  const bylineFor = (topic: 'completion' | 'performance' | 'launch') => {
    const wanted =
      topic === 'completion'
        ? 'Achievements'
        : topic === 'performance'
          ? 'Performance'
          : 'Launch'
    return (
      authors.docs.find((author) => String(author.role ?? '').includes(wanted))?.id ??
      authors.docs[0]?.id
    )
  }

  let written = 0

  for (const game of games.docs) {
    const name = (game.shortTitle as string) || (game.title as string)
    const where = { game: { equals: game.id } }

    /*
      A roundup is compiled from records that each carry their own citation, so
      its own source is the game itself. Naming the store page is the honest
      anchor: it establishes that the game exists, who made it and when, which
      is what every one of these pages asserts before it lists anything.
    */
    const sources = game.storeUrl
      ? [
          {
            title: `${game.title} — official store page`,
            url: game.storeUrl as string,
            retrieved: new Date().toISOString().slice(0, 10),
          },
        ]
      : []

    // Everything this wiki holds, once.
    const holdings: Record<string, Row[]> = {}
    for (const collection of GAME_SCOPED) {
      if (collection === 'guides') continue
      const found = await payload.find({
        collection,
        where,
        limit: 1000,
        depth: 0,
        sort: 'title',
        pagination: false,
      })
      holdings[collection] = found.docs as unknown as Row[]
    }

    let count = 0

    // --- One roundup per section that has something in it -----------------
    for (const [collection, copy] of Object.entries(SECTION_COPY)) {
      const rows = holdings[collection] ?? []
      if (rows.length < 3) continue

      const path = SECTION_PATH[collection as keyof typeof SECTION_PATH]

      const blocks: Block[] = [
        `This wiki catalogues ${plural(rows.length, copy.noun, copy.nouns)} in ${name}. The full list is below, and each name links to what is recorded about it — where the figures came from, and what is still unknown.`,
        { h: `All ${rows.length}` },
        { ul: rows.map((row) => row.title) },
        { h: 'What this list is, and is not' },
        `It is every ${copy.noun} this database holds for ${name}, counted when the page was built rather than typed in, so it cannot drift out of step with the records. Where an entry came from a community wiki it says so on its own page and carries medium confidence until somebody checks it against the game.`,
        `It is not a complete list of everything in the game. A ${copy.noun} nobody has documented yet is not here, and this page will not pretend otherwise.`,
      ]

      await upsert(payload, game.id, `all-${collection}`, {
        title: copy.heading(name),
        slug: `all-${collection}`,
        targetQuery: copy.query(name),
        summary: `All ${plural(rows.length, copy.noun, copy.nouns)} recorded in ${name}, including ${nameSome(rows)}. Counted from the database, not claimed.`,
        body: rich(...blocks),
        author: bylineFor('completion'),
        sources,
        confidence: 'high',
      })
      count += 1
    }

    // --- The hardest achievements ----------------------------------------
    const achievements = (holdings.achievements ?? []) as (Row & {
      globalPercent?: number | null
      rarity?: string | null
      hidden?: boolean | null
    })[]

    const rare = achievements
      .filter((row) => typeof row.globalPercent === 'number')
      .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))

    if (rare.length >= 5) {
      const hardest = rare.slice(0, 15)
      const hidden = achievements.filter((row) => row.hidden).length

      await upsert(payload, game.id, 'hardest-achievements', {
        title: `The hardest achievements in ${name}`,
        slug: 'hardest-achievements',
        targetQuery: `${name} hardest achievements`,
        summary: `The ${hardest.length} rarest achievements in ${name}, led by ${hardest[0].title} at ${hardest[0].globalPercent}% of players. Figures read from the platform, not estimated.`,
        body: rich(
          `Sorted by how few players have them. The percentage is what the platform reports, so it moves — an achievement gets commoner as more people finish the game, and a figure quoted anywhere without a date is worth nothing.`,
          { h: 'Rarest first' },
          {
            ul: hardest.map(
              (row) => `${row.title} — ${row.globalPercent}% of players`,
            ),
          },
          { h: 'What makes an achievement rare' },
          `Three things, usually: it is at the end of a long game, it asks for something most players will not repeat, or it is hidden and nobody knows to go for it. ${hidden > 0 ? `${hidden} of the ${achievements.length} here are hidden, which means the game does not tell you what it wants until you have done it.` : ''}`,
          `How to actually get each one is written on its own page, and only once somebody has done it. An achievement page here that says nothing is one nobody has earned yet — which is more useful than a guess at what the name implies.`,
        ),
        author: bylineFor('completion'),
        sources,
        confidence: 'high',
      })
      count += 1
    }

    // --- What this wiki has, as a page ------------------------------------
    const sections = Object.entries(holdings)
      .filter(([, rows]) => rows.length > 0)
      .sort((a, b) => b[1].length - a[1].length)

    if (sections.length > 0) {
      const total = sections.reduce((sum, [, rows]) => sum + rows.length, 0)

      await upsert(payload, game.id, 'what-is-documented', {
        title: `What is documented for ${name}, and what is not`,
        slug: 'what-is-documented',
        targetQuery: `${name} wiki`,
        summary: `${plural(total, 'record')} across ${plural(sections.length, 'section')}, and an honest account of the gaps. Counted from the database when this page was built.`,
        body: rich(
          `This wiki holds ${plural(total, 'record')} for ${name}. Here is exactly what that covers, and — more usefully — what it does not.`,
          { h: 'What is here' },
          {
            ul: sections.map(
              ([collection, rows]) => `${plural(rows.length, 'entry', 'entries')} — ${collection.replace(/-/g, ' ')}`,
            ),
          },
          { h: 'Where it came from' },
          `Three sources, and every record says which. The publisher's own store page, for release dates, editions, system requirements and the achievement list. Community wikis, for names and the structured facts in their infoboxes — taken as facts, never as prose, and marked medium confidence because one mutable source is exactly what medium means. And our own writing, for anything that reads as a sentence.`,
          { h: 'What is missing' },
          `How things actually play. Where an item is found, how a boss fights, which route through a chapter is quicker. Those need somebody who has played ${name}, and every page that lacks them says so in the space where they will go.`,
          `That is deliberate. Every competing wiki will have those sections filled on launch day, written from trailers and preview footage. A blank here is a promise that what is filled in is real.`,
        ),
        author: bylineFor('launch'),
        sources,
        confidence: 'high',
      })
      count += 1
    }

    written += count
    console.log(`  ${name.padEnd(24)} ${count} guides`)
  }

  console.log(`\n${written} roundup guides`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
