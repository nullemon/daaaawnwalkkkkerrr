import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { CollectionSlug, Payload } from 'payload'

import config from '../payload.config'
import {
  EDGE_RULES,
  buildIndex,
  fold,
  isEmptyEdge,
  resolveRule,
  wouldCycle,
  type LinkTarget,
  type TitleIndex,
} from '../lib/entity-links'

/**
 * Joins up the harvested wikis.
 *
 *   pnpm seed:entity-links
 *
 * `pnpm seed:entities` writes facts and no edges, so on the seven harvested
 * wikis every relationship field is empty: a Gears character's page names no
 * region, a Silent Hill enemy links to nothing. The facts that would join them
 * were already in `src/seed/raw/wiki-entities/` — a character's infobox says
 * `homeland = "Kalona, Tyrus"` and there is a region record called Kalona in
 * the same game.
 *
 * The matching rules are in `src/lib/entity-links.ts`, kept pure so they can be
 * tested without a database. This file is the part that needs one.
 *
 * ## Three things it will not do
 *
 * **It only writes into an empty field.** Dawnwalker's 440 records were
 * researched by hand and its edges are the load-bearing data the run checker
 * walks; a generator may fill a gap and never overwrite an answer. Dawnwalker
 * is not harvested and so has no raw file, but the empty-field rule is what
 * actually holds if one ever appears.
 *
 * **It only matches inside one game.** Every public read on this site filters
 * on game, and a fact from the Silent Hill wiki reaching a Gears record would
 * be the franchise-import error in a new costume.
 *
 * **It refuses rather than guesses.** A value naming two records writes
 * nothing. That is why the unmatched count below is large, and the count is the
 * finding — the same way `pnpm seed:topics` prints a per-wiki guide count and
 * the gap is the result rather than the failure. Padding it by loosening the
 * match would put wrong edges on pages that read as researched, which costs
 * more than the missing ones.
 *
 * Idempotent: a second run finds the fields it filled non-empty and writes
 * nothing.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const RAW_DIR = path.join(dirname, 'raw', 'wiki-entities')

type Entity = {
  title: string
  collection: string
  facts: Record<string, string>
}

type Harvest = { slug: string; entities: Entity[] }

type Doc = { id: number | string; title: string } & Record<string, unknown>

/** Every record of one collection for one game. Ids and titles, nothing else. */
const loadDocs = async (
  payload: Payload,
  collection: string,
  gameId: number | string,
): Promise<Doc[]> => {
  const found = await payload.find({
    collection: collection as CollectionSlug,
    where: { game: { equals: gameId } },
    limit: 0,
    pagination: false,
    depth: 0,
  })
  return found.docs as unknown as Doc[]
}

/**
 * Folded title -> the one record with it, for finding the record a harvested
 * entity became.
 *
 * `seed:entities` slugifies the title and disambiguates collisions with a
 * numeric suffix, so the slug is not a reliable way back. The title is, and
 * where two records share one the entity is skipped rather than guessed at.
 */
const byTitle = (docs: Doc[]): Map<string, Doc | null> => {
  const map = new Map<string, Doc | null>()
  for (const doc of docs) {
    const key = fold(String(doc.title ?? ''))
    if (!key) continue
    map.set(key, map.has(key) ? null : doc)
  }
  return map
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

async function run(): Promise<void> {
  if (!fs.existsSync(RAW_DIR)) {
    console.log(`No ${RAW_DIR}. Run \`pnpm fetch:entities\` first.`)
    process.exit(0)
  }

  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  const sourceCollections = [...new Set(EDGE_RULES.map((rule) => rule.from))]
  const targetCollections = [...new Set(EDGE_RULES.map((rule) => rule.to))]

  let totalEdges = 0
  let totalUnmatched = 0

  for (const file of fs.readdirSync(RAW_DIR).filter((name) => name.endsWith('.json'))) {
    const harvest: Harvest = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8'))
    if (harvest.entities.length === 0) continue

    /*
      Belt and braces. Dawnwalker has no harvest file — its records are
      hand-researched — but if one ever lands here, hand-written edges are not
      this pass's to touch.
    */
    if (harvest.slug === 'dawnwalker') {
      console.log('dawnwalker: hand-researched, skipped')
      continue
    }

    const games = await payload.find({
      collection: 'games',
      where: { slug: { equals: harvest.slug } },
      limit: 1,
      depth: 0,
    })
    if (games.docs.length === 0) {
      console.log(`  ${harvest.slug}: no such game, skipped`)
      continue
    }
    const game = games.docs[0]

    const docsFor = new Map<string, Doc[]>()
    for (const collection of new Set([...sourceCollections, ...targetCollections])) {
      docsFor.set(collection, await loadDocs(payload, collection, game.id))
    }

    const indexes = new Map<string, TitleIndex>()
    for (const collection of targetCollections) {
      const targets: LinkTarget[] = (docsFor.get(collection) ?? []).map((doc) => ({
        id: doc.id,
        title: String(doc.title ?? ''),
      }))
      indexes.set(collection, buildIndex(targets))
    }

    const lookups = new Map<string, Map<string, Doc | null>>()
    for (const collection of sourceCollections) {
      lookups.set(collection, byTitle(docsFor.get(collection) ?? []))
    }

    /*
      One graph per self-referencing field, seeded with what is already stored
      so a re-run cannot close a loop the first run left open. Grown as edges
      are staged, which is what catches "A inside B" and "B inside A" arriving
      in the same pass: the second one sees the first.

      Which of the two survives is decided by harvest file order. That is
      stable rather than correct — the wiki states both and nothing here can
      tell which is the mistake — so it is a coin flip only in the sense that
      one of two claims that cannot both be true gets kept.
    */
    const graphs = new Map<string, Map<number | string, (number | string)[]>>()
    for (const rule of EDGE_RULES.filter((entry) => entry.acyclic)) {
      const graph = new Map<number | string, (number | string)[]>()
      for (const doc of docsFor.get(rule.from) ?? []) {
        const current = doc[rule.field]
        const ids = Array.isArray(current) ? current : current == null ? [] : [current]
        if (ids.length > 0) graph.set(doc.id, ids as (number | string)[])
      }
      graphs.set(rule.field, graph)
    }

    // field -> edges written, counted as relationships not records.
    const wrote: Record<string, number> = {}
    const staged = new Map<Doc, { collection: string; data: Record<string, unknown> }>()
    let unmatched = 0
    let ambiguous = 0
    let alreadySet = 0
    let qualifierDropped = 0
    let noRecord = 0
    let cycles = 0
    const examples: string[] = []

    for (const entity of harvest.entities) {
      const rules = EDGE_RULES.filter((rule) => rule.from === entity.collection)
      if (rules.length === 0) continue

      const doc = lookups.get(entity.collection)?.get(fold(entity.title))
      // Pruned by `seed:prune-entities`/`check:kind`, or never written. Either
      // way there is no record to hang an edge on.
      if (!doc) {
        noRecord += 1
        continue
      }

      for (const rule of rules) {
        const pending = staged.get(doc)?.data ?? {}
        const current = rule.field in pending ? pending[rule.field] : doc[rule.field]
        if (!isEmptyEdge(current)) {
          alreadySet += 1
          continue
        }

        const index = indexes.get(rule.to)
        if (!index) continue

        const result = resolveRule(entity.facts ?? {}, rule, index, doc.id)
        if (!result) continue
        qualifierDropped += result.droppedQualified.length

        /*
          The chain check, after matching and before staging. A candidate that
          closes a loop is dropped rather than the whole value, so "inside the
          Research Sector and the Oldest House" keeps whichever half is not
          already above this record.
        */
        const graph = graphs.get(rule.field)
        let ids = result.ids
        if (graph) {
          const safe = ids.filter((id) => !wouldCycle(doc.id, id, graph))
          cycles += ids.length - safe.length
          ids = safe
        }

        if (ids.length === 0) {
          unmatched += 1
          if (result.ambiguous) ambiguous += 1
          if (examples.length < 3) {
            examples.push(`${entity.title} ${result.key}="${result.value.slice(0, 60)}"`)
          }
          continue
        }

        const entry = staged.get(doc) ?? { collection: entity.collection, data: {} }
        entry.data[rule.field] = rule.hasMany ? ids : ids[0]
        staged.set(doc, entry)
        graph?.set(doc.id, ids)
        wrote[rule.field] = (wrote[rule.field] ?? 0) + ids.length
      }
    }

    let failed = 0
    for (const [doc, entry] of staged) {
      try {
        await payload.update({
          collection: entry.collection as CollectionSlug,
          id: doc.id,
          data: entry.data as never,
          depth: 0,
        })
      } catch (error) {
        /*
          One record that will not validate must not take the rest with it —
          the same rule `seed:entities` follows, for the same reason: this is
          other people's data and will contain a shape nothing here expected.
        */
        failed += 1
        if (failed <= 3) console.log(`    ${entry.collection}/${doc.title}: ${(error as Error).message}`)
      }
    }

    const edges = Object.values(wrote).reduce((sum, count) => sum + count, 0)
    totalEdges += edges
    totalUnmatched += unmatched

    console.log(game.title)
    console.log(
      `  ${plural(edges, 'edge')} on ${plural(staged.size, 'record')}` +
        (failed > 0 ? ` — ${failed} failed to write` : ''),
    )
    for (const [field, count] of Object.entries(wrote).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${field}: ${count}`)
    }
    console.log(
      `  ${unmatched} fact values named nothing here` +
        (ambiguous > 0 ? ` (${ambiguous} named more than one)` : '') +
        (cycles > 0 ? `, ${cycles} refused as a loop` : '') +
        (qualifierDropped > 0 ? `, ${qualifierDropped} fragments dropped as qualified` : '') +
        (alreadySet > 0 ? `, ${alreadySet} fields already set` : '') +
        (noRecord > 0 ? `, ${noRecord} entities have no record` : ''),
    )
    for (const example of examples) console.log(`    e.g. ${example}`)
  }

  console.log(`\n${totalEdges} edges written, ${totalUnmatched} fact values unmatched`)
  console.log(
    'The unmatched count is the finding, not the failure: a value naming two\n' +
      'records or none writes nothing, because a wrong edge reads as researched.',
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
