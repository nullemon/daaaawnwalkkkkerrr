/**
 * Builds a lead image for every guide into assets/guides/<slug>.jpg.
 *
 *   node tools/make-guide-images.mjs && pnpm assets
 *
 * Region guides get that region's own photograph, which is the one case where
 * the picture genuinely depicts what the article is about. Everything else gets
 * the section band it belongs to — decorative, exactly as on the index pages,
 * and credited the same way.
 *
 * Sources come from assets/ and public/art, both of which are already in the
 * project; nothing is downloaded here.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const { DatabaseSync } = require('node:sqlite')

const OUT = path.resolve('assets/guides')
const REGIONS = path.resolve('assets/regions')
const ART = path.resolve('public/art')

/** 16:9 at a size that survives the social card and the article header. */
const W = 1600
const H = 900

/**
 * Which band suits which article, by subject.
 *
 * Matched by hand rather than by keyword: "how to save time" is about the clock
 * and belongs with the quests band, and no rule derived from the slug would
 * work that out.
 */
const BY_SLUG = {
  'how-long-is-the-blood-of-dawnwalker': 'quests',
  'how-to-save-time': 'quests',
  'what-happens-if-time-runs-out': 'endings',
  'which-ending-should-you-choose': 'endings',
  'can-you-still-reach-every-ending': 'endings',
  'knyazmaker-ending-guide': 'endings',
  'patricide-ending-guide': 'endings',
  'which-court-first': 'court',
  'are-court-activities-worth-it': 'court-activities',
  'infamy-explained': 'court',
  'legendary-weapon-locations': 'items',
  'how-corruption-works': 'perks',
  'best-ultimate-perks': 'perks',
  'day-or-night': 'skills',
  'how-to-perfect-block': 'skills',
  'which-difficulty-to-choose': 'builds',
  'can-you-romance-everyone': 'characters',
  'romance-guide': 'characters',
  'beginners-guide': 'hero',
  'what-to-do-first': 'hero',
  'is-it-worth-playing': 'hero',
  'mistakes-to-avoid': 'enemies',
  'trophy-guide': 'builds',
  'how-time-works': 'mechanics',
  'corruption-explained': 'perks',
}

const db = new DatabaseSync(path.resolve('dawnwalker.db'), { readOnly: true })
const guides = db.prepare('select slug, title from guides order by slug').all()
const regionSlugs = new Set(
  db
    .prepare('select slug from regions')
    .all()
    .map((row) => row.slug),
)

fs.mkdirSync(OUT, { recursive: true })

let made = 0
const missing = []

for (const guide of guides) {
  // "<region>-guide" articles are about a place we have a photograph of.
  const asRegion = guide.slug.replace(/-guide$/, '')
  let source = null

  if (regionSlugs.has(asRegion)) {
    const candidate = ['png', 'jpg', 'webp']
      .map((ext) => path.join(REGIONS, `${asRegion}.${ext}`))
      .find((file) => fs.existsSync(file))
    if (candidate) source = candidate
  }

  if (!source) {
    const band = BY_SLUG[guide.slug] ?? 'guides'
    const candidate = path.join(ART, `${band}.webp`)
    if (fs.existsSync(candidate)) source = candidate
  }

  if (!source) {
    missing.push(guide.slug)
    continue
  }

  const out = path.join(OUT, `${guide.slug}.jpg`)
  await sharp(fs.readFileSync(source))
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82 })
    .toFile(out)
  made++
  console.log(`  + guides/${guide.slug}.jpg  <- ${path.relative(process.cwd(), source)}`)
}

console.log(`\n${made} guide images written to assets/guides`)
if (missing.length) console.log(`no source for: ${missing.join(', ')}`)
console.log('next: pnpm assets')
