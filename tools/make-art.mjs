/**
 * Builds the decorative header art in public/art/ from assets/_library/.
 *
 *   node tools/make-art.mjs
 *
 * These are official press/store screenshots used as page furniture only — the
 * home hero and the section index headers. They are never attached to a record,
 * because no source says which place or person any of them shows, and a picture
 * on /regions/laslea-glen reads as a claim that it *is* Laslea Glen.
 *
 * assets/_library is gitignored, so the derived bands in public/art are what the
 * repo actually carries; re-run this only if you change the picks below.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const sharp = createRequire(import.meta.url)('sharp')

const LIB = path.resolve('assets/_library')
const OUT = path.resolve('public/art')

const CREDIT = 'The Blood of Dawnwalker © Rebel Wolves / Bandai Namco Entertainment'

/**
 * Which library file backs each band, how tall it is cut, and what the press
 * original said about itself.
 *
 * Four of these sources carry a burned-in band across the bottom: the game
 * logo left, the Rebel Wolves logo right, and a build-state disclaimer in the
 * middle. The crop drops all three — the logos deliberately, because
 * docs/ASSETS.md says to keep official logos out of the site's own furniture,
 * and the disclaimer only because it sits on the same strip. `notice` carries
 * that sentence back into the visible credit, verbatim, so cropping the image
 * does not quietly upgrade pre-release footage into a picture of the game as
 * shipped. None of the originals carries a copyright notice; that line is the
 * whole of what the publisher stamped on them.
 */
const BANDS = [
  { name: 'hero', file: 'screenshots/the-blood-of-dawnwalker-launch-screenshot-6.png', height: 860 },
  {
    name: 'regions',
    file: 'screenshots/the-blood-of-dawnwalker-screenshot-april2026-09.png',
    notice: 'Beta in-game footage (actual gameplay)',
  },
  { name: 'characters', file: 'screenshots/screenshot-03.jpg' },
  {
    name: 'items',
    file: 'screenshots/the-blood-of-dawnwalker-screenshots-8.png',
    notice: 'Pre-beta in-game footage (actual gameplay)',
  },
  { name: 'perks', file: 'screenshots/the-blood-of-dawnwalker-screenshot-1.png' },
  { name: 'quests', file: 'screenshots/the-blood-of-dawnwalker-launch-screenshot-1.png' },
  { name: 'endings', file: 'screenshots/the-blood-of-dawnwalker-screenshot-3.png' },
  {
    name: 'enemies',
    file: 'screenshots/the-blood-of-dawnwalker-screenshot-april2026-03.png',
    notice: 'Beta in-game footage (actual gameplay)',
  },
  { name: 'builds', file: 'screenshots/screenshot-01.jpg' },
  {
    name: 'court',
    file: 'screenshots/the-blood-of-dawnwalker-screenshots-2.png',
    notice: 'Pre-beta in-game footage (actual gameplay)',
  },
  { name: 'court-activities', file: 'screenshots/the-blood-of-dawnwalker-launch-screenshot-5.png' },
  { name: 'skills', file: 'screenshots/screenshot-04.jpg' },
  { name: 'guides', file: 'screenshots/the-blood-of-dawnwalker-launch-screenshot-2.png' },
  { name: 'mechanics', file: 'screenshots/screenshot-05.jpg' },
]

const WIDTH = 1920
const DEFAULT_HEIGHT = 620

if (!fs.existsSync(LIB)) {
  console.error(`No ${path.relative(process.cwd(), LIB)} — see docs/ASSETS.md for where to get it.`)
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })

const manifest = JSON.parse(fs.readFileSync(path.join(LIB, 'manifest.json'), 'utf8'))
const sourceOf = (file) => manifest.files.find((entry) => entry.file === file)?.source

const credits = {}
for (const band of BANDS) {
  const from = path.join(LIB, band.file)
  if (!fs.existsSync(from)) {
    console.error(`  ! missing ${band.file}`)
    continue
  }
  const height = band.height ?? DEFAULT_HEIGHT
  // Read through a buffer: some library paths are long enough to trip Windows
  // MAX_PATH when libvips opens them by name.
  const buffer = fs.readFileSync(from)
  const out = path.join(OUT, `${band.name}.webp`)
  await sharp(buffer)
    .resize(WIDTH, height, { fit: 'cover', position: 'attention' })
    .webp({ quality: 78 })
    .toFile(out)
  credits[band.name] = {
    src: `/art/${band.name}.webp`,
    credit: band.notice ? `${band.notice} — ${CREDIT}` : CREDIT,
    from: band.file,
    source: sourceOf(band.file),
  }
  console.log(`  + art/${band.name}.webp  ${WIDTH}×${height}  ${(fs.statSync(out).size / 1024) | 0}KB`)
}

/*
  The social card's backdrop, cut to the exact 1200×630 the card is shot at.
  A landscape rather than the key art: the key art carries the game's own logo
  lockup, and docs/ASSETS.md says to keep official logos out of this site's
  furniture.

  Nothing embeds it behind the network share card any more. That card had a
  Dawnwalker screenshot on it and was served by the hub, the companies host and
  the people host — three sites that are not about one game — so `og.png` is
  drawn geometry now (`tools/make-brand.mjs`). `og-bg.webp` is still the source
  for the Dawnwalker *wiki's* own card, which `tools/make-wiki-icons.mjs` cuts.
*/
const ogFrom = BANDS.find((band) => band.name === 'hero').file
await sharp(fs.readFileSync(path.join(LIB, ogFrom)))
  .resize(1200, 630, { fit: 'cover', position: 'attention' })
  .webp({ quality: 82 })
  .toFile(path.join(OUT, 'og-bg.webp'))
console.log(`  + art/og-bg.webp  1200×630`)

fs.writeFileSync(
  path.resolve('src/lib/art-credits.json'),
  `${JSON.stringify(
    {
      about:
        'Generated by tools/make-art.mjs. Decorative page art only — official press/store screenshots, never attached to a record.',
      bands: credits,
    },
    null,
    2,
  )}\n`,
)
console.log(`done — ${Object.keys(credits).length} bands, credits in src/lib/art-credits.json`)
