/**
 * A photograph for each person on `people.<network domain>`, where — and only
 * where — one is published under a licence that lets us use it.
 *
 *   node tools/fetch-person-photos.mjs
 *   pnpm seed:person-photos
 *
 * Reads the people `tools/fetch-people.mjs` already resolved to a Wikipedia
 * article, finds each article's lead image, asks the imageinfo API what licence
 * that file carries, and downloads it only if the answer is a free one.
 *
 * ## Why this is stricter than `tools/fetch-posters.mjs`
 *
 * The poster harvester downloads non-free cover art and records that it did.
 * That is a fair-dealing argument this project already makes out loud: cover
 * art, at thumbnail size, on the page about the work it is the cover of, is
 * the textbook case, and the credit line says which basis each image is used
 * under rather than pretending it is licensed.
 *
 * A photograph of somebody's face is not that image and does not get that
 * argument. It is a picture of a person, most of them living and none of them
 * public figures in the sense a court would care about, and "we are writing
 * about them" is not a defence for republishing a photographer's copyrighted
 * work. So a non-free local en.wikipedia upload is **refused**, with the
 * refusal written into the manifest so nobody re-litigates it, and the only
 * files that get downloaded are Commons-hosted CC BY, CC BY-SA, CC0 or public
 * domain.
 *
 * Expect most people to have nothing. That is the correct outcome — the people
 * host says "no photograph published" rather than drawing a silhouette — and a
 * harvester that came back with a picture for all 42 would be the bug.
 *
 * ## The rate limit is not an answer
 *
 * A 429 means "come back later". Written down as "no photograph on the
 * article" it becomes a fact, and the next run skips the person because the
 * manifest already has an entry. So the backoff is exponential, and when it
 * runs out the **sweep stops** rather than recording anything for the person
 * in flight — the same rule `tools/fetch-search-queries.mjs` learned when a
 * blocked endpoint wrote an empty harvest over a good one. The manifest is
 * written after every person, so stopping costs the run and not the work.
 */
import fs from 'fs'
import path from 'path'

const RAW = path.resolve('src/seed/raw/people.json')
const MANIFEST = path.resolve('src/seed/raw/person-photos.json')
const OUT = path.resolve('assets/_photos')
const API = 'https://en.wikipedia.org/w/api.php'

/*
  Wikimedia asks for a User-Agent that identifies the tool and a way to reach
  whoever runs it. An anonymous script gets rate-limited and deserves to be.
*/
const UA = 'vellum-wiki-network/1.0 (game wiki network; contact via the site)'

/*
  Slower than the poster harvester's 700ms, and slower again after the first
  sweep took ten people before the endpoint started answering 429. Two of these
  tools can be pointed at en.wikipedia at once and the shared budget is the
  site's, not ours.
*/
const PACE = 2500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Raised when the backoff is exhausted, so `run` can stop the sweep. */
class RateLimited extends Error {}

const api = async (params, attempt = 0) => {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (response.status === 429 || response.status === 503) {
    if (attempt >= 5) throw new RateLimited(`rate limited by Wikipedia after ${attempt} retries`)
    /* Wikimedia sends Retry-After on some of these; its number beats our guess. */
    const stated = Number(response.headers.get('retry-after'))
    const wait = Number.isFinite(stated) && stated > 0 ? stated * 1000 : 5000 * 2 ** attempt
    console.log(`    rate limited, waiting ${Math.round(wait / 1000)}s`)
    await sleep(wait)
    return api(params, attempt + 1)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  await sleep(PACE)
  return response.json()
}

const strip = (value) =>
  typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : ''

/**
 * Licences that let this network publish somebody's photograph.
 *
 * Matched on `extmetadata.License`, the machine-readable value, rather than on
 * `LicenseShortName`, which is free text an uploader can write anything into.
 *
 * Everything not on this list is refused, including the ones that are nearly
 * free: NC and ND forbid the use outright, and GFDL-only asks us to ship the
 * licence text next to the image, which nothing on this site does. If in doubt,
 * skip — a missing photograph is a gap, and a gap is fine.
 */
const FREE = [
  /*
    The trailing group is the jurisdiction port and the GFDL-migration marker —
    `cc-by-sa-3.0-de`, `cc-by-sa-3.0-migrated`. Both are the same licence in
    the only sense that matters here, and the first sweep refused a real photo
    over one. NC and ND never reach this: in Commons' machine-readable code
    they sit *before* the version (`cc-by-nc-sa-3.0`), so they fail the head of
    the pattern, and the guard below refuses them again by name in case a code
    ever spells them the other way round.
  */
  /^cc-by(-sa)?(-\d(\.\d)?(-[a-z]{2,10})?)?$/,
  /^cc-zero$/,
  /^cc0(-1\.0)?$/,
  /^pd(-|$)/, // pd, pd-self, pd-old-70, pd-us-expired
  /^public[- ]domain$/,
]

const isFree = (license) => {
  const code = license.trim().toLowerCase()
  if (/(^|-)(nc|nd)(-|$)/.test(code)) return false
  return FREE.some((pattern) => pattern.test(code))
}

/** ASCII filename for a name that may be full of diacritics. */
const fileSlug = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[øØ]/g, 'o')
    .replace(/[đĐ]/g, 'd')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[ðÐ]/g, 'd')
    .replace(/[þÞ]/g, 'th')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * The lead image, as MediaWiki itself picks it.
 *
 * `prop=pageimages` returns the image the software already treats as the
 * article's representative one, which on a biography is the infobox portrait.
 * Choosing it ourselves would mean guessing between a portrait, a signature,
 * a coat of arms and a photograph of somebody else at the same event — and a
 * guessed picture on a person's page is a claim that it shows them.
 *
 * `pilicense=any` rather than the default `free`, which sounds like exactly
 * what this tool wants and is not: the default quietly returns nothing for an
 * article whose only portrait is a non-free local upload, and the run then
 * records "the article carries no lead image" — a wrong fact, and the wrong
 * one, because it hides the refusal that is the interesting half of this
 * harvest. Ask for everything and let the licence check below do the refusing
 * out loud.
 */
const leadImageOf = async (title) => {
  const data = await api({
    action: 'query',
    titles: title,
    prop: 'pageimages',
    piprop: 'name',
    pilicense: 'any',
  })
  const page = Object.values(data.query?.pages ?? {})[0]
  return page?.pageimage ? `File:${page.pageimage}` : null
}

const licenceOf = async (file) => {
  const data = await api({
    action: 'query',
    titles: file,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    /*
      A rendered thumbnail, not the original. Some of these are 4000px camera
      files and the page shows one at 200px — and asking for a thumbnail is
      also what makes an SVG usable, which is the lesson the logo harvester
      learned when Payload could not measure one and the upload failed inside
      a catch.
    */
    iiurlwidth: '400',
  })
  const page = Object.values(data.query?.pages ?? {})[0]
  const info = page?.imageinfo?.[0]
  if (!info) return null
  const meta = info.extmetadata ?? {}
  return {
    file,
    url: info.thumburl ?? info.url,
    mime: info.thumbmime ?? info.mime,
    licence: strip(meta.LicenseShortName?.value) || 'Not stated',
    licenceCode: strip(meta.License?.value),
    licenceUrl: strip(meta.LicenseUrl?.value),
    artist: strip(meta.Artist?.value),
    credit: strip(meta.Credit?.value),
    attributionRequired: strip(meta.AttributionRequired?.value).toLowerCase() === 'true',
    description: strip(meta.ImageDescription?.value),
    page: info.descriptionurl ?? '',
    /*
      Commons or a local en.wikipedia upload. A local upload is the non-free
      signal: Commons will not host a file that is not free, and en.wikipedia
      hosts locally precisely so it can keep fair-use files off it.
    */
    commons: /commons\.wikimedia\.org/i.test(info.descriptionurl ?? ''),
  }
}

const run = async () => {
  const file = JSON.parse(fs.readFileSync(RAW, 'utf8'))
  fs.mkdirSync(OUT, { recursive: true })

  /*
    Resumed, not restarted.

    The first sweep got ten people in before the endpoint started answering
    429, and a harvester that begins again at the top each time would spend its
    whole budget re-asking about the ten it already knows and never reach the
    eleventh. So every answer already on disk is kept and its person skipped;
    only people with no entry at all are asked about. `--recheck` throws every
    answer away and starts again; `--recheck-misses` throws away only the
    people who came back without a photograph, which is what to run after
    changing the licence rules or what is asked of the API — and is cheap
    enough to actually run, where a full re-sweep spends the whole budget
    re-learning answers that have not changed.
  */
  const all = process.argv.includes('--recheck')
  const misses = process.argv.includes('--recheck-misses')
  const previous =
    fs.existsSync(MANIFEST) && !all ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { people: [] }
  const keep = (previous.people ?? []).filter((entry) => entry.photo || !misses)
  const answered = new Map(keep.map((entry) => [entry.name, entry]))

  const manifest = {
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: 'en.wikipedia.org/w/api.php — imageinfo, extmetadata',
    /*
      Set only once the sweep has finished. A run that stopped on a rate limit
      leaves this false, which is how anybody reading the file later can tell
      "nobody has a photograph" from "we never got to ask".
    */
    complete: false,
    people: [...answered.values()],
  }

  const write = () => fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)

  const candidates = file.people.filter((person) => person.article)
  console.log(
    `${candidates.length} of ${file.people.length} people resolved to an article; ` +
      `${answered.size} already answered, asking about the rest.\n`,
  )
  /* Counted here because the manifest has no row for a person with no article. */
  const noArticle = file.people.length - candidates.length

  try {
    for (const person of candidates) {
      if (answered.has(person.name)) continue
      const label = person.name.padEnd(26)
      const article = person.article.url
      const record = { name: person.name, article, photo: false }

      const image = await leadImageOf(person.article.title)
      if (!image) {
        record.reason = 'the article carries no lead image'
        console.log(`  ${label} —`)
        manifest.people.push(record)
        write()
        continue
      }

      const info = await licenceOf(image)
      if (!info?.url) {
        record.reason = `${image}: the file page returned no image info`
        console.log(`  ${label} ${image} — no image info`)
        manifest.people.push(record)
        write()
        continue
      }

      record.file = info.file
      record.licence = info.licence
      record.licenceCode = info.licenceCode
      record.licenceUrl = info.licenceUrl
      record.artist = info.artist
      record.filePage = info.page

      if (!info.commons) {
        /*
          The refusal this harvester exists for. A file uploaded locally to
          en.wikipedia is there because Commons would not take it, which means
          somebody wrote a fair-use rationale for it — a rationale about
          Wikipedia's article, not about ours.
        */
        record.reason = `non-free: uploaded locally to en.wikipedia (${info.licence})`
        console.log(`  ${label} REFUSED  local upload, ${info.licence}`)
        manifest.people.push(record)
        write()
        continue
      }
      if (!isFree(info.licenceCode || info.licence)) {
        record.reason = `licence not on the free list: ${info.licence} (${info.licenceCode || 'no machine-readable code'})`
        console.log(`  ${label} REFUSED  ${info.licence}`)
        manifest.people.push(record)
        write()
        continue
      }
      if (info.attributionRequired && !info.artist) {
        /*
          Attribution is the condition of the licence, not a courtesy. A file
          that requires it and names nobody cannot be credited, so it cannot be
          used — refusing is the only reading that does not amount to taking it.
        */
        record.reason = `${info.licence} requires attribution and the file page names no author`
        console.log(`  ${label} REFUSED  ${info.licence}, no author named`)
        manifest.people.push(record)
        write()
        continue
      }

      const ext = /png/i.test(info.mime) ? 'png' : /webp/i.test(info.mime) ? 'webp' : 'jpg'
      const target = path.join(OUT, `${fileSlug(person.name)}.${ext}`)
      if (!fs.existsSync(target)) {
        const download = await fetch(info.url, { headers: { 'User-Agent': UA } })
        if (download.status === 429 || download.status === 503) {
          throw new RateLimited(`rate limited downloading ${info.file}`)
        }
        if (!download.ok) {
          record.reason = `download failed: HTTP ${download.status}`
          console.log(`  ${label} download failed: HTTP ${download.status}`)
          manifest.people.push(record)
          write()
          continue
        }
        fs.writeFileSync(target, Buffer.from(await download.arrayBuffer()))
        await sleep(PACE)
      }

      record.photo = true
      record.image = path.basename(target)
      console.log(`  ${label} ${record.image.padEnd(34)} ${info.licence} — ${info.artist || 'no author named'}`)
      manifest.people.push(record)
      write()
    }
    manifest.complete = true
  } catch (error) {
    if (!(error instanceof RateLimited)) throw error
    /*
      Stop, and say so. Everything already answered is on disk; the people not
      reached have no entry at all, which is what stops the next run reading
      this file as "asked and answered".
    */
    manifest.complete = false
    write()
    console.error(`\n${error.message}`)
    console.error(
      `Stopped after ${manifest.people.length} of ${candidates.length}. Nothing was recorded for the rest — ` +
        'a rate limit is not an answer. Run again later; it picks up where it left off.',
    )
    process.exit(1)
  }

  write()
  /*
    Totals over the whole manifest, not over this run. A resumed sweep answers
    six people and the interesting number is still "how many of the 42", which
    is the number somebody will quote.
  */
  const taken = manifest.people.filter((entry) => entry.photo).length
  const refused = manifest.people.filter((entry) => !entry.photo && entry.file).length
  const absent = manifest.people.length - taken - refused
  console.log(
    `\n${taken} freely licensed photographs in ${OUT}\n` +
      `${refused} refused (non-free, or a licence this site cannot meet), ` +
      `${absent} articles with no usable lead image, ` +
      `${noArticle} people with no article at all.`,
  )
  console.log('Run `pnpm seed:person-photos` to attach them.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
