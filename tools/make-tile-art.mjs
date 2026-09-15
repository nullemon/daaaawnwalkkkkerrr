/**
 * Gives every wiki's front page tiles a picture, cut from its own screenshots.
 *
 *   node tools/make-tile-art.mjs
 *
 * ## The problem this fixes
 *
 * The section tiles carried a decorative band set cut from Dawnwalker art, and
 * `page.tsx` quite rightly refused to put it on any other wiki — one
 * publisher's screenshots have no business illustrating another publisher's
 * game. The consequence was that the fix for seven wikis was "no picture", and
 * seven front pages were a grid of flat boxes with an icon and a count in
 * them. Correct, and plain enough that it reads as unfinished.
 *
 * The answer was sitting in `assets/_games/<slug>/`: every game has nine or
 * more of its own store screenshots. So each wiki's tiles get cut from that
 * wiki's game, the attribution rule holds, and nothing is shared between them.
 *
 * ## How a screenshot is chosen
 *
 * By a hash of the section name, not by position. It has to be stable — a
 * reader who comes back should find Characters looking the way it did — and it
 * has to spread, so two adjacent tiles do not show the same frame. Position
 * would give the first sections the same picture on every wiki.
 *
 * Output is `public/wiki-assets/<slug>/tiles/<name>.jpg`, which `proxy.ts`
 * passes through unrewritten on every host.
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const ART_DIR = path.resolve('assets/_games')
const OUT_ROOT = path.resolve('public/wiki-assets')

/** Everything the front page can show a tile for. */
const TILES = [
  'quests', 'court-activities', 'endings', 'achievements', 'regions', 'courts',
  'characters', 'enemies', 'skill-trees', 'skills', 'perks', 'items', 'builds',
  'mechanics', 'guides',
  // Tools, which have their own tiles above the sections.
  'tool-run', 'tool-run-checker', 'tool-build-planner', 'tool-completion',
]

/** Stable, well-spread index for a name. */
const pick = (name, count) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % count
}

const games = fs.existsSync(ART_DIR)
  ? fs.readdirSync(ART_DIR).filter((entry) => fs.statSync(path.join(ART_DIR, entry)).isDirectory())
  : []

if (games.length === 0) {
  console.log('No game art in assets/_games — nothing to cut.')
  process.exit(0)
}

let written = 0

for (const slug of games) {
  const dir = path.join(ART_DIR, slug)
  const shots = fs
    .readdirSync(dir)
    .filter((name) => /^screenshot-\d+\.(jpg|jpeg|png)$/i.test(name))
    .sort()

  if (shots.length === 0) {
    console.log(`  ${slug.padEnd(32)} no screenshots, skipped`)
    continue
  }

  const outDir = path.join(OUT_ROOT, slug, 'tiles')
  fs.mkdirSync(outDir, { recursive: true })

  let made = 0
  for (const name of TILES) {
    const source = path.join(dir, shots[pick(name, shots.length)])
    const out = path.join(outDir, `${name}.jpg`)

    await sharp(source)
      .resize(800, 450, { fit: 'cover', position: 'attention' })
      /*
        A light darken only. `.tile::before` already lays a gradient over this,
        and doubling up turns a screenshot into a grey rectangle — the tiles
        would be no less plain than they were with no picture at all.
      */
      .modulate({ brightness: 0.82, saturation: 0.95 })
      .jpeg({ quality: 76, mozjpeg: true })
      .toFile(out)

    made += 1
    written += 1
  }

  console.log(`  ${slug.padEnd(32)} ${made} tiles from ${shots.length} screenshots`)
}

console.log(`\n${written} tile images written to public/wiki-assets/<slug>/tiles/`)
