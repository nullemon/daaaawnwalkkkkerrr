import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * Attach the freely licensed photographs to their people.
 *
 *   node tools/fetch-person-photos.mjs
 *   pnpm seed:person-photos
 *
 * `people.photo` has existed since the collection was written and nothing ever
 * filled it. The harvester gets the pictures and records what licence each one
 * carries; this puts them on the records and writes the credit that licence
 * asks for.
 *
 * ## The credit is the licence's condition, not a courtesy
 *
 * Every file here is CC BY, CC BY-SA, CC0 or public domain, and the first two
 * are only usable *if* the photographer is named. So the stored credit names
 * the photographer and the licence, and a file whose page named no author was
 * already refused upstream rather than quietly published without one. This is
 * the same reasoning as the licence line on the hub — facts restated from a
 * CC BY-SA source need credit, and an image needs it more, because the image
 * is the work rather than a fact about one.
 *
 * ## Why this checks the record's own citations before attaching anything
 *
 * `pnpm seed:people` resolves a name to a Wikipedia article and then asks
 * whether anything in that article ties the person to the credit — the game,
 * the studio, or the kind of work. Eleven of the forty-two articles failed
 * that gate: Mark Healy the Gaelic footballer, Juha Vainio the Finnish
 * lyricist who died in 1990. Their facts are not used and their URLs are not
 * cited.
 *
 * A photograph is the same claim made louder. Putting a stranger's face on a
 * page is worse than putting their date of birth on it, so rather than
 * re-deciding the question here — two copies of a rule drift, and the copy
 * that drifts is always the one nobody is looking at — this attaches a photo
 * only where the record itself cites the article the photo came from. The gate
 * that already exists is the gate.
 *
 * Idempotent. A person who already has a photo is left alone unless `--force`.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST = path.resolve(HERE, 'raw', 'person-photos.json')
const PHOTOS = path.resolve('assets/_photos')
const FORCE = process.argv.includes('--force')

type Entry = {
  name: string
  article: string
  photo: boolean
  reason?: string
  image?: string
  file?: string
  licence?: string
  licenceCode?: string
  licenceUrl?: string
  artist?: string
  filePage?: string
}

type Manifest = { fetchedAt: string; complete: boolean; people: Entry[] }

/**
 * Attribution, in the form the licence asks for: who took it and under what.
 *
 * Deliberately not `mediaCredit` from `src/lib/credit.ts`. That one ends
 * "Used for identification and commentary", which is the fair-dealing claim
 * the cover art makes — the opposite of what is true here. These are licensed,
 * and saying otherwise would understate the rights this network actually has
 * while overstating the ones it is claiming.
 *
 * **No file-page URL in the rendered line**, by the owner's decision: a raw
 * Commons URL under a portrait is a line of percent-encoding nobody reads.
 * The photographer and the licence stay, because those two are the licence's
 * actual condition and dropping either would put the image outside the terms
 * it arrived under. `filePage` stays in `raw/person-photos.json` — that file
 * is the record of what was checked and why the image was believed to be
 * free, and it is the only copy of that.
 */
const photoCredit = (entry: Entry): string => {
  const licence = entry.licence && entry.licence !== 'Not stated' ? entry.licence : 'licence not stated'
  const who = entry.artist ? `Photograph of ${entry.name} by ${entry.artist}` : `Photograph of ${entry.name}`
  return `${who}. ${licence}.`
}

async function run(): Promise<void> {
  if (!fs.existsSync(MANIFEST)) {
    console.log(`No ${MANIFEST}. Run \`node tools/fetch-person-photos.mjs\` first.`)
    process.exit(0)
  }
  if (!fs.existsSync(PHOTOS)) {
    /*
      A clean checkout has no `assets/`, because the images are not in git —
      the manifest is, so the harvest is reproducible, but the files are not
      ours to redistribute. No-op rather than nineteen lines of "not on disk",
      the same way `pnpm assets` no-ops on a machine with no assets folder.
    */
    console.log(`No ${PHOTOS}. Run \`pnpm fetch:person-photos\` to download the photographs.`)
    process.exit(0)
  }
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  if (!manifest.complete) {
    /*
      Not a failure. A sweep that stopped on a rate limit still harvested real
      photographs and they are worth attaching — but the file is a partial
      answer and nobody should read the totals below as "this is everyone".
    */
    console.log('The harvest is incomplete — a sweep stopped early. Attaching what it did get.\n')
  }

  const payload = await getPayload({ config })
  const taken = manifest.people.filter((entry) => entry.photo)

  let attached = 0
  let already = 0
  let uncited = 0
  let missing = 0

  for (const entry of taken) {
    const found = await payload.find({
      collection: 'people',
      where: { name: { equals: entry.name } },
      limit: 1,
      depth: 0,
    })
    const person = found.docs[0] as unknown as
      | { id: string | number; name: string; photo?: unknown; sources?: { url?: string | null }[] | null }
      | undefined

    if (!person) {
      console.log(`  ${entry.name.padEnd(26)} no record with that name`)
      missing += 1
      continue
    }

    /* The gate. See the note above — this is `seed:people`'s decision, reused. */
    const cites = (person.sources ?? []).some((source) => source.url === entry.article)
    if (!cites) {
      console.log(
        `  ${entry.name.padEnd(26)} not attached — the record does not cite ${entry.article}, ` +
          'so seed:people judged that article to be about somebody else',
      )
      uncited += 1
      continue
    }

    const file = path.join(PHOTOS, entry.image ?? '')
    if (!entry.image || !fs.existsSync(file)) {
      console.log(`  ${entry.name.padEnd(26)} ${entry.image ?? '(no file named)'} is not on disk`)
      missing += 1
      continue
    }

    /*
      Media is keyed on filename so a re-run finds the row it made last time
      instead of filling the library with copies of the same face — `db:reset`
      drops uploads, but a plain re-run of this pass must not.
    */
    const filename = `photo-${entry.image}`
    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })

    const credit = photoCredit(entry)
    let mediaId = existing.docs[0]?.id
    if (mediaId) {
      /*
        The credit is the licence's condition, so it is kept current rather
        than frozen at whatever wording existed the day the file was uploaded.
        Correcting the line above has to reach the rows already in the library,
        or the fix is only ever true of the next photograph.
      */
      const row = existing.docs[0] as unknown as { credit?: string | null }
      if (row.credit !== credit) {
        await payload.update({ collection: 'media', id: mediaId, data: { credit } as never })
      }
    }
    if (!mediaId) {
      const extension = path.extname(file).toLowerCase()
      try {
        const created = await payload.create({
          collection: 'media',
          data: {
            alt: `Photograph of ${entry.name}`,
            credit,
          } as never,
          file: {
            data: fs.readFileSync(file),
            mimetype:
              extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg',
            name: filename,
            size: fs.statSync(file).size,
          },
        })
        mediaId = created.id
      } catch (error) {
        console.error(`  ${entry.name.padEnd(26)} upload failed: ${(error as Error).message}`)
        missing += 1
        continue
      }
    }

    /*
      Left alone after the library row is current, not before it: an editor who
      swapped the photo for a better one keeps their choice, and the credit on
      the file this pass uploaded still gets corrected.
    */
    if (person.photo && !FORCE) {
      already += 1
      continue
    }

    await payload.update({
      collection: 'people',
      id: person.id,
      data: { photo: mediaId } as never,
    })
    attached += 1
    console.log(`  ${entry.name.padEnd(26)} ${filename.padEnd(34)} ${entry.licence ?? ''}`)
  }

  console.log(
    `\n${attached} photographs attached, ${already} already had one, ` +
      `${uncited} refused because the record does not cite the article, ${missing} could not be attached.`,
  )
  console.log(
    `${manifest.people.length - taken.length} of the ${manifest.people.length} people asked about have no ` +
      'freely licensed photograph — which is the expected answer, and the page says so rather than drawing a silhouette.',
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
