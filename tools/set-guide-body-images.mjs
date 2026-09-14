/**
 * Fills in each guide's in-article images from records it is already about.
 *
 *   node tools/set-guide-body-images.mjs
 *
 * Run after `pnpm assets`, because it attaches media that the asset step has
 * already created. It only ever points a guide at a picture of something the
 * guide actually discusses — the icon of the sword in the sword guide, the
 * items found in a region on that region's page — so nothing decorative is
 * passed off as illustrative.
 *
 * Rerunnable: it replaces the list on each guide it knows about and leaves
 * every other guide alone, so an editor's own choices survive.
 */
import path from 'path'
import { createRequire } from 'module'
import 'dotenv/config'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

const db = new DatabaseSync(path.resolve('dawnwalker.db'))

/** guide slug -> the item slugs whose icons belong in it. */
const BY_ITEMS = {
  'how-to-get-durandal': ['durandal'],
  'how-to-get-hand-of-fate': ['the-hand-of-fate', 'ancient-heros-armour'],
  'legendary-weapon-locations': [
    'durandal',
    'the-hand-of-fate',
    'gladius',
    'erkass-sword',
    'undead-warriors-sword',
  ],
  'best-early-gear': ['durandal', 'isbrands-plate', 'wolven-bracers'],
  'ambrus-court-guide': ['ambrus-cuirass'],
  'bakir-court-guide': ['bakirs-armour', 'vrakhiric-bracers'],
  'xanthe-court-guide': ['ancient-heros-vambraces', 'ancient-footwear'],
  'anca-guide': ['ancient-greaves', 'runic-enchantment'],
  'missable-content-guide': ['the-hand-of-fate', 'ancient-greaves'],
}

const heading = (slug) =>
  slug.endsWith('-court-guide')
    ? 'What this court pays out'
    : slug.endsWith('-guide') && BY_ITEMS[slug]?.length === 1
      ? 'What you are looking for'
      : 'The gear involved'

const mediaFor = (table, slug) => {
  const column = table === 'characters' ? 'portrait_id' : 'image_id'
  const row = db.prepare(`select ${column} as id, title from ${table} where slug = ?`).get(slug)
  return row?.id ? { id: row.id, title: row.title } : null
}

const guides = db.prepare('select id, slug from guides').all()
const bySlug = new Map(guides.map((guide) => [guide.slug, guide.id]))

// Region guides show the items that are actually pinned to that region.
const regions = db.prepare('select id, slug, title from regions').all()
const plan = new Map()

for (const [guideSlug, itemSlugs] of Object.entries(BY_ITEMS)) {
  if (!bySlug.has(guideSlug)) continue
  const rows = itemSlugs
    .map((itemSlug) => mediaFor('items', itemSlug))
    .filter(Boolean)
    .map((media) => ({ mediaId: media.id, caption: media.title }))
  if (rows.length) plan.set(guideSlug, { heading: heading(guideSlug), rows })
}

for (const region of regions) {
  const guideSlug = `${region.slug}-guide`
  if (!bySlug.has(guideSlug)) continue
  const items = db
    .prepare('select title, image_id from items where region_id = ? and image_id is not null order by title')
    .all(region.id)
  if (items.length === 0) continue
  plan.set(guideSlug, {
    heading: `Items found in ${region.title}`,
    rows: items.map((item) => ({ mediaId: item.image_id, caption: item.title })),
  })
}

// Payload stores array fields in their own table; write straight to it so this
// does not need a running Payload instance.
const table = 'guides_body_images'
const columns = db.prepare('select name from pragma_table_info(?)').all(table).map((row) => row.name)
if (columns.length === 0) {
  console.error(`No ${table} table. Run pnpm db:reset first so the schema exists.`)
  process.exit(1)
}

let wrote = 0
for (const [guideSlug, entry] of plan) {
  const guideId = bySlug.get(guideSlug)
  db.prepare(`delete from ${table} where _parent_id = ?`).run(guideId)
  entry.rows.forEach((row, index) => {
    db.prepare(
      `insert into ${table} (_order, _parent_id, id, image_id, caption) values (?, ?, ?, ?, ?)`,
    ).run(index + 1, guideId, `${guideId}-${index}`, row.mediaId, row.caption)
  })
  db.prepare('update guides set body_images_heading = ? where id = ?').run(entry.heading, guideId)
  wrote++
  console.log(`  + ${guideSlug}: ${entry.rows.length} image(s) — "${entry.heading}"`)
}

console.log(`\n${wrote} guides given in-article images`)
