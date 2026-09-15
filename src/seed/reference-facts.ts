import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'

/**
 * Turns Wikipedia's game infobox into a credits page per wiki.
 *
 *   pnpm seed:reference
 *
 * A store page says who published a game. It does not say who directed it, who
 * wrote it, who scored it or what engine it runs on — and those are searched
 * constantly ("what engine does X use", "who composed X"). Wikipedia's
 * `{{Infobox video game}}` carries all of them, under CC BY-SA, which this
 * credits on the page and in the source list.
 *
 * As everywhere else here, the facts are reused and the sentences are not.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const REF_DIR = path.join(dirname, 'raw', 'reference')

type Reference = {
  slug: string
  fetchedAt: string
  wikipedia: { title: string; url: string; licence: string; facts: Record<string, string> } | null
}

/**
 * Infobox keys worth a row, in the order a reader scans them, with the label
 * we print. Wikipedia's keys are terse and lower-case; these are not.
 */
const CREDITS: [string, string][] = [
  ['developer', 'Developer'],
  ['publisher', 'Publisher'],
  ['series', 'Series'],
  ['engine', 'Engine'],
  ['director', 'Director'],
  ['producer', 'Producer'],
  ['designer', 'Designer'],
  ['writer', 'Writer'],
  ['artist', 'Artist'],
  ['programmer', 'Programmer'],
  ['composer', 'Composer'],
  ['genre', 'Genre'],
  ['modes', 'Modes'],
  ['platforms', 'Platforms'],
  ['released', 'Released'],
]

async function upsertMechanic(
  payload: Payload,
  gameId: number | string,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'mechanics',
    where: { and: [{ slug: { equals: slug } }, { game: { equals: gameId } }] },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) {
    await payload.update({ collection: 'mechanics', id: existing.docs[0].id, data: { ...data, game: gameId } as never, depth: 0 })
    return
  }
  await payload.create({ collection: 'mechanics', data: { ...data, game: gameId } as never, depth: 0 })
}

async function run(): Promise<void> {
  if (!fs.existsSync(REF_DIR)) {
    console.log('No reference facts. Run `node tools/fetch-reference-facts.mjs` first.')
    process.exit(0)
  }

  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  let written = 0

  for (const file of fs.readdirSync(REF_DIR).filter((name) => name.endsWith('.json'))) {
    const reference: Reference = JSON.parse(fs.readFileSync(path.join(REF_DIR, file), 'utf8'))
    if (!reference.wikipedia) continue

    const found = await payload.find({
      collection: 'games',
      where: { slug: { equals: reference.slug } },
      limit: 1,
      depth: 0,
    })
    if (found.docs.length === 0) continue
    const game = found.docs[0]
    const name = (game.shortTitle as string) || (game.title as string)

    const facts = reference.wikipedia.facts
    const rows = CREDITS.filter(([key]) => facts[key]).map(([key, label]) => ({
      label,
      value: facts[key],
    }))
    if (rows.length < 3) continue

    const engine = facts.engine
    const composer = facts.composer
    const director = facts.director

    const blocks: Block[] = [
      `Who made ${name}, and what they made it with. These are production credits rather than marketing copy — a store page names the publisher and stops there.`,
      { h: 'Credits' },
      { ul: rows.map((row) => `${row.label}: ${row.value}`) },
    ]

    if (engine) {
      blocks.push({ h: 'The engine' })
      blocks.push(
        `${name} runs on ${engine}. That is worth knowing beyond trivia: an engine sets what the PC version is likely to offer — how its settings menu is laid out, whether it supports ultrawide and uncapped frame rates out of the box, and which of the usual problems it tends to have.`,
      )
    }

    if (composer || director) {
      blocks.push({ h: 'Names worth following' })
      blocks.push(
        [
          director ? `Directed by ${director}.` : '',
          composer ? `Scored by ${composer}.` : '',
          'Credits are the most reliable predictor a game has before release — far more than a trailer.',
        ]
          .filter(Boolean)
          .join(' '),
      )
    }

    blocks.push({ h: 'Where this came from' })
    blocks.push(
      `Wikipedia's article on ${reference.wikipedia.title}, read on ${reference.fetchedAt} and used under ${reference.wikipedia.licence}. The facts are restated; the wording here is ours. Credits get corrected as games ship and this page is rewritten when they do.`,
    )

    await upsertMechanic(payload, game.id, 'development-and-credits', {
      title: `Who made ${name}: development and credits`,
      slug: 'development-and-credits',
      summary: `Director, composer, writer and engine for ${name} — the production credits a store page does not carry.`,
      body: rich(...blocks),
      keyFacts: rows.slice(0, 10).map((row) => ({ ...row, confidence: 'medium' })),
      // Wikipedia is well sourced but is one tertiary source, and credits are
      // routinely corrected after release. Medium is what that means here.
      confidence: 'medium',
      sources: [
        {
          title: `${reference.wikipedia.title} — Wikipedia (${reference.wikipedia.licence})`,
          url: reference.wikipedia.url,
          retrieved: reference.fetchedAt,
        },
      ],
    })

    written += 1
    console.log(`  ${name.padEnd(24)} ${rows.length} credits`)
  }

  console.log(`\n${written} credits pages`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
