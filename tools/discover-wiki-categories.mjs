/**
 * Finds the categories on each game's community wiki that belong to *that*
 * game rather than to its franchise.
 *
 *   node tools/discover-wiki-categories.mjs
 *
 * ## Why this step exists at all
 *
 * The obvious move is to point a harvester at `onimusha.fandom.com` and take
 * its Characters category. That wiki covers eight Onimusha games across
 * twenty-five years, so the result would be a Way of the Sword wiki listing
 * characters from Onimusha 2 — content that is real, sourced, and about a
 * different game. Wrong in the way that is hardest to notice, because every
 * individual page looks fine.
 *
 * So: find the categories whose names contain the game, and harvest only
 * those. A franchise wiki that has not created them yet has nothing
 * game-specific to give, and that is the answer rather than a reason to widen
 * the net.
 *
 * Writes `src/seed/raw/wiki-categories.json` for `fetch-wiki-entities.mjs`.
 */
import fs from 'fs'
import path from 'path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/**
 * Where each game's community wiki lives, and the phrase that marks a category
 * as being about this game.
 *
 * `match` is not always the full title. Fandom category names are written by
 * hand and abbreviate inconsistently, so this is the longest substring that is
 * reliably present and cannot match a sibling game.
 */
const GAMES = [
  { slug: 'dawnwalker', host: 'bloodofdawnwalker.fandom.com', match: null },
  { slug: 'onimusha-way-of-the-sword', host: 'onimusha.fandom.com', match: 'Way of the Sword' },
  { slug: 'control-resonant', host: 'control.fandom.com', match: 'Resonant' },
  { slug: 'resonance-a-plague-tale-legacy', host: 'aplaguetale.fandom.com', match: 'Resonance' },
  { slug: 'gears-of-war-e-day', host: 'gearsofwar.fandom.com', match: 'E-Day' },
  { slug: 'star-wars-zero-company', host: 'starwars.fandom.com', match: 'Zero Company' },
  { slug: 'phantom-blade-zero', host: 'phantomblade.fandom.com', match: null },
  { slug: 'silent-hill-townfall', host: 'silenthill.fandom.com', match: 'Townfall' },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const api = async (host, params) => {
  const query = new URLSearchParams({ format: 'json', ...params })
  const response = await fetch(`https://${host}/api.php?${query}`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * Every category on the wiki, paged.
 *
 * `allcategories` rather than searching, because a category with no members
 * still exists and a search would miss the ones named slightly differently
 * from the game's marketing title.
 */
const allCategories = async (host) => {
  const names = []
  let from
  for (let page = 0; page < 60; page += 1) {
    const data = await api(host, {
      action: 'query',
      list: 'allcategories',
      aclimit: '500',
      ...(from ? { acfrom: from } : {}),
    })
    for (const entry of data.query?.allcategories ?? []) names.push(entry['*'])
    from = data.continue?.accontinue
    if (!from) break
    await sleep(350)
  }
  return names
}

/**
 * Which of our collections a category belongs in.
 *
 * Ordered, and the first match wins: "Bosses" has to be tested before
 * "Characters" because a boss is a character and the bestiary is the more
 * useful home for it. Likewise weapons before items.
 */
const ROUTES = [
  { test: /\b(boss|bosses|enemies|enemy|creature|monster|genma|demon)\b/i, collection: 'enemies' },
  { test: /\b(character|characters|npc|npcs|cast|protagonist)\b/i, collection: 'characters' },
  { test: /\b(location|locations|area|areas|region|regions|map|maps|level|levels)\b/i, collection: 'regions' },
  { test: /\b(weapon|weapons|armou?r|equipment|gear|item|items|collectible|collectibles|consumable)\b/i, collection: 'items' },
  { test: /\b(chapter|chapters|mission|missions|quest|quests|episode|episodes|act|acts)\b/i, collection: 'quests' },
  { test: /\b(skill|skills|ability|abilities|perk|perks|upgrade|upgrades|talent)\b/i, collection: 'perks' },
  { test: /\b(ending|endings)\b/i, collection: 'endings' },
  { test: /\b(mechanic|mechanics|system|systems|gameplay)\b/i, collection: 'mechanics' },
]

/** Categories that are about the wiki rather than the game. */
const NOISE =
  /\b(image|images|gallery|screenshot|screenshots|concept art|transcript|transcripts|video|videos|file|files|stub|stubs|template|templates|candidate|disambiguation|browse|article|articles|page|pages|needing|needed|wiki)\b/i

const routeFor = (name) => {
  if (NOISE.test(name)) return null
  for (const route of ROUTES) if (route.test.test(name)) return route.collection
  return null
}

const out = {}

for (const game of GAMES) {
  process.stdout.write(`\n${game.slug}  (${game.host})\n`)

  if (!game.match) {
    console.log('  no franchise-shared wiki — the whole wiki is this game, or none exists')
  }

  let categories
  try {
    categories = await allCategories(game.host)
  } catch (error) {
    console.log(`  unreachable: ${error.message}`)
    out[game.slug] = { host: game.host, categories: [], reachable: false }
    continue
  }

  // With no `match`, the wiki is dedicated to this game and every category
  // counts. With one, only the categories naming it.
  const mine = game.match
    ? categories.filter((name) => name.toLowerCase().includes(game.match.toLowerCase()))
    : categories

  const routed = []
  for (const name of mine) {
    const collection = routeFor(name)
    if (collection) routed.push({ name, collection })
  }

  console.log(`  ${categories.length} categories on the wiki, ${mine.length} name this game`)
  for (const entry of routed) console.log(`    ${entry.collection.padEnd(12)} ${entry.name}`)
  if (routed.length === 0 && mine.length > 0) {
    console.log('    (none map to a collection — mostly images and transcripts)')
  }

  out[game.slug] = { host: game.host, match: game.match, categories: routed, reachable: true }
  await sleep(700)
}

const file = path.resolve('src/seed/raw/wiki-categories.json')
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`)

const total = Object.values(out).reduce((sum, entry) => sum + entry.categories.length, 0)
console.log(`\n${total} harvestable categories written to src/seed/raw/wiki-categories.json`)
