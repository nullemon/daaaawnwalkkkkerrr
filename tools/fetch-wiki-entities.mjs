/**
 * Harvests real entities — characters, weapons, bosses, locations, chapters —
 * from each game's community wiki.
 *
 *   node tools/fetch-wiki-entities.mjs [game-slug]
 *
 * ## What is taken, and what is deliberately not
 *
 * Taken: the page title, the structured `{{Infobox}}` parameters, the
 * categories, and the URL. Those are facts, and facts are free to compile.
 *
 * Not taken: a single sentence of the wiki's prose. `src/seed/wiki-entities.ts`
 * composes a summary from the infobox values using our own sentence templates,
 * the same way `lib/seo.ts` already composes four hundred meta descriptions
 * from Dawnwalker's own fields. That is the difference between a database and
 * a copy, and it is the rule this whole project is built on.
 *
 * ## Why game-specific categories only
 *
 * `onimusha.fandom.com` covers eight games across twenty-five years. Taking
 * its Characters category would fill a Way of the Sword wiki with characters
 * from Onimusha 2 — real, sourced, and about a different game. Every page
 * would look correct individually, which is what makes it the worst kind of
 * error. So each game names the categories that are about it, and
 * `tools/discover-wiki-categories.mjs` is how they were found.
 *
 * The second harvest is disambiguated titles — pages called "Kyoto (Onimusha:
 * Way of the Sword)". Those are game-specific by construction, and they catch
 * what the categories miss on a wiki that has not finished categorising.
 *
 * Writes `src/seed/raw/wiki-entities/<slug>.json`.
 */
import fs from 'fs'
import path from 'path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/**
 * Where each game's entities live.
 *
 * `categories` maps a category on that wiki to one of our collections;
 * `titleTag` is the parenthesised disambiguator those wikis use, harvested as
 * a second pass.
 *
 * Dawnwalker is absent on purpose: it has 422 records already, researched and
 * cited, and re-importing them from a community wiki would duplicate every one
 * of them against a weaker source.
 */
const GAMES = {
  'onimusha-way-of-the-sword': {
    host: 'onimusha.fandom.com',
    titleTag: 'Onimusha: Way of the Sword',
    categories: {
      'Onimusha: Way of the Sword Genma': 'enemies',
      'Onimusha: Way of the Sword characters': 'characters',
      'Onimusha: Way of the Sword weapons': 'items',
      'Onimusha: Way of The Sword weapons': 'items',
    },
  },
  'control-resonant': {
    host: 'control.fandom.com',
    titleTag: 'Control Resonant',
    categories: { 'Control Resonant characters': 'characters' },
  },
  'resonance-a-plague-tale-legacy': {
    host: 'aplaguetale.fandom.com',
    titleTag: 'Resonance: A Plague Tale Legacy',
    categories: {
      'Resonance: A Plague Tale Legacy characters': 'characters',
      'Resonance: A Plague Tale Legacy chapters': 'quests',
      'Resonance: A Plague Tale Legacy collectibles': 'items',
      'Resonance: A Plague Tale Legacy locations': 'regions',
    },
  },
  'gears-of-war-e-day': {
    host: 'gearsofwar.fandom.com',
    titleTag: 'Gears of War: E-Day',
    categories: { 'Gears of War: E-Day weapons': 'items' },
  },
  'star-wars-zero-company': {
    host: 'starwars.fandom.com',
    titleTag: 'Star Wars: Zero Company',
    categories: {},
  },
  'phantom-blade-zero': {
    host: 'phantomblade.fandom.com',
    /*
      This wiki covers Phantom Blade: Executioners and three Rainblood games
      as well. Only the categories naming Zero are safe; the undifferentiated
      "Characters" and "Bosses" categories mix all five.
    */
    titleTag: 'Phantom Blade Zero',
    categories: {
      // Bosses first. A boss is also a character on most wikis, and the first
      // category to claim a page wins — the bestiary is the more useful home.
      'Bosses in Phantom Blade Zero': 'enemies',
      'Characters in Phantom Blade Zero': 'characters',
      'Gameplay in Phantom Blade Zero': 'mechanics',
    },
  },
  'silent-hill-townfall': {
    host: 'silenthill.fandom.com',
    titleTag: 'Silent Hill: Townfall',
    categories: {
      'Silent Hill: Townfall Characters': 'characters',
      'Silent Hill: Townfall Weapons': 'items',
    },
  },
}

const only = process.argv[2]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const api = async (host, params) => {
  const query = new URLSearchParams({ format: 'json', ...params })
  const response = await fetch(`https://${host}/api.php?${query}`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${host}`)
  return response.json()
}

/** Page titles in a category, following pagination. */
const categoryMembers = async (host, category) => {
  const titles = []
  let cont
  for (let page = 0; page < 20; page += 1) {
    const data = await api(host, {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '500',
      cmnamespace: '0',
      ...(cont ? { cmcontinue: cont } : {}),
    })
    for (const member of data.query?.categorymembers ?? []) titles.push(member.title)
    cont = data.continue?.cmcontinue
    if (!cont) break
    await sleep(350)
  }
  return titles
}

/** Pages disambiguated by this game's name — "Kyoto (Onimusha: …)". */
const disambiguatedTitles = async (host, tag) => {
  const titles = []
  let offset = 0
  for (let page = 0; page < 6; page += 1) {
    const data = await api(host, {
      action: 'query',
      list: 'search',
      srsearch: `intitle:"${tag}"`,
      srlimit: '50',
      srnamespace: '0',
      sroffset: String(offset),
    })
    const hits = data.query?.search ?? []
    for (const hit of hits) {
      // Only the parenthesised form. A title that merely mentions the game
      // ("List of Onimusha games") is not an entity in it.
      if (hit.title.includes(`(${tag})`)) titles.push(hit.title)
    }
    if (!data.continue?.sroffset) break
    offset = data.continue.sroffset
    await sleep(350)
  }
  return titles
}

/**
 * Strip wiki markup from a single infobox value.
 *
 * These are short values — "Ronin", "1583", "[[Kyoto]]" — not prose. Links
 * become their display text, templates and refs are dropped.
 */
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

/**
 * Templates that are page furniture rather than an infobox.
 *
 * Every wiki has a handful of these at the top of an article — which games a
 * subject appears in, a cleanup banner, a quote. They have parameters, so a
 * naive "first template with parameters" would pick one of them.
 */
const NOT_AN_INFOBOX =
  /^(games?|tabs?|quote|stub|cleanup|gearsify|spoilers?|about|main|for|see ?also|reflist|nav|navbox|expand|disambig|redirect|update|citation|cite|ref|delete|merge|move|notice|era|eras|title|top|toc)/i

/**
 * Pull `key = value` pairs out of a page's infobox.
 *
 * ## Why this does not just look for {{Infobox}}
 *
 * It did, and it returned nothing for four of the seven wikis. Fandom lets
 * each community name its own templates, so the box is `{{Infobox}}` on
 * Onimusha, `{{Weapon}}` on Gears of War and `{{Character}}` elsewhere. Twenty
 * Gears weapons imported with no stats at all and no error to show for it.
 *
 * So: read every top-level template, discard the known furniture, and take
 * whichever of the rest carries the most `key = value` pairs. An infobox is
 * the biggest parameter block on the page by a wide margin, which makes that
 * a more durable rule than any list of template names.
 */
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

/** Split a template body on the pipes that belong to it, not to a nested one. */
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
    if (!key || !value) continue
    if (key.length > 40) continue
    // Images and the title are handled elsewhere; a caption is prose.
    if (/^(image\d*|images|imagewidth|imagecaption|caption|box|title|name|pagename)$/i.test(key)) {
      continue
    }
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

const OUT_DIR = path.resolve('src/seed/raw/wiki-entities')
fs.mkdirSync(OUT_DIR, { recursive: true })

for (const [slug, config] of Object.entries(GAMES)) {
  if (only && only !== slug) continue
  process.stdout.write(`\n${slug}  (${config.host})\n`)

  /** title -> collection. A page in two categories keeps the first. */
  const wanted = new Map()

  for (const [category, collection] of Object.entries(config.categories)) {
    try {
      const titles = await categoryMembers(config.host, category)
      for (const title of titles) if (!wanted.has(title)) wanted.set(title, collection)
      console.log(`  ${String(titles.length).padStart(3)}  ${category} -> ${collection}`)
    } catch (error) {
      console.log(`    ${category}: ${error.message}`)
    }
    await sleep(500)
  }

  if (config.titleTag) {
    try {
      const extra = await disambiguatedTitles(config.host, config.titleTag)
      let added = 0
      for (const title of extra) {
        if (wanted.has(title)) continue
        // No category said what it is, so it goes somewhere neutral. The seed
        // files these under mechanics, which is the collection for "a thing
        // about this game we cannot classify more precisely".
        wanted.set(title, 'mechanics')
        added += 1
      }
      console.log(`  ${String(added).padStart(3)}  disambiguated "(${config.titleTag})" pages`)
    } catch (error) {
      console.log(`    title search failed: ${error.message}`)
    }
    await sleep(500)
  }

  if (wanted.size === 0) {
    console.log('  nothing game-specific on this wiki yet')
    fs.writeFileSync(
      path.join(OUT_DIR, `${slug}.json`),
      `${JSON.stringify({ slug, host: config.host, fetchedAt: new Date().toISOString().slice(0, 10), entities: [] }, null, 2)}\n`,
    )
    continue
  }

  // --- Page content, fifty at a time ------------------------------------
  const titles = [...wanted.keys()]
  const entities = []

  for (let index = 0; index < titles.length; index += 40) {
    const batch = titles.slice(index, index + 40)
    let data
    try {
      data = await api(config.host, {
        action: 'query',
        prop: 'revisions|categories',
        rvprop: 'content',
        rvslots: 'main',
        cllimit: 'max',
        titles: batch.join('|'),
      })
    } catch (error) {
      console.log(`    batch failed: ${error.message}`)
      continue
    }

    for (const page of Object.values(data.query?.pages ?? {})) {
      if (page.missing !== undefined) continue
      const wikitext = page.revisions?.[0]?.slots?.main?.['*'] ?? ''
      const facts = parseInfobox(wikitext)

      entities.push({
        title: page.title.replace(/\s*\([^)]*\)\s*$/, '').trim(),
        wikiTitle: page.title,
        collection: wanted.get(page.title) ?? 'mechanics',
        facts,
        categories: (page.categories ?? []).map((category) =>
          category.title.replace(/^Category:/, ''),
        ),
        url: `https://${config.host}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      })
    }

    await sleep(600)
  }

  const byCollection = {}
  for (const entity of entities) {
    byCollection[entity.collection] = (byCollection[entity.collection] ?? 0) + 1
  }

  fs.writeFileSync(
    path.join(OUT_DIR, `${slug}.json`),
    `${JSON.stringify(
      {
        slug,
        host: config.host,
        fetchedAt: new Date().toISOString().slice(0, 10),
        entities,
      },
      null,
      2,
    )}\n`,
  )

  const withFacts = entities.filter((entity) => Object.keys(entity.facts).length > 0).length
  console.log(
    `  => ${entities.length} entities (${withFacts} with an infobox): ${Object.entries(byCollection)
      .map(([key, value]) => `${value} ${key}`)
      .join(', ')}`,
  )
  await sleep(800)
}

console.log('\nWritten to src/seed/raw/wiki-entities/')
