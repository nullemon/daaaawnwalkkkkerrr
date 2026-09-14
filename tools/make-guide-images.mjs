/**
 * Builds a lead image for every guide into assets/guides/<slug>.jpg.
 *
 *   node tools/make-guide-images.mjs && pnpm assets --force
 *
 * Every guide gets a different picture. That is the point of the file: the
 * first version of this tool reused fifteen section bands across sixty-odd
 * articles, so an index of the whole guide library showed the same handful of
 * images over and over and every article looked like every other one.
 *
 * Sources, in order of how well they match a subject:
 *
 *   1. Region guides take that region's own photograph. The only case where the
 *      picture genuinely depicts what the article is about.
 *   2. Character guides take that character's portrait, likewise.
 *   3. Everything else takes one of the forty official press screenshots, each
 *      used once. Decorative, and credited as the press material it is.
 *   4. Section bands are the last resort, and the run fails loudly if it gets
 *      that far often enough to repeat one.
 *
 * Nothing is downloaded; all of this is already in assets/ and public/art.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const { DatabaseSync } = require('node:sqlite')

const OUT = path.resolve('assets/guides')
const REGIONS = path.resolve('assets/regions')
const PORTRAITS = path.resolve('assets/characters')
const SHOTS = path.resolve('assets/_library/screenshots')
const ART = path.resolve('public/art')

const W = 1600
const H = 900

/** Guides about one named person, and whose portrait belongs on them. */
const BY_CHARACTER = {
  'lacra-guide': 'lacra',
  'crake-guide': 'crake',
  'anca-guide': 'anca',
  'brencis-guide': 'brencis',
  'ambrus-court-guide': 'ambrus-character',
  'bakir-court-guide': 'bakir-character',
  'xanthe-court-guide': 'xanthe-character',
}

const firstExisting = (dir, stem) =>
  ['png', 'jpg', 'jpeg', 'webp']
    .map((ext) => path.join(dir, `${stem}.${ext}`))
    .find((file) => fs.existsSync(file))

const db = new DatabaseSync(path.resolve('dawnwalker.db'), { readOnly: true })
const guides = db.prepare('select slug, title from guides order by slug').all()
const regionSlugs = new Set(db.prepare('select slug from regions').all().map((r) => r.slug))

fs.mkdirSync(OUT, { recursive: true })

// A stable pool of screenshots, shared out one per guide. Sorted so the same
// guide gets the same picture on every run rather than shuffling on rebuild.
const pool = fs.existsSync(SHOTS)
  ? fs
      .readdirSync(SHOTS)
      .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
      .sort()
      .map((name) => path.join(SHOTS, name))
  : []

const bands = fs.existsSync(ART)
  ? fs
      .readdirSync(ART)
      .filter((name) => name.endsWith('.webp') && name !== 'og-bg.webp')
      .sort()
      .map((name) => path.join(ART, name))
  : []

let poolAt = 0
let bandAt = 0
const used = new Map()
const repeats = []

for (const guide of guides) {
  let source = null
  let kind = ''

  const asRegion = guide.slug.replace(/-guide$/, '')
  if (regionSlugs.has(asRegion)) {
    source = firstExisting(REGIONS, asRegion)
    kind = 'region'
  }

  if (!source && BY_CHARACTER[guide.slug]) {
    source = firstExisting(PORTRAITS, BY_CHARACTER[guide.slug])
    kind = 'portrait'
  }

  if (!source && poolAt < pool.length) {
    source = pool[poolAt++]
    kind = 'screenshot'
  }

  if (!source && bandAt < bands.length) {
    source = bands[bandAt++]
    kind = 'band'
  }

  if (!source) {
    console.error(`  ! ${guide.slug}: nothing left to use`)
    continue
  }

  if (used.has(source)) repeats.push(`${guide.slug} shares with ${used.get(source)}`)
  used.set(source, guide.slug)

  const out = path.join(OUT, `${guide.slug}.jpg`)
  await sharp(fs.readFileSync(source))
    // `attention` finds the busiest part of a frame, which on a portrait keeps
    // the face and on a landscape keeps the subject rather than the sky.
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82 })
    .toFile(out)

  console.log(`  + ${guide.slug}.jpg  [${kind}] ${path.basename(source)}`)
}

console.log(`\n${used.size} unique images across ${guides.length} guides`)
if (repeats.length) {
  console.error(`\n${repeats.length} guide(s) had to share a picture:`)
  repeats.forEach((line) => console.error(`  ${line}`))
  console.error('Add more sources, or reduce the number of guides that need one.')
  process.exitCode = 1
} else {
  console.log('every guide has its own picture')
}
console.log('\nnext: pnpm assets --force')
