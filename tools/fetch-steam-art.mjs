/**
 * Downloads the official Steam community art for the game.
 *
 *   node tools/fetch-steam-art.mjs
 *   node tools/make-portraits.mjs
 *   pnpm assets
 *
 * Steam sells profile backgrounds and trading cards per character, and the
 * publisher names each item — "Ambrus (Profile Background)". That label is a
 * source naming who is in the picture, which is the bar docs/ASSETS.md sets for
 * putting a face on a page that names a person. It is the only image route on
 * this site that clears it; the press screenshots never do.
 *
 * assets/ is gitignored, so without this the portrait pipeline could not be run
 * from a clean checkout at all — the crop script would find nothing to crop.
 */
import fs from 'fs'
import path from 'path'

/** The game on Steam. Community items live under app 753 tagged to it. */
const APP_ID = '3751260'
const MARKET =
  `https://steamcommunity.com/market/search/render/` +
  `?norender=1&appid=753&category_753_Game%5B%5D=tag_app_${APP_ID}`
const IMAGE_BASE = 'https://community.fastly.steamstatic.com/economy/image/'

const OUT = path.resolve('assets/_library/steam-community')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const PAGE_SIZE = 10

/**
 * Which item types we keep, and where each lands.
 *
 * Backgrounds are 1920x1080 artwork — the useful ones. Cards come back at
 * 224x261 because the market API exposes no larger variant, which is below the
 * portrait minimum in docs/ASSETS.md; they are kept for reference only, and
 * make-portraits.mjs deliberately does not cut from them.
 *
 * Rarity is part of the type string ("Uncommon Profile Background"), so match
 * on the tail rather than the whole thing — Coen's background is the uncommon
 * one, and an equality test silently drops the protagonist.
 */
const KINDS = [
  { dir: 'backgrounds', ext: 'jpg', test: /Profile Background$/i },
  { dir: 'cards', ext: 'png', test: /(?<!Foil )Trading Card$/i },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const get = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response
}

/** Strip the parenthesised item kind: "Ambrus (Profile Background)" -> "ambrus". */
const subjectOf = (name) =>
  name
    .replace(/\s*\((?:Foil\s+)?(?:Trading Card|Profile Background)\)\s*/i, '')
    .trim()

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

async function run() {
  console.log(`Reading the Steam market listing for app ${APP_ID}…`)

  const items = []
  let start = 0
  let total = Infinity
  while (start < total) {
    const response = await get(`${MARKET}&start=${start}&count=${PAGE_SIZE}`)
    const page = await response.json()
    total = page.total_count ?? 0
    for (const result of page.results ?? []) items.push(result)
    start += PAGE_SIZE
    // The market API is rate-limited and this is a handful of pages; a short
    // pause is cheaper than being told to come back later.
    if (start < total) await sleep(400)
  }
  console.log(`  ${items.length} community items listed`)

  const manifest = []
  const seen = new Set()

  for (const kind of KINDS) {
    const dir = path.join(OUT, kind.dir)
    fs.mkdirSync(dir, { recursive: true })

    for (const item of items) {
      const type = item.asset_description?.type ?? ''
      if (!kind.test.test(type)) continue

      const subject = subjectOf(item.name)
      const slug = slugify(subject)
      const key = `${kind.dir}/${slug}`
      // Foils and duplicates repeat the same subject; first one wins.
      if (seen.has(key)) continue
      seen.add(key)

      const url = `${IMAGE_BASE}${item.asset_description.icon_url}`
      const file = path.join(dir, `${slug}.${kind.ext}`)
      const response = await get(url)
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))

      manifest.push({
        file: `${kind.dir}/${slug}.${kind.ext}`,
        subject,
        steamItem: item.name,
        type,
        url,
      })
      console.log(`  + ${kind.dir}/${slug}.${kind.ext}`)
    }
  }

  fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    `${JSON.stringify(
      {
        about:
          'Official Steam community items for The Blood of Dawnwalker. Each is named by the publisher, which is what makes these usable on a record page — see docs/ASSETS.md. Credit: The Blood of Dawnwalker © Rebel Wolves / Bandai Namco Entertainment.',
        page: `https://steamcommunity.com/market/search?appid=753&category_753_Game%5B%5D=tag_app_${APP_ID}`,
        fetched: new Date().toISOString().slice(0, 10),
        files: manifest.sort((a, b) => a.file.localeCompare(b.file)),
      },
      null,
      2,
    )}\n`,
  )

  const backgrounds = manifest.filter((entry) => entry.file.startsWith('backgrounds/')).length
  console.log(`done — ${manifest.length} files, ${backgrounds} usable backgrounds`)
  console.log('next: node tools/make-portraits.mjs && pnpm assets')
}

await run()
