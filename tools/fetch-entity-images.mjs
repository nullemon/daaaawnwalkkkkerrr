/**
 * Download the pictures a wiki harvest already names.
 *
 *   node tools/fetch-entity-images.mjs                 # every wiki
 *   node tools/fetch-entity-images.mjs resident-evil-requiem
 *
 * ## Why this is its own tool
 *
 * `tools/harvest-game.mjs --images` downloads them as the last step of a full
 * sweep. Four wikis were swept without that flag — Fire Emblem: Fortune's
 * Weave, Resident Evil Requiem, Forza Horizon 6 and Subnautica 2 — so their
 * harvests recorded 365 image URLs and fetched none of them. Every downstream
 * pass behaved correctly on that data: `seed:entities` attaches a picture only
 * where `imageFile` names one, so 365 records simply rendered their fallback
 * icon, on four wikis, with nothing in any log.
 *
 * Re-sweeping a wiki to collect pictures it has already identified is the
 * wrong shape: it costs a few thousand requests against Fandom, risks the
 * shrink guard on a rate-limited run, and re-classifies records that were
 * classified correctly the first time. The download is the only missing step,
 * so it is the only step this runs.
 *
 * ## What it will not do
 *
 * It never adds, removes or reclassifies an entity, and it never touches a
 * field other than `imageFile`. The harvest on disk is the only copy of a
 * sweep that takes hours, and this tool has no business rewriting any of it —
 * so it reads the file, sets `imageFile` on entities whose bytes are now on
 * disk, and writes the same records back in the same order.
 *
 * The download itself is `tools/lib/fandom-image.mjs`, shared with the
 * harvester so there is one answer to how a Fandom image is fetched and one
 * rule about when `imageFile` may be recorded.
 */
import fs from 'fs'
import path from 'path'

import { downloadEntityImage, imageDirFor } from './lib/fandom-image.mjs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const DIR = path.resolve('src/seed/raw/wiki-entities')
const only = process.argv[2]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (!fs.existsSync(DIR)) {
  console.error(`No harvests at ${DIR}. Run tools/harvest-game.mjs first.`)
  process.exit(1)
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !only || f === `${only}.json`)

if (files.length === 0) {
  console.error(only ? `No harvest for "${only}".` : 'No harvests found.')
  process.exit(1)
}

let grandSaved = 0
let grandFailed = 0

for (const file of files) {
  const full = path.join(DIR, file)
  const harvest = JSON.parse(fs.readFileSync(full, 'utf8'))
  const entities = harvest.entities ?? []
  const slug = harvest.slug ?? file.replace(/\.json$/, '')

  const wanted = entities.filter((e) => e.image)
  if (wanted.length === 0) {
    console.log(`  ${slug.padEnd(32)} nothing to fetch`)
    continue
  }

  const dir = imageDirFor(slug)
  fs.mkdirSync(dir, { recursive: true })

  let saved = 0
  let present = 0
  let failed = 0

  for (const entity of entities) {
    const outcome = await downloadEntityImage(entity, dir, UA)
    if (outcome === 'saved') {
      saved += 1
      /* Only a real request needs spacing; a file already here cost nothing. */
      await sleep(200)
    } else if (outcome === 'present') present += 1
    else if (outcome === 'failed') failed += 1

    process.stdout.write(`\r  ${slug.padEnd(32)} ${saved} new, ${present} already here, ${failed} refused    `)
  }

  /*
    Written back with the same records in the same order — only `imageFile` can
    have changed, and only on entities whose bytes are on disk.
  */
  fs.writeFileSync(full, `${JSON.stringify(harvest, null, 2)}\n`)

  const held = entities.filter((e) => e.imageFile).length
  process.stdout.write(
    `\r  ${slug.padEnd(32)} ${String(saved).padStart(4)} new  ${String(present).padStart(4)} already  ${String(failed).padStart(4)} refused   -> ${held}/${wanted.length} of the pictures it names\n`,
  )

  grandSaved += saved
  grandFailed += failed
}

console.log(`\n${grandSaved} downloaded${grandFailed > 0 ? `, ${grandFailed} the wiki would not serve` : ''}.`)
console.log('Run `pnpm seed:entities` to attach them, then `pnpm check:art`.')
