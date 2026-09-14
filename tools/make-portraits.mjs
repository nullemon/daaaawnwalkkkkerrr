/**
 * Cuts character portraits out of the Steam profile-background art.
 *
 *   node tools/make-portraits.mjs && pnpm assets
 *
 * These are the only record images on the site that have a source naming what
 * they show. Steam sells each one as "Ambrus (Profile Background)" — the
 * publisher's own label, not our guess at who is in the picture — which is the
 * bar docs/ASSETS.md sets for putting a picture on a page that names a person.
 * The press screenshots do not clear it and never get attached to anything.
 *
 * Each background is a 1920x1080 canvas with the character standing right of
 * centre against a red sun. We take a 3:4 slice around the figure, which comes
 * out at 810x1080 — comfortably over the 400px-tall minimum in docs/ASSETS.md.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const sharp = createRequire(import.meta.url)('sharp')

const FROM = path.resolve('assets/_library/steam-community/backgrounds')
const OUT = path.resolve('assets/characters')

const CROP_W = 810
const CROP_H = 1080

/**
 * file stem -> record slug, and where to cut.
 *
 * `left` is the crop's left edge in the 1920-wide source. Most are framed the
 * same way. Xanthe and Brencis stand further right, so they take the rightmost
 * window an 810-wide crop allows (1920 - 810 = 1110); Xanthe's outstretched
 * hand is clipped by the edge of the source art itself, so her framing is as
 * good as the art permits rather than as good as we would like.
 */
const PORTRAITS = [
  { file: 'ambrus.jpg', slug: 'ambrus-character', left: 1080 },
  { file: 'anca.jpg', slug: 'anca', left: 1080 },
  { file: 'bakir.jpg', slug: 'bakir-character', left: 1080 },
  { file: 'brencis.jpg', slug: 'brencis', left: 1110 },
  { file: 'coen.jpg', slug: 'coen', left: 1080 },
  { file: 'crake.jpg', slug: 'crake', left: 1080 },
  { file: 'xanthe.jpg', slug: 'xanthe-character', left: 1110 },
]

if (!fs.existsSync(FROM)) {
  console.error(`No ${path.relative(process.cwd(), FROM)} — see docs/ASSETS.md.`)
  process.exit(1)
}

fs.mkdirSync(OUT, { recursive: true })

for (const portrait of PORTRAITS) {
  const from = path.join(FROM, portrait.file)
  if (!fs.existsSync(from)) {
    console.error(`  ! missing ${portrait.file}`)
    continue
  }
  const out = path.join(OUT, `${portrait.slug}.jpg`)
  await sharp(fs.readFileSync(from))
    .extract({ left: portrait.left, top: 0, width: CROP_W, height: CROP_H })
    .jpeg({ quality: 88 })
    .toFile(out)
  console.log(`  + characters/${portrait.slug}.jpg  ${CROP_W}x${CROP_H}  ${(fs.statSync(out).size / 1024) | 0}KB`)
}

console.log(`done — ${PORTRAITS.length} portraits, now run: pnpm assets`)
