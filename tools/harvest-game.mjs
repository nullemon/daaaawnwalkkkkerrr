/**
 * Everything one game's community wiki can legitimately give, in one pass.
 *
 *   node tools/harvest-game.mjs onimusha-way-of-the-sword
 *   node tools/harvest-game.mjs onimusha-way-of-the-sword --images
 *
 * ## Why this replaced the first harvester
 *
 * The first version read only the categories that named the game, and returned
 * twenty-eight pages from a wiki holding eleven hundred. Categories are how a
 * wiki *files* things, and a young wiki has barely started filing — most of
 * what it knows about a new game is reachable only by following links.
 *
 * So candidates now come from three places and are merged:
 *
 *   1. Categories naming the game            — filed, unambiguous
 *   2. Pages that link TO the game's article — an entity that mentions it
 *   3. Pages the game's article links to     — its cast, weapons, places
 *
 * Two and three are broad on purpose and would be reckless alone: a page can
 * link to a game to say it is *unlike* that game. What makes them safe is the
 * classification step, which reads each candidate's own categories and keeps
 * it only if it is recognisably a character, weapon, location, boss, chapter
 * or ability. A page that is a list, a disambiguation, a real person, another
 * game or a piece of trivia is dropped rather than guessed at.
 *
 * ## What is taken
 *
 * Title, infobox parameters, categories, the page's lead image, and the URL.
 * Facts and a picture. Not one sentence of anybody's prose — summaries are
 * composed from the infobox by `src/seed/wiki-entities.ts`.
 *
 * Writes `src/seed/raw/wiki-entities/<slug>.json`, and with `--images`
 * downloads each lead image into `assets/_wiki/<slug>/`.
 */
import fs from 'fs'
import path from 'path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const WANT_IMAGES = process.argv.includes('--images')
const slug = process.argv[2]

/**
 * Per game: the wiki, the exact title of its article there, the phrase that
 * marks a category as belonging to it, and whether links may be followed.
 *
 * ## `linkHarvest`
 *
 * Following links off the game's article is what turns a handful of filed
 * pages into a real wiki — on a site dedicated to one series. On a very large
 * franchise wiki it is actively wrong, and Wookieepedia proves it: 228,000
 * articles, and following links produced Obi-Wan Kenobi, the planet Naboo,
 * lightsabers and the Articles of Secession. All real Star Wars, none of it
 * *Zero Company* content — a page links to a game because it mentions it, and
 * on a wiki that size almost everything mentions almost everything.
 *
 * So links are followed where a link plausibly implies relevance, and not
 * where it does not. The judgement is per wiki and written down rather than
 * inferred from a size threshold, because the threshold would be a guess.
 */
const GAMES = {
  'onimusha-way-of-the-sword': {
    host: 'onimusha.fandom.com',
    article: 'Onimusha: Way of the Sword',
    match: 'Way of the Sword',
    // 1,100 articles across eight games. Small enough that a link off this
    // game's article is about this game.
    linkHarvest: true,
  },
  'control-resonant': {
    host: 'control.fandom.com',
    article: 'Control Resonant',
    match: 'Resonant',
    // 940 articles across two games.
    linkHarvest: true,
  },
  'resonance-a-plague-tale-legacy': {
    host: 'aplaguetale.fandom.com',
    article: 'Resonance: A Plague Tale Legacy',
    match: 'Resonance',
    // 291 articles across three games.
    linkHarvest: true,
  },
  'gears-of-war-e-day': {
    host: 'gearsofwar.fandom.com',
    article: 'Gears of War: E-Day',
    match: 'E-Day',
    // 3,100 articles. E-Day is a prequel, so its cast and its Locust are the
    // series' — a link here genuinely implies the subject is in it.
    linkHarvest: true,
  },
  'phantom-blade-zero': {
    host: 'phantomblade.fandom.com',
    article: 'Phantom Blade Zero',
    match: 'Phantom Blade Zero',
    // 262 articles. Small, and this game is its flagship.
    linkHarvest: true,
  },
  'silent-hill-townfall': {
    host: 'silenthill.fandom.com',
    article: 'Silent Hill: Townfall',
    match: 'Townfall',
    // 925 articles across the whole series. Townfall is a standalone entry
    // with its own cast, so a link off its article is about it.
    linkHarvest: true,
  },
  'star-wars-zero-company': {
    // Wookieepedia titles it without the colon. With one, the article does not
    // exist, every link query returns nothing, and the harvest reports zero
    // candidates as though the wiki had no coverage at all.
    host: 'starwars.fandom.com',
    article: 'Star Wars Zero Company',
    match: 'Zero Company',
    // 228,000 articles. See the note above: following links here returns the
    // Star Wars universe, not this game. Categories only.
    // Categories alone give nothing here, so the fallback is the intersection:
    // pages the game's article links to that also link back. Mutual linking on
    // Wookieepedia means an Appearances entry both ways, which is as close to
    // 'is in this game' as the wiki gets without parsing prose.
    linkHarvest: 'intersect',
  },
}

if (!slug || !GAMES[slug]) {
  console.error('Usage: node tools/harvest-game.mjs <game-slug> [--images]')
  console.error(`Known: ${Object.keys(GAMES).join(', ')}`)
  process.exit(1)
}

const game = GAMES[slug]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const api = async (params, attempt = 0) => {
  const query = new URLSearchParams({ format: 'json', ...params })
  try {
    const response = await fetch(`https://${game.host}/api.php?${query}`, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    if (attempt < 2) {
      await sleep(1500 * (attempt + 1))
      return api(params, attempt + 1)
    }
    throw error
  }
}

/** Page a list endpoint until it stops continuing. */
const paged = async (params, listKey, contKey, pluck, cap = 20) => {
  const out = []
  let cont
  for (let page = 0; page < cap; page += 1) {
    const data = await api({ ...params, ...(cont ? { [contKey]: cont } : {}) })
    for (const entry of data.query?.[listKey] ?? []) out.push(pluck(entry))
    cont = data.continue?.[contKey]
    if (!cont) break
    await sleep(300)
  }
  return out
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Which collection a page belongs in, decided from its own categories.
 *
 * Ordered: the first match wins. Bosses before characters, because a boss is a
 * character on most wikis and the bestiary is where a reader looks for it.
 * Weapons before items for the same reason.
 */
/*
  Every noun here is written with an optional plural, and that is not tidiness.

  `\bcreature\b` does not match "Creatures" — the trailing `s` is a word
  character, so the boundary fails. A bestiary page filed under six categories
  named "Creatures in …" scored zero on the enemies route and was classified
  from its single "Characters" category instead. The same silent miss applied
  to monster, weapon, planet, mission and a dozen others; the routes appeared
  to work because the categories that happened to be written in the singular
  carried them.

  "gear" is deliberately absent: the franchise is called Gears of War, so
  "Gear Soldier" is a rank, and matching on it filed soldiers as equipment.
*/
const ROUTES = [
  { test: /\b(bosses?|enem(y|ies)|creatures?|monsters?|genma|demons?|beasts?|locust|abominations?|droid models?|battle droids?)\b/i, collection: 'enemies' },
  { test: /\b(weapons?|firearms?|swords?|blades?|guns?|rifles?|armou?r|apparel|equipment|starfighters?|vehicles?|craft|tanks?|speeders?|products?)\b/i, collection: 'items' },
  { test: /\b(items?|collectibles?|consumables?|documents?|artefacts?|artifacts?|relics?)\b/i, collection: 'items' },
  { test: /\b(characters?|npcs?|cast|protagonists?|antagonists?|all(y|ies)|individuals?|humans?|males?|females?|jedi|sith|clones?|species|persons?|people)\b/i, collection: 'characters' },
  { test: /\b(locations?|areas?|regions?|places?|buildings?|cities|city|towns?|planets?|moons?|worlds?|sectors?)\b/i, collection: 'regions' },
  { test: /\b(chapters?|missions?|quests?|episodes?|acts?|battles?|campaigns?|operations?|levels?)\b/i, collection: 'quests' },
  { test: /\b(skills?|abilit(y|ies)|perks?|upgrades?|talents?|powers?|techniques?)\b/i, collection: 'perks' },
  { test: /\b(endings?)\b/i, collection: 'endings' },
  { test: /\b(factions?|organisations?|organizations?|corps|armies|army|militar|governments?|orders?)\b/i, collection: 'characters' },
  { test: /\b(mechanics?|systems?|gameplay|features?)\b/i, collection: 'mechanics' },
]

/**
 * Categories that mean "this page is not an entity".
 *
 * A wiki files its own housekeeping in categories too, and several of these —
 * real people, other media, disambiguation — describe pages that would import
 * cleanly and be nonsense on a game wiki. Voice actors are the trap: they sit
 * in the same category tree as the characters they play.
 */
const NOT_AN_ENTITY =
  /(disambiguation|lists?|index|stubs?|templates?|images?|gallery|files?|categor(y|ies)|needing|candidates|browse|wiki|real|actors?|voice|cast and crew|staff|developers?|publishers?|compan(y|ies)|composer|director|writer|films?|movies?|novels?|comics?|books?|manga|anime|soundtracks?|music|albums?|songs?|episode of|television|series overview|video games?|merchandise|trailers?)/i

/**
 * Categories that say nothing about what a page *is*.
 *
 * Every large wiki carries a maintenance tree — "Articles to be expanded",
 * "Canon articles", "Wookieepedia Comprehensive articles" — on most of its
 * pages. They are noise, and worse than noise: they outnumber the descriptive
 * categories, so a classifier that reads the first match reads one of these.
 */
const MAINTENANCE =
  /^(articles?|canon|legends|pages?|wookieepedia|incomplete|conjectural|unidentified|all |. ?-class articles)/i

/** Titles that are never an entity, whatever their categories say. */
const BAD_TITLE =
  /^(list of|index of|category:|template:|file:|help:|forum:|user:|talk:|gallery|timeline|glossary|walkthrough|guide|achievements?|trophies)|\(disambiguation\)|\/(gallery|transcript|credits|quotes)$/i

/**
 * Strip the game's own name out of a category before routing on it.
 *
 * Without this, "Onimusha: Way of the Sword characters" matches the *weapons*
 * route — on the word "Sword", which is in the game's own title. Every
 * character on that wiki imported as an item, twenty of them, each page
 * individually plausible. The same trap is set in "Gears of War", "Phantom
 * Blade" and "Silent Hill".
 */
const withoutGameName = (name) => {
  let cleaned = name
  for (const phrase of [game.article, game.match]) {
    if (!phrase) continue
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), ' ')
  }
  return cleaned.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Titles that are never a wiki entity however they are categorised.
 *
 * A bare year is the one that keeps getting through: Wookieepedia has an
 * article per year, they link to everything, and "2026" classified as a
 * region because its categories mention worlds. A page whose whole title is a
 * number is a timeline entry, not a place.
 */
const NOT_A_SUBJECT = /^(\d+(\s?[-–]\s?\d+)?(\s?(BBY|ABY|AD|BC))?|[IVXLC]+)$/i

const classify = (title, categories) => {
  if (NOT_A_SUBJECT.test(title.trim())) return null
  if (BAD_TITLE.test(title)) return null

  const usable = categories
    .map(withoutGameName)
    .filter(Boolean)
    .filter((name) => !MAINTENANCE.test(name))
    .filter((name) => !NOT_AN_ENTITY.test(name))

  // Nothing descriptive left means the page's categories were all maintenance
  // banners, which is a page we cannot honestly say anything about.
  if (usable.length === 0) return null

  /*
    Score every route across every category and take the highest, rather than
    returning the first route that matches anything.

    First-match reads whichever category happens to be alphabetically first and
    is wrong constantly on a franchise wiki, where proper nouns leak across
    types: "Locust War veterans" made a human soldier an enemy, and "Weapons of
    the Locust Horde" made a shotgun one. Counting fixes both without a special
    case — the shotgun sits in six weapon categories and one Locust one, and
    the soldier in two character categories and one war-veteran one.

    Ties fall to the earlier route, which is why the order still reads
    most-specific first.
  */
  let best = null
  let bestScore = 0

  for (const route of ROUTES) {
    const score = usable.filter((name) => route.test.test(name)).length
    if (score > bestScore) {
      best = route.collection
      bestScore = score
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// Wikitext
// ---------------------------------------------------------------------------

const cleanValue = (value) =>
  String(value ?? '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
    .replace(/\[https?:\/\/\S+\]/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/^\*\s*/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s{2,}/g, ' ')
    .trim()

const NOT_AN_INFOBOX =
  /^(games?|tabs?|quote|stub|cleanup|gearsify|spoilers?|about|main|for|see ?also|reflist|nav|navbox|expand|disambig|redirect|update|citation|cite|ref|delete|merge|move|notice|era|eras|title|top|toc|scroll|clear|br)/i

const topLevelTemplates = (wikitext) => {
  const templates = []
  let depth = 0
  let start = -1
  for (let index = 0; index < wikitext.length - 1; index += 1) {
    if (wikitext.startsWith('{{', index)) {
      if (depth === 0) start = index
      depth += 1
      index += 1
    } else if (wikitext.startsWith('}}', index)) {
      depth -= 1
      index += 1
      if (depth === 0 && start !== -1) {
        templates.push(wikitext.slice(start + 2, index - 1))
        start = -1
      }
      if (depth < 0) depth = 0
    }
  }
  return templates
}

const topLevelParts = (body) => {
  const parts = []
  let buffer = ''
  let nesting = 0
  for (let index = 0; index < body.length; index += 1) {
    if (body.startsWith('{{', index) || body.startsWith('[[', index)) nesting += 1
    if (body.startsWith('}}', index) || body.startsWith(']]', index)) nesting -= 1
    const character = body[index]
    if (character === '|' && nesting <= 0) {
      parts.push(buffer)
      buffer = ''
    } else buffer += character
  }
  parts.push(buffer)
  return parts
}

const paramsOf = (body) => {
  const facts = {}
  for (const part of topLevelParts(body).slice(1)) {
    const split = part.indexOf('=')
    if (split === -1) continue
    const key = part.slice(0, split).trim()
    const value = cleanValue(part.slice(split + 1))
    if (!key || !value || key.length > 40) continue
    if (/^(image\d*|images|imagewidth|imagecaption|caption|box|title|name|pagename|bg|colou?r)$/i.test(key)) continue
    facts[key] = value.slice(0, 220)
  }
  return facts
}

const parseInfobox = (wikitext) => {
  let best = {}
  for (const body of topLevelTemplates(wikitext)) {
    const head = body.split('|')[0].trim()
    if (NOT_AN_INFOBOX.test(head)) continue
    const facts = paramsOf(body)
    if (Object.keys(facts).length > Object.keys(best).length) best = facts
  }
  return Object.keys(best).length >= 2 ? best : {}
}

// ---------------------------------------------------------------------------
// Gather
// ---------------------------------------------------------------------------

console.log(`\n${slug}  (${game.host})\n`)

const candidates = new Set()

// 1. Categories naming the game.
const allCats = await paged(
  { action: 'query', list: 'allcategories', aclimit: '500' },
  'allcategories',
  'accontinue',
  (entry) => entry['*'],
  40,
)
const gameCats = allCats.filter((name) =>
  name.toLowerCase().includes(game.match.toLowerCase()),
)
for (const category of gameCats) {
  const members = await paged(
    { action: 'query', list: 'categorymembers', cmtitle: `Category:${category}`, cmlimit: '500', cmnamespace: '0' },
    'categorymembers',
    'cmcontinue',
    (entry) => entry.title,
  )
  for (const title of members) candidates.add(title)
  await sleep(250)
}
console.log(`  ${gameCats.length} categories naming the game -> ${candidates.size} pages`)

// 2 and 3. Links, where this wiki is one where a link implies relevance.
const linkTitles = { back: [], out: [] }
if (game.linkHarvest) {
// 2. Pages linking to the game's article.
const backlinks = await paged(
  { action: 'query', list: 'backlinks', bltitle: game.article, blnamespace: '0', bllimit: '500' },
  'backlinks',
  'blcontinue',
  (entry) => entry.title,
)
linkTitles.back = backlinks
console.log(`  ${backlinks.length} pages link to it`)

// 3. Pages the game's article links to.
const outlinksData = await api({
  action: 'query',
  prop: 'links',
  titles: game.article,
  plnamespace: '0',
  pllimit: '500',
})
const outPage = Object.values(outlinksData.query?.pages ?? {})[0]
const outlinks = (outPage?.links ?? []).map((link) => link.title)
linkTitles.out = outlinks
console.log(`  ${outlinks.length} pages it links to`)
  if (game.linkHarvest === 'intersect') {
    // Mutual links only.
    const back = new Set(linkTitles.back)
    const both = linkTitles.out.filter((title) => back.has(title))
    for (const title of both) candidates.add(title)
    console.log(`  ${both.length} link both ways — the only ones taken on a wiki this size`)
  } else {
    for (const title of [...linkTitles.back, ...linkTitles.out]) candidates.add(title)
  }
} else {
  console.log('  links not followed')
}

candidates.delete(game.article)
console.log(`  ${candidates.size} candidates before filtering\n`)

// ---------------------------------------------------------------------------
// Detail and classify
// ---------------------------------------------------------------------------

const titles = [...candidates]
const entities = []
let rejected = 0

for (let index = 0; index < titles.length; index += 20) {
  const batch = titles.slice(index, index + 20)

  let data
  try {
    data = await api({
      action: 'query',
      prop: 'revisions|categories|pageimages',
      rvprop: 'content',
      rvslots: 'main',
      cllimit: 'max',
      clshow: '!hidden',
      piprop: 'original',
      titles: batch.join('|'),
    })
  } catch (error) {
    console.log(`  batch failed: ${error.message}`)
    continue
  }

  for (const page of Object.values(data.query?.pages ?? {})) {
    if (page.missing !== undefined) continue

    const categories = (page.categories ?? []).map((entry) =>
      entry.title.replace(/^Category:/, ''),
    )
    const collection = classify(page.title, categories)
    if (!collection) {
      rejected += 1
      continue
    }

    const wikitext = page.revisions?.[0]?.slots?.main?.['*'] ?? ''

    entities.push({
      title: page.title.replace(/\s*\([^)]*\)\s*$/, '').trim(),
      wikiTitle: page.title,
      collection,
      facts: parseInfobox(wikitext),
      categories: categories.slice(0, 14),
      image: page.original?.source ?? null,
      url: `https://${game.host}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    })
  }

  process.stdout.write(
    `\r  classified ${entities.length} of ${Math.min(index + 20, titles.length)}/${titles.length}   `,
  )
  await sleep(400)
}

console.log('')

const byCollection = {}
for (const entity of entities) {
  byCollection[entity.collection] = (byCollection[entity.collection] ?? 0) + 1
}

const OUT_DIR = path.resolve('src/seed/raw/wiki-entities')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(
  path.join(OUT_DIR, `${slug}.json`),
  `${JSON.stringify(
    { slug, host: game.host, fetchedAt: new Date().toISOString().slice(0, 10), entities },
    null,
    2,
  )}\n`,
)

const withFacts = entities.filter((entity) => Object.keys(entity.facts).length > 0).length
const withImage = entities.filter((entity) => entity.image).length

console.log(`\n  kept ${entities.length}, dropped ${rejected} that are not entities`)
console.log(`  ${withFacts} with an infobox, ${withImage} with a lead image`)
console.log(
  `  ${Object.entries(byCollection)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${value} ${key}`)
    .join(', ')}`,
)

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

if (WANT_IMAGES) {
  const dir = path.resolve('assets/_wiki', slug)
  fs.mkdirSync(dir, { recursive: true })

  let saved = 0
  let skipped = 0

  for (const entity of entities) {
    if (!entity.image) continue

    // Fandom serves scaled variants behind /revision/latest; ask for a width
    // that is enough for a card without pulling a 4K original.
    const source = `${entity.image.split('/revision/')[0]}`
    const extension = (source.match(/\.(png|jpe?g|gif|webp)$/i) ?? ['.png'])[0].toLowerCase()
    const file = path.join(dir, `${entity.wikiTitle.replace(/[^\w.-]+/g, '-').slice(0, 80)}${extension}`)

    entity.imageFile = path.relative(path.resolve('.'), file).replace(/\\/g, '/')

    if (fs.existsSync(file)) {
      skipped += 1
      continue
    }

    try {
      const response = await fetch(source, { headers: { 'User-Agent': UA } })
      if (!response.ok) continue
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length < 900) continue
      fs.writeFileSync(file, buffer)
      saved += 1
    } catch {
      // A missing image is not a reason to lose the record.
    }
    await sleep(200)
    process.stdout.write(`\r  images: ${saved} new, ${skipped} already here   `)
  }

  // Rewrite with the local paths recorded.
  fs.writeFileSync(
    path.join(OUT_DIR, `${slug}.json`),
    `${JSON.stringify(
      { slug, host: game.host, fetchedAt: new Date().toISOString().slice(0, 10), entities },
      null,
      2,
    )}\n`,
  )

  console.log(`\n  images: ${saved} downloaded, ${skipped} already present`)
}

console.log(`\nWritten to src/seed/raw/wiki-entities/${slug}.json`)
