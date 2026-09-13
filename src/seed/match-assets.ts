import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { CollectionSlug } from 'payload'
import config from '../payload.config'

/**
 * Match a pile of extracted game files to database records.
 *
 * FModel dumps thousands of PNGs into a mirrored folder tree with names like
 * `T_Icon_Sword_Durandal_01.png`. Renaming those by hand to match record slugs
 * is the real cost of the extraction route, so this does the first pass:
 * strips the engine's naming furniture, scores what is left against every
 * record title and slug, and writes a plan you can read before anything moves.
 *
 *   pnpm assets:match ~/FModel/Output/Exports        # dry run, writes a plan
 *   pnpm assets:match ~/FModel/Output/Exports --apply  # stage into assets/
 *
 * Nothing is copied without --apply, and low-confidence guesses are listed
 * separately rather than silently accepted.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = path.resolve(dirname, '../..')
const ASSET_DIR = path.join(PROJECT, 'assets')
const PLAN_PATH = path.join(PROJECT, 'asset-match-plan.tsv')

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const APPLY = process.argv.includes('--apply')
const SOURCE = args[0]

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.bmp'])

/** Collections worth matching against, and the folder each stages into. */
const TARGETS: { collection: CollectionSlug; folder: string }[] = [
  { collection: 'items', folder: 'items' },
  { collection: 'perks', folder: 'perks' },
  { collection: 'characters', folder: 'characters' },
  { collection: 'enemies', folder: 'enemies' },
  { collection: 'quests', folder: 'quests' },
  { collection: 'regions', folder: 'regions' },
  { collection: 'court-activities', folder: 'court-activities' },
  { collection: 'endings', folder: 'endings' },
  { collection: 'skill-trees', folder: 'skills' },
  { collection: 'courts', folder: 'courts' },
]

/**
 * Unreal naming conventions carry a lot of noise: a `T_` or `UI_` prefix, an
 * `_Icon`/`_Tex` tag, a trailing variant number, and a texture-channel suffix.
 * None of it survives into a record name, so strip it before comparing.
 */
const NOISE_TOKENS = new Set([
  't', 'ui', 'tex', 'texture', 'icon', 'icons', 'img', 'image', 'spr', 'sprite',
  'inv', 'inventory', 'item', 'items', 'thumb', 'thumbnail', 'portrait', 'card',
  'd', 'n', 'r', 'm', 'basecolor', 'diffuse', 'albedo', 'normal', 'mask', 'alpha',
  'small', 'large', 'big', 'lg', 'sm', 'hi', 'lo', 'hires', 'lores',
  'dw', 'bod', 'game', 'content', 'assets', 'common', 'default', 'new', 'final',
])

const tokenise = (raw: string): string[] =>
  raw
    .replace(/\.[a-z0-9]+$/i, '')
    // split camelCase as well as separators
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => t.length > 1) // drops the possessive "s" in "Ambrus's Cuirass"
    .filter((t) => !NOISE_TOKENS.has(t))
    .filter((t) => !/^\d{1,3}$/.test(t))

const normalise = (raw: string): string => tokenise(raw).join('-')

interface Record_ {
  collection: CollectionSlug
  folder: string
  slug: string
  title: string
  norm: string
  tokens: Set<string>
  hasImage: boolean
}

/** 0–100. Exact identity scores highest; token overlap carries the long tail. */
function score(
  nameTokens: string[],
  contextTokens: string[],
  fileNorm: string,
  record: Record_,
): number {
  if (!fileNorm) return 0
  if (fileNorm === record.slug || fileNorm === record.norm) return 100

  const overlap = contextTokens.filter((t) => record.tokens.has(t))
  if (overlap.length === 0) return 0
  // Require most of the record's own name to be present — otherwise a single
  // shared word like "blood" matches half the database.
  const coverage = overlap.length / record.tokens.size
  if (coverage < 0.6) return 0
  const longest = Math.max(...overlap.map((t) => t.length))
  if (longest < 4 && overlap.length < 2) return 0
  // Precision uses the filename only: a folder called "Armour" should help an
  // armour record be found, not penalise it for having an extra token.
  const inName = nameTokens.filter((t) => record.tokens.has(t)).length
  const precision = nameTokens.length > 0 ? inName / nameTokens.length : 0
  return Math.round(40 + coverage * 35 + precision * 20)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full)
  }
  return out
}

async function run(): Promise<void> {
  if (!SOURCE) {
    console.log('Usage: pnpm assets:match <folder-of-extracted-images> [--apply]')
    console.log('  Dry run by default. Writes asset-match-plan.tsv for you to read.')
    process.exit(1)
  }
  const sourceDir = path.resolve(SOURCE)
  if (!fs.existsSync(sourceDir)) {
    console.error(`No such folder: ${sourceDir}`)
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const records: Record_[] = []
  for (const target of TARGETS) {
    const result = await payload.find({ collection: target.collection, limit: 2000, depth: 0, pagination: false })
    for (const doc of result.docs as unknown as { slug: string; title: string; image?: unknown; portrait?: unknown }[]) {
      const norm = normalise(doc.title)
      records.push({
        collection: target.collection,
        folder: target.folder,
        slug: doc.slug,
        title: doc.title,
        norm,
        tokens: new Set(norm.split('-').filter(Boolean)),
        hasImage: Boolean(doc.image || doc.portrait),
      })
    }
  }
  console.log(`Matching against ${records.length} records across ${TARGETS.length} collections.`)

  const files = walk(sourceDir)
  console.log(`Found ${files.length} images under ${sourceDir}.\n`)

  const rows: { file: string; folder: string; slug: string; title: string; score: number; collection: string }[] = []
  const unmatched: string[] = []

  for (const file of files) {
    // Fold the last folder name in — "Icons/Weapons/Durandal.png" carries
    // useful context that the bare filename does not.
    const parent = path.basename(path.dirname(file))
    const nameTokens = tokenise(path.basename(file))
    const contextTokens = [...new Set([...nameTokens, ...tokenise(parent)])]
    const fileNorm = nameTokens.join('-')

    let best: { record: Record_; score: number } | null = null
    for (const record of records) {
      const s = score(nameTokens, contextTokens, fileNorm, record)
      // On a tie prefer the more specific record, so "Ambrus's Cuirass" beats
      // the character "Ambrus" rather than depending on iteration order.
      if (s > 0 && (!best || s > best.score || (s === best.score && record.tokens.size > best.record.tokens.size))) {
        best = { record, score: s }
      }
    }

    if (!best || best.score < 55) {
      unmatched.push(path.relative(sourceDir, file))
      continue
    }
    rows.push({
      file,
      folder: best.record.folder,
      slug: best.record.slug,
      title: best.record.title,
      score: best.score,
      collection: String(best.record.collection),
    })
  }

  // One file per record: keep the highest-scoring candidate for each.
  const bySlug = new Map<string, (typeof rows)[number]>()
  for (const row of rows.sort((a, b) => b.score - a.score)) {
    const key = `${row.folder}/${row.slug}`
    if (!bySlug.has(key)) bySlug.set(key, row)
    else unmatched.push(`${path.relative(sourceDir, row.file)} (a better file already matched ${key})`)
  }
  const chosen = [...bySlug.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.slug.localeCompare(b.slug))

  const confident = chosen.filter((r) => r.score >= 75)
  const unsure = chosen.filter((r) => r.score < 75)

  const plan = [
    ['confidence', 'target', 'record title', 'source file'].join('\t'),
    ...chosen.map((r) =>
      [r.score >= 75 ? 'likely' : 'CHECK', `${r.folder}/${r.slug}`, r.title, path.relative(sourceDir, r.file)].join('\t'),
    ),
  ].join('\n')
  fs.writeFileSync(PLAN_PATH, plan + '\n')

  console.log(`  ${confident.length} confident matches`)
  console.log(`  ${unsure.length} to eyeball (marked CHECK in the plan)`)
  console.log(`  ${unmatched.length} unmatched — almost all of these will be scenery and effects textures`)
  console.log(`\nPlan written to ${path.relative(PROJECT, PLAN_PATH)} — open it in a spreadsheet and read it.`)

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to copy the matches into assets/.')
    process.exit(0)
  }

  let copied = 0
  for (const row of chosen) {
    const destDir = path.join(ASSET_DIR, row.folder)
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, `${row.slug}${path.extname(row.file).toLowerCase()}`)
    fs.copyFileSync(row.file, dest)
    copied++
  }
  console.log(`\nStaged ${copied} file(s) into assets/. Check them, delete any that are wrong, then run \`pnpm assets\`.`)
  process.exit(0)
}

run().catch((error) => {
  console.error('Match failed:', error)
  process.exit(1)
})
