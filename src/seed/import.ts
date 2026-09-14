import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { CollectionSlug, Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'

/**
 * Ingests the researched JSON in `raw/` into the database.
 *
 * Research output is machine-written and gets treated as untrusted: every
 * record is validated, anything malformed is skipped with a warning rather
 * than crashing the run, and records missing a source are rejected outright.
 * A guide site whose whole pitch is "we cite everything" cannot let an
 * uncited record through the front door.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const RAW_DIR = path.join(dirname, 'raw')
const RETRIEVED = new Date().toISOString().slice(0, 10)

type Source = { title?: string; url?: string; retrieved?: string }
type Raw = Record<string, unknown> & {
  slug?: string
  title?: string
  summary?: string
  bodyParagraphs?: Block[]
  sources?: Source[]
  confidence?: string
  note?: string
}

const problems: string[] = []
const warn = (message: string) => {
  problems.push(message)
  console.warn(`  ! ${message}`)
}

const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\/\S+$/i.test(value)

const CONFIDENCE = new Set(['high', 'medium', 'low'])

/** A record is only usable if it can be addressed, named, and traced. */
function validate(record: Raw, collection: string, index: number): boolean {
  const where = `${collection}[${index}] "${record.title ?? record.slug ?? 'untitled'}"`
  if (typeof record.slug !== 'string' || !/^[a-z0-9-]+$/.test(record.slug)) {
    warn(`${where}: missing or malformed slug — skipped`)
    return false
  }
  if (typeof record.title !== 'string' || !record.title.trim()) {
    warn(`${where}: missing title — skipped`)
    return false
  }
  const sources = (record.sources ?? []).filter((source) => isHttpUrl(source?.url))
  if (sources.length === 0) {
    warn(`${where}: no citable source — skipped`)
    return false
  }
  return true
}

const cleanSources = (sources: Source[] = []) =>
  sources
    .filter((source) => isHttpUrl(source?.url))
    .map((source) => ({
      title: source.title?.slice(0, 200) || source.url,
      url: source.url,
      retrieved: source.retrieved || RETRIEVED,
    }))

const confidenceOf = (record: Raw) =>
  CONFIDENCE.has(String(record.confidence)) ? String(record.confidence) : 'low'

/** Note any source disagreement into the body so readers see it, not just editors. */
function bodyOf(record: Raw) {
  const blocks: Block[] = Array.isArray(record.bodyParagraphs) ? [...record.bodyParagraphs] : []
  if (typeof record.note === 'string' && record.note.trim()) {
    blocks.push({ h: 'Sources disagree' }, record.note)
  }
  return blocks.length > 0 ? rich(...blocks) : undefined
}

async function loadRawFiles(): Promise<Map<string, Raw[]>> {
  const byCollection = new Map<string, Raw[]>()
  if (!fs.existsSync(RAW_DIR)) return byCollection

  for (const file of fs.readdirSync(RAW_DIR).filter((name) => name.endsWith('.json'))) {
    const full = path.join(RAW_DIR, file)
    let parsed: { collection?: string; records?: Raw[] }
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
    } catch (error) {
      warn(`${file}: invalid JSON — whole file skipped (${(error as Error).message})`)
      continue
    }
    const collection = parsed.collection
    const records = parsed.records
    if (!collection || !Array.isArray(records)) {
      warn(`${file}: missing "collection" or "records" — skipped`)
      continue
    }
    const existing = byCollection.get(collection) ?? []
    // Later files lose to earlier ones on a slug clash, so a duplicate cannot
    // silently overwrite a better-sourced record.
    const seen = new Set(existing.map((record) => record.slug))
    const fresh = records.filter((record) => {
      if (record?.slug && seen.has(record.slug)) {
        warn(`${file}: duplicate slug "${record.slug}" — kept the first one`)
        return false
      }
      return true
    })
    byCollection.set(collection, [...existing, ...fresh])
    console.log(`  read ${file}: ${records.length} records`)
  }
  return byCollection
}

async function slugIndex(payload: Payload, collection: CollectionSlug) {
  const result = await payload.find({ collection, limit: 2000, depth: 0, pagination: false })
  return new Map(result.docs.map((doc) => [(doc as { slug: string }).slug, doc.id]))
}

async function upsert(
  payload: Payload,
  collection: CollectionSlug,
  slug: string,
  data: Record<string, unknown>,
): Promise<string | number | null> {
  try {
    const existing = await payload.find({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs.length > 0) {
      const id = existing.docs[0].id
      await payload.update({ collection, id, data: data as never, depth: 0 })
      return id
    }
    const created = await payload.create({ collection, data: data as never, depth: 0 })
    return created.id
  } catch (error) {
    warn(`${collection}/${slug}: write failed — ${(error as Error).message}`)
    return null
  }
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  console.log('Reading research output…')
  const raw = await loadRawFiles()
  if (raw.size === 0) {
    console.log('Nothing in src/seed/raw — nothing to import.')
    process.exit(0)
  }

  const regions = await slugIndex(payload, 'regions')
  const courts = await slugIndex(payload, 'courts')
  const trees = await slugIndex(payload, 'skill-trees')

  const base = (record: Raw) => ({
    title: record.title,
    slug: record.slug,
    summary: (record.summary as string) || `${record.title}.`,
    body: bodyOf(record),
    sources: cleanSources(record.sources),
    confidence: confidenceOf(record),
    // Researched records may carry their own <title> and meta description.
    // This was silently dropped before, so every seo field written in
    // src/seed/raw/ was thrown away and every page fell back to deriving one.
    seo: record.seo ?? undefined,
  })

  const counts: Record<string, number> = {}
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1
  }

  // --- simple collections -------------------------------------------------
  for (const record of raw.get('items') ?? []) {
    if (!validate(record, 'items', 0)) continue
    const ok = await upsert(payload, 'items', record.slug!, {
      ...base(record),
      category: record.category ?? 'quest',
      rarity: record.rarity,
      region: regions.get(String(record.regionSlug)),
      acquisition: record.acquisition,
      howToGet: record.howToGet,
      stats: Array.isArray(record.stats) ? record.stats : undefined,
    })
    if (ok) bump('items')
  }

  for (const record of raw.get('perks') ?? []) {
    if (!validate(record, 'perks', 0)) continue
    const tree = trees.get(String(record.treeSlug))
    if (!tree) {
      warn(`perks/${record.slug}: unknown treeSlug "${record.treeSlug}" — skipped`)
      continue
    }
    const ok = await upsert(payload, 'perks', record.slug!, {
      ...base(record),
      tree,
      isUltimate: Boolean(record.isUltimate),
      timeCostSegments: typeof record.timeCostSegments === 'number' ? record.timeCostSegments : undefined,
      foundInWorld: Boolean(record.foundInWorld),
      effect: record.effect,
    })
    if (ok) bump('perks')
  }

  for (const record of raw.get('characters') ?? []) {
    if (!validate(record, 'characters', 0)) continue
    const ok = await upsert(payload, 'characters', record.slug!, {
      ...base(record),
      role: record.role,
      romanceable: Boolean(record.romanceable),
      region: regions.get(String(record.regionSlug)),
    })
    if (ok) bump('characters')
  }

  for (const record of raw.get('enemies') ?? []) {
    if (!validate(record, 'enemies', 0)) continue
    const ok = await upsert(payload, 'enemies', record.slug!, {
      ...base(record),
      isBoss: Boolean(record.isBoss),
      region: regions.get(String(record.regionSlug)),
      phase: record.phase ?? 'either',
      weaknesses: Array.isArray(record.weaknesses)
        ? (record.weaknesses as string[]).map((value) => ({ value }))
        : undefined,
    })
    if (ok) bump('enemies')
  }

  for (const record of raw.get('regions') ?? []) {
    if (!validate(record, 'regions', 0)) continue
    const ok = await upsert(payload, 'regions', record.slug!, {
      ...base(record),
      dangerRating: record.dangerRating,
      court: courts.get(String(record.courtSlug)),
    })
    if (ok) bump('regions')
  }

  for (const record of raw.get('court-activities') ?? []) {
    if (!validate(record, 'court-activities', 0)) continue
    const court = courts.get(String(record.courtSlug))
    if (!court) {
      warn(`court-activities/${record.slug}: unknown courtSlug "${record.courtSlug}" — skipped`)
      continue
    }
    const ok = await upsert(payload, 'court-activities', record.slug!, {
      ...base(record),
      court,
      region: regions.get(String(record.regionSlug)),
      phase: record.phase ?? 'either',
      // No source publishes a per-activity figure yet, so this stays explicitly
      // unknown rather than importing as a zero anyone could mistake for free.
      time: record.time ?? { known: false },
      howToStart: record.howToStart,
    })
    if (ok) bump('court-activities')
  }

  // Authors are seeded by `pnpm seed`, so they exist before this runs.
  const authors = await slugIndex(payload, 'authors')
  for (const record of raw.get('guides') ?? []) {
    if (!validate(record, 'guides', 0)) continue
    const ok = await upsert(payload, 'guides', record.slug!, {
      ...base(record),
      targetQuery: record.targetQuery,
      author: authors.get(String(record.authorSlug)),
      updated: record.updated,
      _status: 'published',
    })
    if (ok) bump('guides')
  }

  // --- quests: written first, then linked ---------------------------------
  const questRecords = (raw.get('quests') ?? []).filter((record) => validate(record, 'quests', 0))
  for (const record of questRecords) {
    const time = record.timeSegments as { min?: number; max?: number; known?: boolean } | undefined
    const known = Boolean(time?.known && typeof time?.max === 'number')
    const ok = await upsert(payload, 'quests', record.slug!, {
      ...base(record),
      kind: record.kind ?? 'side',
      region: regions.get(String(record.regionSlug)),
      court: courts.get(String(record.courtSlug)),
      phase: record.phase ?? 'either',
      time: {
        min: known ? time?.min ?? time?.max : 0,
        max: known ? time?.max : 0,
        known,
        confidence: known ? 'medium' : 'low',
        note: known ? undefined : 'Segment cost not confirmed by any source we trust.',
      },
    })
    if (ok) bump('quests')
  }

  const quests = await slugIndex(payload, 'quests')
  for (const record of questRecords) {
    const prereqs = (record.prereqSlugs as string[] | undefined) ?? []
    const excludes = (record.excludeSlugs as string[] | undefined) ?? []
    if (prereqs.length === 0 && excludes.length === 0) continue

    const resolve = (slugs: string[], label: string) => {
      const ids = slugs.map((slug) => quests.get(slug)).filter(Boolean)
      if (ids.length !== slugs.length) {
        warn(`quests/${record.slug}: some ${label} did not resolve — linked the ones that did`)
      }
      return ids
    }

    const id = quests.get(record.slug!)
    if (!id) continue
    await payload.update({
      collection: 'quests',
      id,
      depth: 0,
      data: {
        prereqs: resolve(prereqs, 'prereqSlugs'),
        // Exclusions are what let the checker say "locked out" rather than
        // "out of time" — a different answer with a different remedy.
        excludes: resolve(excludes, 'excludeSlugs'),
      } as never,
    })
  }

  // --- builds: need perks and items to exist first -------------------------
  const perks = await slugIndex(payload, 'perks')
  const items = await slugIndex(payload, 'items')
  for (const record of raw.get('builds') ?? []) {
    if (!validate(record, 'builds', 0)) continue
    const ok = await upsert(payload, 'builds', record.slug!, {
      ...base(record),
      playstyle: record.playstyle ?? 'hybrid',
      difficulty: record.difficulty ?? 'intermediate',
      primaryTree: trees.get(String(record.primaryTreeSlug)),
      perks: ((record.perkSlugs as string[]) ?? []).map((slug) => perks.get(slug)).filter(Boolean),
      items: ((record.itemSlugs as string[]) ?? []).map((slug) => items.get(slug)).filter(Boolean),
    })
    if (ok) bump('builds')
  }

  console.log('\nImported:')
  for (const [collection, count] of Object.entries(counts).sort()) {
    console.log(`  ${String(count).padStart(4)}  ${collection}`)
  }
  console.log(`\n${problems.length} record(s) rejected or flagged.`)
  process.exit(0)
}

run().catch((error) => {
  console.error('Import failed:', error)
  process.exit(1)
})
