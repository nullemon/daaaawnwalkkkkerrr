import fs from 'fs'
import path from 'path'

/**
 * Download the lead image a harvested wiki entity names.
 *
 * ## Why this is a module and not twenty lines in the harvester
 *
 * It was twenty lines in the harvester, and then four wikis turned out to have
 * been swept without `--images` — Fire Emblem, Resident Evil Requiem, Forza
 * Horizon 6 and Subnautica 2, 365 pictures identified and never fetched. The
 * fix is to download the images an existing harvest already names, without
 * re-sweeping the wiki, and the only place that code existed was inside a
 * script that sweeps the wiki first.
 *
 * Copying it into a second tool would have given this project two answers to
 * "how do we fetch a Fandom image", which is the shape `sectionArt` and
 * `rightsholders.ts` were both written to end. One answer, two callers.
 *
 * ## The bug that came with it
 *
 * The original set `entity.imageFile` **before** attempting the download, so a
 * refused request, a truncated body or a thrown error left the harvest naming
 * a file that was never written. `seed:entities` then resolves that path and
 * uploads nothing. One of Star Wars Zero Company's 396 recorded files is not
 * on disk, and that is why.
 *
 * `imageFile` is set only once the bytes are on disk. A record with no picture
 * is an honest gap; a record pointing at a picture that does not exist is the
 * failure `pnpm check:art` had to be written to find.
 */

const MIN_BYTES = 900

/**
 * Where an entity's picture belongs, given the wiki it came from.
 *
 * `assets/_wiki/<slug>/` is gitignored scratch, which is deliberate: these are
 * non-free game screenshots kept only long enough to upload, and the database
 * is where they live afterwards.
 */
export const imageDirFor = (slug) => path.resolve('assets/_wiki', slug)

/** The filename an entity's picture takes, stable across runs. */
export const imageFileFor = (entity, dir) => {
  /*
    Fandom serves scaled variants behind `/revision/latest`; everything before
    it is the original, which is what carries the real extension.
  */
  const source = entity.image.split('/revision/')[0]
  const extension = (source.match(/\.(png|jpe?g|gif|webp)$/i) ?? ['.png'])[0].toLowerCase()
  const name = entity.wikiTitle.replace(/[^\w.-]+/g, '-').slice(0, 80)
  return { source, file: path.join(dir, `${name}${extension}`) }
}

/**
 * Fetch one entity's picture into `dir` and record the path on the entity.
 *
 * Returns what happened, so a caller can report it: `none` (the entity names
 * no image), `present` (already downloaded), `saved`, or `failed`.
 *
 * **Mutates `entity.imageFile`** — and only on `present` or `saved`. That is
 * the whole contract; see the note above.
 */
export const downloadEntityImage = async (entity, dir, userAgent) => {
  if (!entity.image) return 'none'

  const { source, file } = imageFileFor(entity, dir)

  if (fs.existsSync(file) && fs.statSync(file).size >= MIN_BYTES) {
    entity.imageFile = path.relative(path.resolve('.'), file).replace(/\\/g, '/')
    return 'present'
  }

  try {
    const response = await fetch(source, { headers: { 'User-Agent': userAgent } })
    if (!response.ok) return 'failed'
    const buffer = Buffer.from(await response.arrayBuffer())
    /*
      Fandom answers a deleted file with a short HTML error page rather than a
      404, so a body this small is never an image.
    */
    if (buffer.length < MIN_BYTES) return 'failed'
    fs.writeFileSync(file, buffer)
    entity.imageFile = path.relative(path.resolve('.'), file).replace(/\\/g, '/')
    return 'saved'
  } catch {
    /* A missing image is not a reason to lose the record. */
    return 'failed'
  }
}
