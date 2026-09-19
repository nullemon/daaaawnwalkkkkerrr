/**
 * Pictures from a game's own article on its community wiki.
 *
 *   node tools/fetch-game-art.mjs gta-6
 *
 * ## Why a game can have no art at all
 *
 * `src/seed/guide-images.ts` illustrates a guide from `assets/_games/<slug>`
 * — the store page's screenshots — and falls back to `assets/_wiki/<slug>`,
 * what the entity harvest pulled off the community wiki. A game with neither
 * gets no picture on any of its guides, which is the honest answer and also a
 * bad page.
 *
 * GTA 6 is in exactly that state and for two unrelated reasons. It has no PC
 * version, so there is no Steam listing and no store screenshots. And
 * `tools/harvest-game.mjs` is configured to harvest **no entities** from
 * gta.fandom.com, deliberately: 23,013 articles covering every game since
 * 1997, no category names this one because it is not out, and the link
 * intersection returned Bone County and Franklin Clinton. That decision is
 * right and this does not reopen it.
 *
 * ## Why images are a different question from entities
 *
 * The entity problem is that a *link* from this game's article does not mean
 * the target is in this game. An **image on** this game's article is not a
 * link to anywhere: it is a file the wiki placed on the page about this game,
 * which is the same provenance every other picture on this network already
 * rests on — `entity.image` is a page's own lead image and is trusted for
 * exactly this reason.
 *
 * So this reads one named article and takes the files on it. It follows
 * nothing, and it cannot reach another game's page, because there is no step
 * in it that leaves the article it was given.
 *
 * ## What it refuses
 *
 * Wiki articles carry furniture as well as art — rating badges, flag icons,
 * edit pencils, franchise logos reused on every page in the series. A logo is
 * the one that matters: it is genuinely about the franchise rather than this
 * game, and it is the thing most likely to be on every article. So files are
 * filtered by size, by extension, and by name against a list of the furniture
 * this wiki family uses. Anything under `MIN_BYTES` is a sprite.
 *
 * Files land in `assets/_wiki/<slug>/`, which is where `seed:guide-images`
 * already looks, so nothing downstream needs to know this ran.
 */
import fs from 'fs'
import path from 'path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/* The wiki and the exact article title, per game. Same shape as the harvester;
   kept here rather than imported because that file is a 1,000-line script that
   starts sweeping a wiki the moment it is loaded. */
const GAMES = {
  'gta-6': {
    host: 'gta.fandom.com',
    article: 'Grand Theft Auto VI',
    /* Every form the wiki names its files after. See the filter below. */
    names: ['gtavi', 'gta6', 'grandtheftautovi'],
  },
  'fire-emblem-fortunes-weave': {
    host: 'fireemblem.fandom.com',
    article: "Fire Emblem: Fortune's Weave",
    names: ['fortunesweave', 'fefw'],
  },
  deadlock: { host: 'deadlock.fandom.com', article: 'Deadlock', names: ['deadlock'] },
  'nba-2k27': { host: 'nba2k.fandom.com', article: 'NBA 2K27', names: ['nba2k27', '2k27'] },
}

/** Furniture, not art. Matched against the file name, case-insensitively. */
const FURNITURE = [
  'logo',
  'wordmark',
  'favicon',
  'wiki-background',
  'esrb',
  'pegi',
  'usk',
  'cero',
  'rating',
  'icon',
  'flag',
  'emblem-',
  'sitenotice',
  'placeholder',
  'no_image',
  'noimage',
  'spoiler',
  'stub',
  'quote',
  'edit',
  'padlock',
  'featured',
]

const MIN_BYTES = 20000

const slug = process.argv[2]
if (!slug || !GAMES[slug]) {
  console.error('Usage: node tools/fetch-game-art.mjs <game-slug>')
  console.error(`Known: ${Object.keys(GAMES).join(', ')}`)
  process.exit(1)
}

const game = GAMES[slug]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const api = async (params) => {
  const url = `https://${game.host}/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${game.host}`)
  return response.json()
}

console.log(`Reading ${game.article} on ${game.host}\n`)

/* Every file used on that one page. `prop=images` does not follow links. */
const listed = await api({ action: 'query', prop: 'images', titles: game.article, imlimit: '500' })
const page = listed?.query?.pages?.[0]

if (!page || page.missing) {
  console.error(`No article "${game.article}" on ${game.host}. Check the exact title.`)
  process.exit(1)
}

const files = (page.images ?? []).map((i) => i.title)
console.log(`  ${files.length} files on the article`)

/*
  **The file's own name has to name this game**, and that rule is here because
  the first run without it took two pictures of other people's games.

  The GTA VI article carries `FallGuys-Dec2023-TrailerAnnouncement-X.png` and
  `HaloInfinite-Dec2023-TrailerAnnouncement-X.jpg` — Mediatonic and 343
  tweeting about somebody else's trailer, which is genuinely part of that
  article's subject and is genuinely not a picture of this game. Either one, as
  a guide's lead image, would have printed "Grand Theft Auto VI © Rockstar
  Games" over another studio's work: the exact claim `seed:guide-images` had to
  be rebuilt to stop making.

  A deny-list cannot work here. It would have to name every game any studio
  might ever tweet about, which is every game. So the test is positive: a file
  is taken only if its name contains one of the forms this game is actually
  called. Twenty-three of the twenty-five files say `GTAVI`; the two that do
  not are the two that are not it.

  Being too strict costs pictures, which is the recoverable direction. Being
  too loose costs a false copyright line printed inside somebody else's work.
*/
const rejected = []
const wanted = files.filter((title) => {
  if (!/\.(png|jpe?g|webp)$/i.test(title)) return false
  const name = title.replace(/^File:/i, '').toLowerCase()
  if (FURNITURE.some((word) => name.includes(word))) return false

  const flattened = name.replace(/[^a-z0-9]/g, '')
  if (!game.names.some((form) => flattened.includes(form))) {
    rejected.push(title.replace(/^File:/i, ''))
    return false
  }
  return true
})
console.log(`  ${wanted.length} after dropping furniture and anything that does not name the game\n`)

if (rejected.length > 0) {
  console.log('  Not taken — the file name does not name this game:')
  for (const name of rejected.slice(0, 12)) console.log(`    ${name}`)
  if (rejected.length > 12) console.log(`    ...and ${rejected.length - 12} more`)
  console.log('')
}

if (wanted.length === 0) {
  console.log('Nothing to take. A wiki with no art for a game is a finding, not an error.')
  process.exit(0)
}

const dir = path.resolve('assets/_wiki', slug)
fs.mkdirSync(dir, { recursive: true })

let saved = 0
let skipped = 0
let tooSmall = 0

for (const title of wanted) {
  const info = await api({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|size',
    titles: title,
  })
  const image = info?.query?.pages?.[0]?.imageinfo?.[0]
  if (!image?.url) continue

  const name = title
    .replace(/^File:/i, '')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 80)
  const file = path.join(dir, name)

  if (fs.existsSync(file)) {
    skipped += 1
    continue
  }

  try {
    const response = await fetch(image.url.split('/revision/')[0], { headers: { 'User-Agent': UA } })
    if (!response.ok) continue
    const buffer = Buffer.from(await response.arrayBuffer())
    /* A sprite or an error page, not a screenshot. */
    if (buffer.length < MIN_BYTES) {
      tooSmall += 1
      continue
    }
    fs.writeFileSync(file, buffer)
    saved += 1
    console.log(`  ${name}  ${(buffer.length / 1024).toFixed(0)}kB`)
  } catch {
    /* One missing file is not a reason to stop. */
  }
  await sleep(250)
}

console.log(
  `\n${saved} saved to assets/_wiki/${slug}/${skipped > 0 ? `, ${skipped} already here` : ''}${tooSmall > 0 ? `, ${tooSmall} too small to be art` : ''}.`,
)
console.log('Run `pnpm seed:guide-images` to illustrate that wiki’s guides.')
