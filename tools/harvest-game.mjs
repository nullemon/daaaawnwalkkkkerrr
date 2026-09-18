/**
 * Everything one game's community wiki can legitimately give, in one pass.
 *
 *   node tools/harvest-game.mjs onimusha-way-of-the-sword
 *   node tools/harvest-game.mjs onimusha-way-of-the-sword --images
 *   node tools/harvest-game.mjs star-wars-zero-company --resume
 *
 * `--resume` picks up a run that a rate limit killed, from the checkpoint under
 * `assets/_wiki/_checkpoints/`. `--force` overrides the shrink guard, which
 * refuses to write a harvest more than a tenth smaller than the one on disk.
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
 *
 * ## Every failure here is a quiet one
 *
 * Nothing in this file throws when a wiki gives less than it has. An unfollowed
 * continuation token, a request cap, a 429, a renamed article — each returns a
 * short list that classifies cleanly and writes a file that looks right. The
 * Star Wars harvest sat at 89 records for weeks, every collection an
 * alphabetical slice ending at C, because `prop=links` caps at 500 and nobody
 * read `continue.plcontinue`. So: every sweep says how much it got, every cap
 * that is reached is announced, and a harvest materially smaller than the one
 * already on disk is refused rather than written. Counting rows is not
 * checking that you asked for all of them.
 */
import fs from 'fs'
import path from 'path'

import { harvestText } from '../src/lib/text-encoding-table.mjs'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const WANT_IMAGES = process.argv.includes('--images')
/** Pick up where a rate-limited run stopped rather than re-classifying from zero. */
const WANT_RESUME = process.argv.includes('--resume')
/** Write a harvest the shrink guard refused. Only correct when the wiki really did shrink. */
const FORCE = process.argv.includes('--force')
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
  console.error('Usage: node tools/harvest-game.mjs <game-slug> [--images] [--resume] [--force]')
  console.error(`Known: ${Object.keys(GAMES).join(', ')}`)
  process.exit(1)
}

const game = GAMES[slug]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Set once Fandom starts rate limiting us. Nothing after it is a full answer,
 * so the write guard says so instead of letting a short harvest look like a
 * shrinking wiki. Same reasoning as the `blocked` flag in
 * `tools/fetch-search-queries.mjs`.
 */
let rateLimited = false

/*
  Paced, and patient about a 429.

  A 429 or a 503 is "come back later", not "there is nothing here", and the
  only difference between the two at the call site is whether somebody wrote
  the branch. The version before this one caught every error the same way and
  gave up after two 1.5s retries, so a rate limit in the middle of the detail
  pass showed up as `batch failed` on stderr and a harvest missing twenty
  pages — with the file written anyway. See `tools/fetch-posters.mjs`.
*/
const api = async (params, attempt = 0) => {
  const query = new URLSearchParams({ format: 'json', ...params })
  try {
    const response = await fetch(`https://${game.host}/api.php?${query}`, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    })
    if (response.status === 429 || response.status === 503) {
      rateLimited = true
      if (attempt >= 4) throw new Error(`rate limited by ${game.host} after ${attempt} retries`)
      const wait = 2000 * 2 ** attempt
      console.log(`    rate limited (HTTP ${response.status}), waiting ${wait / 1000}s`)
      await sleep(wait)
      return api(params, attempt + 1)
    }
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

/**
 * Page a list endpoint until it stops continuing.
 *
 * `cap` is a runaway stop, not an expected end. If it is ever reached the
 * result is a prefix of the truth in the API's own sort order — alphabetical
 * for every list here — which is the failure this whole file now guards
 * against: a plausible file that stops mid-alphabet with no error. So a run
 * that hits the cap says so, loudly, and records it.
 */
let truncated = []

const paged = async (params, listKey, contKey, pluck, cap = 20, label = listKey) => {
  const out = []
  let cont
  let requests = 0
  for (let page = 0; page < cap; page += 1) {
    const data = await api({ ...params, ...(cont ? { [contKey]: cont } : {}) })
    requests += 1
    for (const entry of data.query?.[listKey] ?? []) out.push(pluck(entry))
    cont = data.continue?.[contKey]
    if (!cont) return out
    await sleep(300)
  }
  truncated.push(label)
  console.log(
    `  !! ${label}: stopped at the ${cap}-request cap with ${out.length} results and more to come.`,
  )
  console.log(`     This is an alphabetical prefix, not the whole list.`)
  return out
}

/**
 * Page a `prop=` query on a single page — `prop=links` and friends.
 *
 * ## The bug this function exists to kill
 *
 * The outlink query used to be one bare `api()` call with `pllimit: 500` and
 * no continuation at all. `prop=links` caps at 500 and returns in alphabetical
 * order, so on Wookieepedia — where the Zero Company article links to 2,705
 * pages — the harvest saw A through "Chommell sector" and stopped. That wiki
 * is the one configured `linkHarvest: 'intersect'`, which makes outlinks its
 * *only* real candidate source, so every collection in
 * `star-wars-zero-company.json` was an alphabetical slice ending at C: no
 * Tatooine, no Coruscant, no Dantooine, while twenty-odd character infoboxes
 * pointed at them. Nothing errored and the file looked fine.
 *
 * `data.continue.plcontinue` was there the whole time. Follow it.
 */
const pagedProp = async (params, propKey, contKey, pluck, cap = 20, label = propKey) => {
  const out = []
  let cont
  for (let page = 0; page < cap; page += 1) {
    const data = await api({ ...params, ...(cont ? { [contKey]: cont } : {}) })
    const target = Object.values(data.query?.pages ?? {})[0]
    if (target?.missing !== undefined) return out
    for (const entry of target?.[propKey] ?? []) out.push(pluck(entry))
    cont = data.continue?.[contKey]
    if (!cont) return out
    await sleep(300)
  }
  truncated.push(label)
  console.log(`  !! ${label}: stopped at the ${cap}-request cap with ${out.length} results.`)
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
  new RegExp(
    String.raw`\b(disambiguation|lists?|index|templates?|images?|gallery|files?|categor(y|ies)|needing|candidates|browse|wiki|real[- ]world|actors?|voice|cast and crew|staff|developers?|publishers?|(computer|video ?game|real[- ]world) compan(y|ies)|composer|director|writer|films?|movies?|novels?|comics?|books?|manga|anime|soundtracks?|music|albums?|songs?|episode of|television|series overview|video games?|merchandise|trailers?)\b`,
    'i',
  )

/**
 * Categories that say nothing about what a page *is*.
 *
 * Every large wiki carries a maintenance tree — "Articles to be expanded",
 * "Canon articles", "Wookieepedia Comprehensive articles" — on most of its
 * pages. They are noise, and worse than noise: they outnumber the descriptive
 * categories, so a classifier that reads the first match reads one of these.
 */
const MAINTENANCE =
  new RegExp(
    String.raw`^(articles?\b|canon\b|legends\b|pages?\b|wookieepedia|incomplete|conjectural|unidentified|all |. ?-class articles)|\bstubs?$`,
    'i',
  )

/** Titles that are never an entity, whatever their categories say. */
const BAD_TITLE =
  new RegExp(
    String.raw`^(list of|index of|category:|template:|file:|help:|forum:|user:|talk:|gallery|timeline|glossary|walkthrough|guide|achievements?|trophies)\b|\(disambiguation\)|\/(gallery|transcript|credits|quotes)$`,
    'i',
  )

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

/*
  The parentheticals the importer throws away, mirrored from
  `WORK_DISAMBIGUATOR` in `src/lib/harvest.ts`. Kept in step by hand because
  this file is plain ESM and that one is TypeScript; a test would be better and
  there is nowhere for it to live yet.
*/
const NOT_KEPT =
  /\((film|movie|tv series|television series|series|franchise|novel|book|comic|manga|soundtrack|album|song|pachislot|video game|upcoming video game|\d{4} video game)\)\s*$/i

const bareTitle = (pageTitle) => pageTitle.replace(/\s*\([^)]*\)\s*$/, '').trim()

/**
 * Give a title its qualifier back where two kept articles are different things
 * that would share one.
 *
 * Runs once over the finished harvest, because the decision needs every
 * surviving entity and the fetch loop only ever sees one batch. Only the
 * *kept* articles count: a name shared with something `isNotAnEntity` refuses
 * is not a clash, and qualifying a title against a record that will never
 * exist reads as pedantry to the one person who notices.
 *
 * And a qualifier naming *this game* is not a disambiguator between subjects —
 * it is the franchise wiki carrying a game-specific article beside its general
 * one. `Kyoto (Onimusha: Way of the Sword)` and `Kyoto` are one place, and the
 * importer already keeps the game-specific one and drops the other. Requalify
 * those and the dedupe stops matching them, leaving two pages about one place
 * where there had been a rule to prevent exactly that.
 */
const disambiguate = (entities) => {
  /*
    A qualifier naming this game is not a disambiguator between subjects, so
    the escape here is for the game's own title, which contains a colon and
    may contain anything else a wiki chose to call it.
  */
  const escape = (phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ownName = new RegExp(
    '\\((' + [game.article, game.match].filter(Boolean).map(escape).join('|') + ')\\)\\s*$',
    'i',
  )
  const bare = new Map()
  for (const entity of entities) {
    if (NOT_KEPT.test(entity.wikiTitle ?? '')) continue
    const list = bare.get(entity.title) ?? []
    list.push(entity)
    bare.set(entity.title, list)
  }
  let requalified = 0
  for (const [, list] of bare) {
    if (list.length < 2) continue
    if (list.some((entity) => ownName.test(entity.wikiTitle ?? ''))) continue
    for (const entity of list) {
      const full = (entity.wikiTitle ?? '').trim()
      if (!full || full === entity.title) continue
      entity.title = full
      requalified += 1
    }
  }
  return requalified
}

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

/**
 * Strip wiki markup from a single infobox value.
 *
 * ## The last line is the one that was missing
 *
 * Everything here strips *wikitext*. An infobox value also carries HTML
 * entities and invisible characters, and this file decoded neither — which
 * matters more here than anywhere, because this is the harvester `pnpm refresh`
 * actually runs: `harvest:all` spawns one of these per wiki. A `&ndash;`
 * reaches a reader as its own eight characters, because React escapes what it
 * renders, and a zero-width joiner is invisible on the page and fatal to every
 * match, sort and slug. Nothing errors and the record imports.
 *
 * `harvestText` is the whole repair, from the one table in
 * `src/lib/text-encoding-table.mjs` — shared rather than copied, because a
 * second copy of a repair table drifts and a drifted one writes faults in
 * rather than out.
 */
const cleanValue = (value) =>
  harvestText(
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
      /*
        Leading bullets, allowing for the whitespace that follows `=` in
        wikitext. Anchoring on `^\*` alone missed every value written as
        `| magazine = *8 Shells`, because the line starts with a space — which
        left a stray asterisk visible on the rendered page.
      */
      .replace(/^[ \t]*\*+[ \t]*/gm, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(', ')
      .replace(/\s{2,}/g, ' ')
      .trim(),
  )

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
/*
  Enumerating every category on the wiki is exhaustive on the six single-series
  wikis — the largest has 925 — and hopeless on Wookieepedia, which has tens of
  thousands and would cost hundreds of requests to sweep for a category tree
  that does not exist yet (nothing there names Zero Company at all, checked).
  The cap stays where it is; what changed is that reaching it now says so,
  instead of quietly handing back the categories that start with A.
*/
const allCats = await paged(
  { action: 'query', list: 'allcategories', aclimit: '500' },
  'allcategories',
  'accontinue',
  (entry) => entry['*'],
  40,
  'category list',
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
    20,
    `members of ${category}`,
  )
  for (const title of members) candidates.add(title)
  await sleep(250)
}
console.log(
  `  ${allCats.length} categories on the wiki, ${gameCats.length} naming the game -> ${candidates.size} pages`,
)

// 2 and 3. Links, where this wiki is one where a link implies relevance.
const linkTitles = { back: [], out: [] }
if (game.linkHarvest) {
// 2. Pages linking to the game's article.
const backlinks = await paged(
  { action: 'query', list: 'backlinks', bltitle: game.article, blnamespace: '0', bllimit: '500' },
  'backlinks',
  'blcontinue',
  (entry) => entry.title,
  20,
  'backlinks',
)
linkTitles.back = backlinks
console.log(`  ${backlinks.length} pages link to it`)

// 3. Pages the game's article links to. Paged — see `pagedProp`.
const outlinks = await pagedProp(
  { action: 'query', prop: 'links', titles: game.article, plnamespace: '0', pllimit: '500' },
  'links',
  'plcontinue',
  (link) => link.title,
  20,
  'outlinks',
)
linkTitles.out = outlinks
console.log(`  ${outlinks.length} pages it links to`)
if (outlinks.length === 0) {
  // An article title that does not exist returns no links and no error, which
  // reads as "this wiki has no coverage". It is the mistake the Wookieepedia
  // `article` comment above records; say it out loud rather than harvest zero.
  console.log(`  !! no outlinks at all — is "${game.article}" the exact title on this wiki?`)
}
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

/*
  Checkpoint the detail pass.

  Classifying a wiki this size is forty to a hundred requests, and the version
  before this one held all of it in memory: a 429 on the last batch threw away
  every batch before it. The checkpoint lives under `assets/`, which is
  gitignored and is already where `--images` writes, so it is scratch and never
  reaches `src/seed/raw/` — a stray file there would be read as an eighth game
  by `src/seed/wiki-entities.ts`, which globs that directory for `*.json`.

  Resuming is opt-in (`--resume`). A checkpoint written before a ROUTES change
  holds the old classification, and silently reusing it would be exactly the
  quiet wrong answer this file keeps being bitten by.
*/
const CHECKPOINT = path.resolve('assets/_wiki/_checkpoints', `${slug}.json`)
let done = new Set()

if (WANT_RESUME && fs.existsSync(CHECKPOINT)) {
  const saved = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'))
  entities.push(...saved.entities)
  rejected = saved.rejected ?? 0
  done = new Set(saved.done ?? [])
  console.log(`  resuming: ${done.size} pages already classified, ${entities.length} kept\n`)
}

const saveCheckpoint = () => {
  fs.mkdirSync(path.dirname(CHECKPOINT), { recursive: true })
  fs.writeFileSync(CHECKPOINT, `${JSON.stringify({ slug, rejected, done: [...done], entities })}\n`)
}

const pending = titles.filter((title) => !done.has(title))

for (let index = 0; index < pending.length; index += 20) {
  const batch = pending.slice(index, index + 20)

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
    done.add(page.title)
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
      /*
        The parenthetical comes off, except where it is the only thing telling
        two subjects apart.

        A wiki disambiguates an article title when the bare name is taken, and
        the bare name is what a reader calls the thing — "Kyoto", not "Kyoto
        (Onimusha: Way of the Sword)". Stripping it is right almost always.

        It is wrong when both articles survive the import. Wookieepedia has
        `Naboo` the planet and `Naboo (people)` the species; both are real,
        both are kept, and both arrived titled "Naboo" — two records about
        different things, indistinguishable on the page and to anything
        matching on a name. The four other clashes in this corpus are all
        `(film)`, `(franchise)`, `(pachislot)` and the like, which
        `isNotAnEntity` rejects, so nothing downstream ever saw this one shape
        that gets through.
      */
      title: bareTitle(page.title),
      wikiTitle: page.title,
      collection,
      facts: parseInfobox(wikitext),
      categories: categories.slice(0, 14),
      image: page.original?.source ?? null,
      url: `https://${game.host}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    })
  }

  process.stdout.write(
    `\r  classified ${entities.length} of ${Math.min(index + 20, pending.length)}/${pending.length}   `,
  )
  // Every tenth batch, so a rate limit costs the run and not the work.
  if (index % 200 === 0) saveCheckpoint()
  await sleep(400)
}

saveCheckpoint()

console.log('')

const tally = (list) => {
  const counts = {}
  for (const entity of list) counts[entity.collection] = (counts[entity.collection] ?? 0) + 1
  return counts
}

const byCollection = tally(entities)

const OUT_DIR = path.resolve('src/seed/raw/wiki-entities')
const outFile = path.join(OUT_DIR, `${slug}.json`)
fs.mkdirSync(OUT_DIR, { recursive: true })

const before = fs.existsSync(outFile)
  ? JSON.parse(fs.readFileSync(outFile, 'utf8')).entities ?? []
  : []

const writeHarvest = () => {
  fs.writeFileSync(
    outFile,
    `${JSON.stringify(
      { slug, host: game.host, fetchedAt: new Date().toISOString().slice(0, 10), entities },
      null,
      2,
    )}\n`,
  )
}

const withFacts = entities.filter((entity) => Object.keys(entity.facts).length > 0).length
const withImage = entities.filter((entity) => entity.image).length

console.log(`\n  kept ${entities.length}, dropped ${rejected} that are not entities`)
console.log(`  ${withFacts} with an infobox, ${withImage} with a lead image`)

// Per collection, against what is already on disk. A collection that moves
// from one bucket to another is a reclassification and fine; one that empties
// is the thing somebody needs to look at.
const beforeCounts = tally(before)
for (const key of [...new Set([...Object.keys(beforeCounts), ...Object.keys(byCollection)])].sort()) {
  const was = beforeCounts[key] ?? 0
  const now = byCollection[key] ?? 0
  const delta = now - was
  const mark = was > 0 && now < was / 2 ? ' !!' : ''
  console.log(
    `  ${String(now).padStart(5)}  ${key.padEnd(12)} was ${String(was).padStart(4)}  ${delta >= 0 ? '+' : ''}${delta}${mark}`,
  )
}

/*
  Never replace a harvest with a smaller one.

  This is the guard from `tools/fetch-search-queries.mjs`, and it is here for
  the same reason: every way this harvester fails, it fails by returning
  *fewer* pages and no error. A rate limit part-way through the detail pass, a
  renamed article that makes every link query answer nothing, a paging cap
  reached silently — all three write a valid, plausible, permanent file, and
  everything downstream just generates fewer pages with nothing in any log.

  Ninety per cent is the floor. A wiki gains pages between harvests and loses
  the odd one to a merge; a real re-harvest never loses a tenth of its records.

  `--force` exists for the one case where it should be overridden — a wiki that
  genuinely deleted its coverage — and the count is printed so that decision is
  made against a number.
*/
if (before.length > 0 && entities.length < before.length * 0.9 && !FORCE) {
  console.log(`\n  !! KEPT the existing file: this run found ${entities.length}, it already had ${before.length}.`)
  if (rateLimited) console.log('     This run was rate limited (HTTP 429/503) part-way through.')
  if (truncated.length) console.log(`     These sweeps hit their request cap: ${truncated.join(', ')}.`)
  console.log('     Nothing was written. Re-run with --resume, or --force if the wiki really did shrink.')
  process.exit(1)
}

writeHarvest()
// The work is on disk now, so the checkpoint is no longer the only copy.
fs.rmSync(CHECKPOINT, { force: true })

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
  writeHarvest()

  console.log(`\n  images: ${saved} downloaded, ${skipped} already present`)
}

console.log(`\nWritten to src/seed/raw/wiki-entities/${slug}.json`)
