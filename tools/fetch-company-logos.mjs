/**
 * A second source for company logos: Commons file search.
 *
 *   node tools/fetch-company-logos.mjs            # every company with no logo
 *   node tools/fetch-company-logos.mjs --limit 40
 *
 * ## Why not Wikidata
 *
 * Wikidata was the obvious second source and it was checked first, against the
 * eight studios this network most needs: **P154 (logo image) produced zero
 * correctly-attributed logos.** Six of the eight have no P154 at all, and the
 * one that does is a trap worth writing down —
 *
 *   Screen Burn (Q62604390) carries `No Code logo.svg`, genuinely public
 *   domain, with the qualifier **P582 (end time) = 2025**. The company was
 *   formerly No Code Limited. It is the right file for the wrong name, and
 *   publishing it as Screen Burn's mark is the `ART_GAME` misattribution
 *   arriving through a third door.
 *
 * So this searches Commons directly, which is where the free files actually
 * are: `Unknown Worlds Entertainment`'s logo is on Commons as public domain
 * and its Wikidata entity does not point at it.
 *
 * ## What it refuses
 *
 * The licence rule is unchanged and is the point of the whole pass: a file is
 * taken **only** if Commons says it is public domain or a CC licence, and only
 * if `NonFree` is absent. A company logo uploaded to en.wikipedia under a
 * fair-use rationale is not free, and recording one as CC BY-SA would print a
 * false licence claim inside the credit line — the failure `creditBasis` in
 * `src/lib/credit.ts` exists to prevent.
 *
 * The filename must also **name the company**. Commons search on "Konami
 * logo" happily returns a photograph of a building with a Konami sign on it;
 * a positive name test is the same rule `tools/fetch-game-art.mjs` needed
 * after it took a Fall Guys tweet off the GTA VI article.
 *
 * Writes `src/seed/raw/company-logos.json`, a second manifest rather than an
 * edit to `companies.json`: the harvest is a record of what Wikipedia said,
 * and this is a record of what Commons said. `seed:companies` reads both.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

import { namesCompany } from './lib/logo-name.mjs'

const UA = 'VellumWikiNetwork/1.0 (game wiki network; non-commercial) node-fetch'
const API = 'https://commons.wikimedia.org/w/api.php'
const OUT = path.resolve('src/seed/raw/company-logos.json')
const DB = path.resolve('dawnwalker.db')

const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const FREE = /^(public domain|cc[ -]|pd-|no restrictions)/i

/**
 * A 429 is "come back later", and written down as "no logo" it becomes a fact
 * that stops the next run even looking. Terminal, like every other harvester
 * here.
 */
const api = async (params, attempt = 0) => {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (response.status === 429 || response.status === 403) {
    const wait = Number(response.headers.get('retry-after') ?? 0) * 1000 || 20000 * (attempt + 1)
    if (attempt < 3) {
      console.log(`    rate limited, waiting ${Math.round(wait / 1000)}s`)
      await sleep(wait)
      return api(params, attempt + 1)
    }
    throw Object.assign(new Error('Commons is refusing us'), { terminal: true })
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const licenceOf = async (title) => {
  const data = await api({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '512',
    titles: title,
  })
  const page = data?.query?.pages?.[0]
  const info = page?.imageinfo?.[0]
  if (!info) return null
  const meta = info.extmetadata ?? {}
  const licence = meta.LicenseShortName?.value ?? ''
  const nonFree = String(meta.NonFree?.value ?? '') === '1'
  if (nonFree || !FREE.test(licence)) return { free: false, licence: licence || 'unknown' }
  return {
    free: true,
    licence,
    artist: String(meta.Artist?.value ?? '')
      .replace(/<[^>]*>/g, '')
      .trim(),
    /* The rendered thumbnail, not the original: most of these are SVG and the
       upload pipeline cannot measure one. */
    url: info.thumburl ?? info.url,
    page: info.descriptionurl,
  }
}

/* Companies with no logo, read straight from the database. */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const db = new DatabaseSync(DB, { readOnly: true })
const rows = db
  .prepare('select slug, name from companies where logo_id is null order by name')
  .all()
db.close()

console.log(`${rows.length} companies with no logo\n`)

const held = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { logos: {} }
const logos = { ...(held.logos ?? {}) }

let found = 0
let refused = 0
let looked = 0

try {
  for (const row of rows) {
    if (looked >= LIMIT) break
    if (logos[row.slug]) continue
    looked += 1

    const search = await api({
      action: 'query',
      list: 'search',
      srsearch: `${row.name} logo`,
      srnamespace: '6',
      srlimit: '8',
    })
    await sleep(500)

    const candidates = (search?.query?.search ?? [])
      .map((hit) => hit.title)
      .filter((title) => /\.(svg|png)$/i.test(title))
      .filter((title) => namesCompany(title.replace(/^File:/i, ''), row.name))

    let taken = null
    for (const title of candidates.slice(0, 3)) {
      const answer = await licenceOf(title)
      await sleep(400)
      if (answer?.free) {
        taken = { file: title.replace(/^File:/i, ''), ...answer }
        break
      }
      if (answer) refused += 1
    }

    if (taken) {
      logos[row.slug] = { name: row.name, ...taken }
      found += 1
      console.log(`  ${row.name.padEnd(34)} ${taken.file.slice(0, 44)}  ${taken.licence}`)
    }
  }
} catch (error) {
  if (!error.terminal) throw error
  console.log(`\n${error.message}. Stopping — what was found so far is written below.`)
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(
  OUT,
  `${JSON.stringify({ fetchedAt: new Date().toISOString().slice(0, 10), source: 'commons.wikimedia.org search', logos }, null, 2)}\n`,
)

console.log(
  `\n${found} freely licensed logos found (${refused} candidates refused as non-free), ` +
    `${Object.keys(logos).length} in the manifest`,
)
console.log('Run `pnpm seed:companies` to attach them.')
