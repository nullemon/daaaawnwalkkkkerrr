/**
 * The portrait cover art for each game, for the factsheet on its wiki home.
 *
 *   node tools/fetch-posters.mjs
 *   pnpm seed:posters
 *
 * ## Why not the store art we already have
 *
 * `tools/fetch-game-data.mjs` downloads the header, the capsule and the
 * background from each store listing, and every one of them is landscape —
 * 460x215, 616x353, 1920x1080. A factsheet wants the shape a box has, and
 * stretching a 460x215 header into a 2:3 frame is not a cropping problem, it
 * is the wrong picture. Steam does publish a portrait (`library_600x900`), and
 * two of the eight games have one: it is generated when a game is released and
 * six of these are not out yet.
 *
 * So the source is the cover art on each game's Wikipedia article, which is the
 * portrait image that exists for an unreleased game because a publisher put it
 * on a store front and a press release.
 *
 * ## What that permits, recorded rather than assumed
 *
 * Almost every one of these is a **non-free** file uploaded locally to
 * en.wikipedia under a fair-use rationale, not a Commons file. That is the
 * opposite of the company logos, where about half turned out to be public
 * domain and the harvester asks before downloading — so this one asks too, and
 * writes the answer into the credit rather than presenting everything as
 * though it were licensed.
 *
 * Cover art on a page about the work it is the cover of, at thumbnail size,
 * credited to its publisher, is the same basis this site already uses for
 * press key art and is the textbook fair-dealing case. It is still a basis
 * rather than a licence, and the difference belongs on the record: the credit
 * line says which one each image is used under, and `pnpm check:launch` can
 * count them.
 *
 * Idempotent: a file already on disk is not downloaded again.
 */
import fs from 'fs'
import path from 'path'

const REFERENCE = path.resolve('src/seed/raw/reference')
const OUT = path.resolve('assets/_posters')
const MANIFEST = path.join(OUT, 'posters.json')
const API = 'https://en.wikipedia.org/w/api.php'

/*
  Wikimedia asks for a User-Agent that identifies the tool and a way to reach
  whoever runs it. An anonymous script gets rate-limited and deserves to be.
*/
const UA = 'vellum-wiki-network/1.0 (game wiki network; contact via the site)'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/*
  Paced, and patient about a 429.

  The first run got five games in and then hit `HTTP 429` on the sixth, which
  in the harvester that came before this one would have been written down as
  "no cover art on the article" and cached as a fact. A rate limit is a "come
  back later", not an answer, and the only difference between the two at the
  call site is whether somebody wrote the branch. See the note in
  `tools/fetch-search-queries.mjs` about the blocked endpoint that wrote an
  empty file over a good one.
*/
const api = async (params, attempt = 0) => {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (response.status === 429 || response.status === 503) {
    if (attempt >= 4) throw new Error(`rate limited by Wikipedia after ${attempt} retries`)
    const wait = 2000 * 2 ** attempt
    console.log(`    rate limited, waiting ${wait / 1000}s`)
    await sleep(wait)
    return api(params, attempt + 1)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  await sleep(700)
  return response.json()
}

/**
 * The cover, out of everything on the article.
 *
 * A video game article carries flags, a WikiProject icon, a portrait of a voice
 * actor and sometimes a gameplay screenshot. The cover is the one whose file
 * name says so — Wikipedia's own naming convention for a game's infobox image
 * is "<Game> cover art.<ext>" and has been for years. Matching the convention
 * rather than "the first image" is what keeps a flag of Poland out of the
 * factsheet, and if a future article does not follow it this finds nothing and
 * says so, which is the right failure.
 */
const COVER = /(cover|box)\s*art|(^|\s)cover(\s|\.)|poster/i
const GAMEPLAY = /gameplay|screenshot|logo|icon|flag|symbol|photo|wpvg/i

const words = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)

const coverOf = (images, article) => {
  const named = images.map((image) => image.title).filter((title) => /\.(jpe?g|png|webp)$/i.test(title))
  const covers = named.filter((title) => COVER.test(title) && !GAMEPLAY.test(title))
  if (covers[0]) return covers[0]

  /*
    The fallback, for an article that does not follow the convention.

    Onimusha: Way of the Sword files its cover as "Onimusha Way of the Sword.jpg"
    with no "cover art" in the name, and the rule above found nothing — which is
    the right failure but the wrong outcome when the article carries exactly one
    image and that image is named after the game. So: one candidate, not a flag
    or an icon or a screenshot, and named in the article's own words. Anything
    looser starts guessing, and a guessed picture on a factsheet is a claim
    about what the game looks like.
  */
  const wanted = new Set(words(article))
  const plausible = named.filter(
    (title) =>
      !GAMEPLAY.test(title) &&
      words(title.replace(/^File:/, '')).filter((word) => wanted.has(word)).length >= 2,
  )
  return plausible.length === 1 ? plausible[0] : null
}

/**
 * The licence, from the file's own page.
 *
 * `extmetadata.LicenseShortName` is what Commons and en.wikipedia both fill in;
 * a non-free local upload reports "Fair use" or a non-free template name, and
 * `Artist`/`Credit` name whoever the file page credits. Everything here goes
 * into the credit line on the media record.
 */
const licenceOf = async (file) => {
  const data = await api({
    action: 'query',
    titles: file,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    /*
      A rendered thumbnail, not the original. The originals are 1500px tall
      scans in some cases and the panel shows one at 300px wide — and asking
      for a thumbnail is also what makes a PNG of an SVG possible, which is the
      lesson the logo harvester learned the hard way.
    */
    iiurlwidth: '600',
  })
  const page = Object.values(data.query?.pages ?? {})[0]
  const info = page?.imageinfo?.[0]
  if (!info) return null
  const meta = info.extmetadata ?? {}
  const strip = (value) =>
    typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : ''
  return {
    file,
    url: info.thumburl ?? info.url,
    mime: info.thumbmime ?? info.mime,
    licence: strip(meta.LicenseShortName?.value) || 'Not stated',
    artist: strip(meta.Artist?.value),
    credit: strip(meta.Credit?.value),
    description: strip(meta.ImageDescription?.value),
    /* A file page on en.wikipedia rather than Commons is the non-free signal. */
    local: !/commons/i.test(info.descriptionurl ?? ''),
    page: info.descriptionurl ?? '',
  }
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {}

  for (const entry of fs.readdirSync(REFERENCE)) {
    const slug = entry.replace(/\.json$/, '')
    const reference = JSON.parse(fs.readFileSync(path.join(REFERENCE, entry), 'utf8'))
    const article = reference.wikipedia?.url
    if (!article) {
      console.log(`  ${slug.padEnd(34)} no Wikipedia article recorded`)
      continue
    }
    const title = decodeURIComponent(article.split('/wiki/')[1])

    const listing = await api({ action: 'query', titles: title, prop: 'images', imlimit: '50' })
    const page = Object.values(listing.query?.pages ?? {})[0]
    const file = coverOf(page?.images ?? [], title)
    if (!file) {
      console.log(`  ${slug.padEnd(34)} no cover art on the article`)
      continue
    }

    const info = await licenceOf(file)
    if (!info?.url) {
      console.log(`  ${slug.padEnd(34)} ${file} — no image info`)
      continue
    }

    const ext = /png/i.test(info.mime) ? 'png' : 'jpg'
    const target = path.join(OUT, `${slug}.${ext}`)
    if (!fs.existsSync(target)) {
      const image = await fetch(info.url, { headers: { 'User-Agent': UA } })
      if (!image.ok) {
        console.log(`  ${slug.padEnd(34)} download failed: HTTP ${image.status}`)
        continue
      }
      fs.writeFileSync(target, Buffer.from(await image.arrayBuffer()))
    }

    manifest[slug] = {
      file: info.file,
      ext,
      licence: info.licence,
      nonFree: info.local,
      artist: info.artist,
      credit: info.credit,
      source: info.page,
      article,
      fetchedAt: new Date().toISOString().slice(0, 10),
    }
    /*
      Written after each game rather than at the end, so a rate limit in the
      middle costs the run and not the work.
    */
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}
`)
    console.log(
      `  ${slug.padEnd(34)} ${path.basename(target).padEnd(40)} ${info.licence}${info.local ? ' (non-free, local upload)' : ''}`,
    )
  }

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\n${Object.keys(manifest).length} posters in ${OUT}`)
  console.log('Run `pnpm seed:posters` to attach them.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
