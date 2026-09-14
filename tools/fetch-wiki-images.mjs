/**
 * Pulls record images from community wiki pages.
 *
 *   node tools/fetch-wiki-images.mjs regions          # dry run, prints a plan
 *   node tools/fetch-wiki-images.mjs regions --apply  # download into assets/
 *   node tools/fetch-wiki-images.mjs items --apply
 *
 * READ THIS BEFORE RUNNING IT. docs/ASSETS.md tells you not to do this, and
 * the reasons it gives still stand: these images are ripped from the game
 * files, so using them inherits that exposure, and it adds a terms-of-service
 * question against the wiki on top. The site owner weighed that and chose it
 * deliberately after the official routes were exhausted — no press kit, store
 * page or official channel labels which region or item a picture shows, and
 * the extraction route in docs/ASSETS.md §5 needs the game installed.
 *
 * What this does to stay defensible:
 *
 *   - reads robots.txt first and refuses any path the host disallows
 *   - one request per second, single-threaded, with a real referer
 *   - only accepts an image whose own filename matches the record it is for,
 *     so "Durandal" art can never be filed under "Gladius"
 *   - records the page and file URL for every image in a manifest, so the
 *     credit survives into the site rather than being lost on download
 *
 * Everything it writes lands in assets/, which is gitignored, and is attached
 * by `pnpm assets` exactly like any other image.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

const KIND = process.argv[2]
const APPLY = process.argv.includes('--apply')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/**
 * Which collections can be fetched, and where each lands.
 *
 * `index` pages are harvested first: a wiki list page usually carries every
 * entry's portrait already, so one request can place a dozen records where
 * guessing a dozen page names would cost a dozen requests and miss most of
 * them. Bosses are filed under epithets — "Bakir the Mad Khan" — that no rule
 * could derive from a record called "Bakir", but the index's own filenames
 * read Bakir-boss-character-…, which matches on sight.
 */
const KINDS = {
  regions: { table: 'regions', dir: 'regions' },
  items: { table: 'items', dir: 'items' },
  enemies: { table: 'enemies', dir: 'enemies', index: ['/Bosses', '/Enemies'] },
  characters: { table: 'characters', dir: 'characters', index: ['/NPCs'] },
}

const HOST = 'bloodofdawnwalker.wiki.fextralife.com'
const BASE = `https://${HOST}`

if (!KINDS[KIND]) {
  console.error(`Usage: node tools/fetch-wiki-images.mjs <${Object.keys(KINDS).join('|')}> [--apply]`)
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Fetch and parse robots.txt into the list of paths disallowed for everyone.
 * A host that will not serve one at all is treated as allowing nothing, which
 * is the cautious reading rather than the convenient one.
 */
async function disallowedPaths() {
  const response = await fetch(`${BASE}/robots.txt`, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`no robots.txt from ${HOST} — refusing to guess`)
  const text = await response.text()

  const rules = []
  let applies = false
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    const [field, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    const key = field.trim().toLowerCase()
    if (key === 'user-agent') applies = value === '*'
    else if (key === 'disallow' && applies && value) rules.push(value)
  }
  return rules
}

const isAllowed = (pathname, rules) =>
  !rules.some((rule) => {
    const prefix = rule.endsWith('*') ? rule.slice(0, -1) : rule
    return pathname.startsWith(prefix)
  })

/** Normalise for comparison: lowercase, letters and digits only. */
const key = (value) =>
  String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')

/**
 * Does this image file actually belong to this record?
 *
 * Wiki filenames carry the subject — Svartau-city-region-blood-of-dawnwalker-
 * wiki-guide.png — so requiring the record's own words to appear in the
 * filename is a cheap, strong guard. Without it a page whose main image is a
 * generic banner would quietly file that banner under a named record, which is
 * exactly the mislabelling this project refuses to do.
 */
const filenameMatches = (filename, title, slug) => {
  const haystack = key(filename)
  if (!haystack) return false
  if ((FILENAME_ALIASES[slug] ?? []).some((alias) => haystack.includes(alias))) return true
  if (haystack.includes(key(slug))) return true
  if (haystack.includes(key(title))) return true
  // Fall back to every word of four letters or more having to appear.
  const words = String(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4)
  return words.length > 0 && words.every((word) => haystack.includes(word))
}

/**
 * Titles the wiki files under a different spelling from ours.
 *
 * The match guard refused all three on its first run, which is the guard
 * working: these really are different words. Each is listed here with why,
 * rather than the guard being loosened until they slipped through.
 *
 *   Svartau — the wiki drops the r from Svartrau throughout, including in its
 *   own filenames. A typo on their side, not a different place.
 *   Silts — the Slits/Silts split that docs/DATA.md records as a live conflict.
 *   We keep "the-slits"; the wiki uses the other spelling.
 */
const TITLE_ALIASES = {
  'svartrau-city': ['Svartau+City', 'Svartrau+City'],
  'svartrau-outskirts': ['Svartau+Outskirts', 'Svartrau+Outskirts'],
  'the-slits': ['The+Silts', 'The+Slits', 'Silts'],
}

/** Extra words that count as a filename match for a given record. */
const FILENAME_ALIASES = {
  'svartrau-city': ['svartaucity'],
  'svartrau-outskirts': ['svartauoutskirts'],
  'the-slits': ['silts', 'thesilts'],
}

/** Wiki page candidates for a record, best guess first. */
const candidates = (title, slug) => {
  const plus = title.replace(/['’]/g, '').replace(/\s+/g, '+')
  const set = new Set([
    ...(TITLE_ALIASES[slug] ?? []),
    plus,
    plus.replace(/\+/g, '_'),
    encodeURIComponent(title).replace(/%20/g, '+'),
  ])
  return [...set]
}

const db = new DatabaseSync(path.resolve('dawnwalker.db'), { readOnly: true })
const spec = KINDS[KIND]
const imageCol = spec.table === 'characters' ? 'portrait_id' : 'image_id'
const records = db
  .prepare(`select slug, title, ${imageCol} as img from ${spec.table} order by title`)
  .all()

const rules = await disallowedPaths()
console.log(`robots.txt: ${rules.length} disallowed prefixes for *`)
console.log(`${records.length} ${KIND} to try\n`)

const outDir = path.resolve('assets', spec.dir)
if (APPLY) fs.mkdirSync(outDir, { recursive: true })

const manifest = []
let got = 0
let already = 0
const missed = []

/** Every full-size wiki image URL on a page, minus chrome. */
const imagesOn = (html) =>
  [...html.matchAll(/https:\/\/static\d*\.fextralifeimages\.com\/file\/bloodofdawnwalker\/[^"'\s]+\.(?:png|jpg|jpeg|webp)/gi)]
    .map((match) => match[0])
    .filter((url) => !url.includes('/thumb/'))
    .filter((url) => !/\/(logo|favicon|Image00)\.(png|jpg)$/i.test(url))

// Harvest the index pages once, so per-record lookups only run for whatever
// they could not place.
const fromIndex = new Map()
for (const indexPath of spec.index ?? []) {
  if (!isAllowed(indexPath, rules)) {
    console.log(`  ! ${indexPath} disallowed by robots.txt — skipped`)
    continue
  }
  await sleep(1000)
  const page = await fetch(BASE + indexPath, { headers: { 'User-Agent': UA } })
  if (!page.ok) continue
  const html = await page.text()
  const urls = imagesOn(html)
  for (const record of records) {
    if (fromIndex.has(record.slug)) continue
    const hit = urls.find((url) => filenameMatches(path.basename(url), record.title, record.slug))
    if (hit) fromIndex.set(record.slug, { url: hit, page: BASE + indexPath })
  }
  console.log(`  index ${indexPath}: ${urls.length} images, ${fromIndex.size} records placed so far`)
}
if (fromIndex.size > 0) console.log()

for (const record of records) {
  if (record.img) {
    already++
    continue
  }

  let found = fromIndex.get(record.slug) ?? null
  for (const candidate of found ? [] : candidates(record.title, record.slug)) {
    const pathname = `/${candidate}`
    if (!isAllowed(pathname, rules)) {
      console.log(`  ! ${record.slug}: ${pathname} is disallowed by robots.txt — skipped`)
      break
    }

    await sleep(1000)
    let page
    try {
      page = await fetch(BASE + pathname, { headers: { 'User-Agent': UA } })
    } catch {
      continue
    }
    if (!page.ok) continue
    const html = await page.text()

    // Full-size files only: the thumb/ variants are downscales of the same art.
    const urls = [...html.matchAll(/https:\/\/static\d*\.fextralifeimages\.com\/file\/bloodofdawnwalker\/[^"'\s]+\.(?:png|jpg|jpeg|webp)/gi)]
      .map((match) => match[0])
      .filter((url) => !url.includes('/thumb/'))
      .filter((url) => !/\/(logo|favicon)\.png$/i.test(url))

    const hit = urls.find((url) => filenameMatches(path.basename(url), record.title, record.slug))
    if (hit) {
      found = { url: hit, page: BASE + pathname }
      break
    }
  }

  if (!found) {
    missed.push(record.slug)
    continue
  }

  const ext = path.extname(new URL(found.url).pathname).toLowerCase() || '.png'
  const rel = `${spec.dir}/${record.slug}${ext}`
  if (APPLY) {
    await sleep(1000)
    const file = await fetch(found.url, { headers: { 'User-Agent': UA, Referer: found.page } })
    if (!file.ok) {
      missed.push(`${record.slug} (image ${file.status})`)
      continue
    }
    fs.writeFileSync(path.join(outDir, `${record.slug}${ext}`), Buffer.from(await file.arrayBuffer()))
  }

  manifest.push({ file: rel, record: record.slug, title: record.title, page: found.page, url: found.url })
  got++
  console.log(`  + ${rel}  <- ${path.basename(found.url)}`)
}

if (APPLY && manifest.length > 0) {
  const manifestPath = path.resolve('assets/_library/wiki-images.json')
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  const existing = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files ?? []
    : []
  const merged = [...existing.filter((entry) => !manifest.some((row) => row.file === entry.file)), ...manifest]
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        about:
          'Images taken from community wiki pages. See the header of tools/fetch-wiki-images.mjs and the "What not to do" section of docs/ASSETS.md — this route was chosen deliberately after the official ones were exhausted. Each entry records the page it came from so the credit survives.',
        source: BASE,
        fetched: new Date().toISOString().slice(0, 10),
        files: merged.sort((a, b) => a.file.localeCompare(b.file)),
      },
      null,
      2,
    )}\n`,
  )
}

console.log(`\n${APPLY ? 'downloaded' : 'would download'} ${got}`)
console.log(`already had an image: ${already}`)
console.log(`no confident match: ${missed.length}`)
if (missed.length > 0) console.log(`  ${missed.join(', ')}`)
if (!APPLY) console.log('\nre-run with --apply to download')
