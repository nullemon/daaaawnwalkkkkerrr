import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { CollectionSlug, Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'
import { slugify } from '../fields/shared'

/**
 * Upload one harvested image, once.
 *
 * Keyed on the filename we give it, so re-running does not fill the library
 * with copies. A failed upload loses the picture, never the record — a page
 * with facts and no illustration is still worth having.
 */
const uploadImage = async (
  payload: Payload,
  file: string,
  filename: string,
  alt: string,
  credit: string,
): Promise<number | string | null> => {
  if (!fs.existsSync(file)) return null

  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) return existing.docs[0].id

  const extension = path.extname(filename).toLowerCase()
  const mimetype =
    extension === '.png'
      ? 'image/png'
      : extension === '.gif'
        ? 'image/gif'
        : extension === '.webp'
          ? 'image/webp'
          : 'image/jpeg'

  try {
    const created = await payload.create({
      collection: 'media',
      data: { alt, credit } as never,
      file: {
        data: fs.readFileSync(file),
        mimetype,
        name: filename,
        size: fs.statSync(file).size,
      },
    })
    return created.id
  } catch {
    return null
  }
}

/**
 * Turns harvested wiki entities into records.
 *
 *   pnpm seed:entities
 *
 * ## The line this walks
 *
 * `tools/fetch-wiki-entities.mjs` collects a page's title, its infobox
 * parameters and its URL. Facts. This file turns those into records with
 * summaries **we compose**, using the sentence templates below — the same
 * approach `lib/seo.ts` already uses to write four hundred meta descriptions
 * from Dawnwalker's own fields.
 *
 * Not one sentence of anybody's prose is copied. What is reused is the shape
 * of the world: that a character is a Ronin aged 21, that a shotgun is
 * lever-action with an eight-shell magazine. Facts are free to compile;
 * sentences are not.
 *
 * ## Confidence
 *
 * Every record lands at `medium` and cites the page it came from. A community
 * wiki is one source and a mutable one, which is exactly what medium means
 * here: good enough to publish, not good enough to assert against a
 * contradiction. Anything checked against the game itself gets promoted by
 * hand.
 *
 * Idempotent on (game, slug). Re-running after a re-harvest updates.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const RAW_DIR = path.join(dirname, 'raw', 'wiki-entities')

type Entity = {
  title: string
  wikiTitle: string
  collection: string
  facts: Record<string, string>
  categories: string[]
  url: string
  /** Path to the page's lead image, downloaded by the harvester. */
  imageFile?: string
}

type Harvest = { slug: string; host: string; fetchedAt: string; entities: Entity[] }

/**
 * Infobox keys worth putting on the page, in the order a reader wants them.
 *
 * Wikis name these inconsistently — `type`, `Type`, `weapon type` — so each
 * entry matches loosely. Anything unmatched still gets kept; this only
 * controls what is promoted to the top of the fact panel.
 */
const PREFERRED = [
  /^(type|class|category|weapon type|kind)$/i,
  /^(occupation|role|rank|title|position)$/i,
  /^(faction|allegiance|affiliation|manufacturer|allegiances)$/i,
  /^(species|race|nationality|origin)$/i,
  /^(age|birthdate|born)$/i,
  /^(damage.*|rate of fire|magazine|ammo.*|accuracy|range|size)$/i,
  /^(location|region|area|appears in|first appearance)$/i,
  /^(status|alignment)$/i,
]

const orderedFacts = (facts: Record<string, string>) => {
  const entries = Object.entries(facts)
  const scored = entries.map(([label, value]) => {
    const index = PREFERRED.findIndex((pattern) => pattern.test(label))
    return { label, value, rank: index === -1 ? PREFERRED.length : index }
  })
  return scored.sort((a, b) => a.rank - b.rank).slice(0, 12)
}

/** Sentence case a wiki's infobox key: "rate of fire" -> "Rate of fire". */
const label = (key: string) =>
  key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (character) => character.toUpperCase())

const joinList = (values: string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`

/**
 * Our sentence, from their facts.
 *
 * Written per collection because the interesting facts differ: a character is
 * described by what they do and who they serve, a weapon by what it is and how
 * it performs. Falls back to naming the game when an entity has no usable
 * infobox, which is honest — the page then says what it is and nothing more.
 */
const summaryFor = (entity: Entity, gameTitle: string): string => {
  const facts = entity.facts
  const get = (...patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const hit = Object.entries(facts).find(([key]) => pattern.test(key))
      if (hit?.[1]) return hit[1]
    }
    return undefined
  }

  const noun: Record<string, string> = {
    characters: 'a character',
    enemies: 'an enemy',
    items: 'an item',
    regions: 'a location',
    quests: 'a chapter',
    perks: 'an ability',
    mechanics: 'a system',
    endings: 'an ending',
  }

  const parts: string[] = []

  if (entity.collection === 'characters') {
    const occupation = get(/^(occupation|role|position)$/i)
    const faction = get(/^(faction|allegiance|affiliation|allegiances)$/i)
    parts.push(
      `${entity.title} is ${occupation ? `a ${occupation.toLowerCase()}` : 'a character'} in ${gameTitle}.`,
    )
    if (faction) parts.push(`Aligned with ${faction}.`)
  } else if (entity.collection === 'enemies') {
    const type = get(/^(type|class|species|category)$/i)
    parts.push(`${entity.title}, ${type ? `a ${type.toLowerCase()}` : 'an enemy'} in ${gameTitle}.`)
  } else if (entity.collection === 'items') {
    const type = get(/^(type|weapon type|class|category)$/i)
    const maker = get(/^(manufacturer|maker|made by)$/i)
    parts.push(`${entity.title}, ${type ? `a ${type.toLowerCase()}` : 'an item'} in ${gameTitle}.`)
    if (maker) parts.push(`Made by ${maker}.`)
  } else if (entity.collection === 'regions') {
    const region = get(/^(region|area|located|location)$/i)
    parts.push(`${entity.title}, a location in ${gameTitle}.`)
    if (region) parts.push(`In ${region}.`)
  } else {
    parts.push(`${entity.title}, ${noun[entity.collection] ?? 'an entry'} in ${gameTitle}.`)
  }

  parts.push('Compiled from a community wiki and not yet checked against the game.')
  return parts.join(' ').slice(0, 300)
}

/** The body: what we know, and plainly what we do not. */
const bodyFor = (entity: Entity, gameTitle: string): Block[] => {
  const facts = orderedFacts(entity.facts)
  const blocks: Block[] = []

  if (facts.length > 0) {
    blocks.push(
      `What a community wiki records about ${entity.title}. Every figure below is restated from the page cited at the foot of this one, and none of it has been verified against ${gameTitle} by us.`,
    )
    blocks.push({ ul: facts.map((fact) => `${label(fact.label)}: ${fact.value}`) })
  } else {
    blocks.push(
      `${entity.title} is catalogued in ${gameTitle}, but the source page carries no structured detail yet — only that this exists and what it is called.`,
    )
  }

  blocks.push({ h: 'What is missing' })
  blocks.push(
    entity.collection === 'items'
      ? 'Where it is found, what it is worth carrying over, and how it behaves in practice. Those need somebody who has used it, and are left empty rather than inferred from the statistics above.'
      : entity.collection === 'enemies'
        ? 'How it actually fights, what it is weak to, and where you meet it. Those need somebody who has fought it.'
        : 'Anything about how this plays. That needs somebody who has played it, and is left empty rather than guessed from a name.',
  )

  return blocks
}

async function upsert(
  payload: Payload,
  collection: CollectionSlug,
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

/**
 * Fields a collection requires beyond the shared ones.
 *
 * Payload rejects a create that omits a required field, and each of these
 * collections was designed around Dawnwalker's data where the value was always
 * known. A harvested entity often has none of them, so this supplies the
 * least-committal valid value rather than inventing a plausible one.
 */
const REQUIRED_DEFAULTS: Record<string, Record<string, unknown>> = {
  items: { category: 'quest' },
  quests: { kind: 'side', phase: 'either', time: { known: false } },
  enemies: {},
  characters: {},
  regions: {},
  mechanics: {},
}

/**
 * Collections a harvested entity cannot be written into, and where it goes
 * instead.
 *
 * A perk requires a skill tree, and a tree is a thing somebody designs after
 * playing the game — there is no honest default. Rather than inventing a
 * "General" tree per game so a foreign record fits, an ability page is filed
 * as a systems page, which is what it actually is until somebody maps the
 * tree.
 */
const REHOME: Record<string, string> = { perks: 'mechanics', endings: 'mechanics' }

async function run(): Promise<void> {
  if (!fs.existsSync(RAW_DIR)) {
    console.log(`No ${RAW_DIR}. Run \`node tools/fetch-wiki-entities.mjs\` first.`)
    process.exit(0)
  }

  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  let total = 0

  for (const file of fs.readdirSync(RAW_DIR).filter((name) => name.endsWith('.json'))) {
    const harvest: Harvest = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8'))
    if (harvest.entities.length === 0) continue

    const found = await payload.find({
      collection: 'games',
      where: { slug: { equals: harvest.slug } },
      limit: 1,
      depth: 0,
    })
    if (found.docs.length === 0) {
      console.log(`  ${harvest.slug}: no such game, skipped`)
      continue
    }
    const game = found.docs[0]
    const gameTitle = (game.shortTitle as string) || (game.title as string)

    console.log(game.title)

    const counts: Record<string, number> = {}
    const seen = new Set<string>()
    let failed = 0

    for (const entity of harvest.entities) {
      entity.collection = REHOME[entity.collection] ?? entity.collection

      let slug = slugify(entity.title)
      if (!slug) continue

      const key = `${entity.collection}:${slug}`
      if (seen.has(key)) {
        let suffix = 2
        while (seen.has(`${entity.collection}:${slug}-${suffix}`)) suffix += 1
        slug = `${slug}-${suffix}`
      }
      seen.add(`${entity.collection}:${slug}`)

      /*
        The page's own lead image, credited to the wiki it came from. This is
        the one place a picture is attached to a named record, and it is safe
        precisely because the wiki labelled it: the image on the page for a
        named character is a picture of that character. The rule about
        unidentified screenshots in docs/ASSETS.md is about the opposite case.
      */
      let imageId: number | string | null = null
      if (entity.imageFile) {
        imageId = await uploadImage(
          payload,
          path.resolve(entity.imageFile),
          `${harvest.slug}-${slug}${path.extname(entity.imageFile) || '.png'}`,
          `${entity.title} in ${gameTitle}`,
          `Image via ${harvest.host}.`,
        )
      }

      try {
        await upsert(payload, entity.collection as CollectionSlug, game.id, slug, {
        ...(REQUIRED_DEFAULTS[entity.collection] ?? {}),
        ...(imageId ? { image: imageId } : {}),
        title: entity.title,
        slug,
        summary: summaryFor(entity, gameTitle),
        body: rich(...bodyFor(entity, gameTitle)),
        // One source, mutable, unverified against the game. That is medium.
        confidence: 'medium',
        sources: [
          {
            title: `${entity.wikiTitle} — ${harvest.host}`,
            url: entity.url,
            retrieved: harvest.fetchedAt,
          },
        ],
      })

        counts[entity.collection] = (counts[entity.collection] ?? 0) + 1
        total += 1
      } catch (error) {
        /*
          One record that will not validate must not take the other five
          hundred with it. Harvested data is other people's data and will
          always contain a shape nothing here anticipated.
        */
        failed += 1
        if (failed <= 5) {
          console.log(`    skipped ${entity.collection}/${slug}: ${(error as Error).message}`)
        }
      }
    }

    console.log(
      `  ${joinList(Object.entries(counts).map(([key, value]) => `${value} ${key}`))}` +
        (failed > 0 ? ` — ${failed} skipped` : ''),
    )
  }

  console.log(`\n${total} records from community wikis`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
