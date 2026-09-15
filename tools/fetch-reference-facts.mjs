/**
 * Verified production facts for each game, from Wikipedia and PCGamingWiki.
 *
 *   node tools/fetch-reference-facts.mjs
 *
 * ## Why these two, and on what terms
 *
 * Fextralife and the other Valnet wikis are off the table: their robots.txt
 * prohibits automated retrieval outright, blocks the article path, and bans
 * text and data mining regardless of who is doing it. These two do not.
 *
 *   Wikipedia       CC BY-SA 4.0. No mining or AI prohibition of any kind.
 *                   `/w/` is disallowed to crawlers, but Wikimedia publishes
 *                   and documents this API for programmatic use and asks only
 *                   for a descriptive User-Agent and a polite rate — both
 *                   below. Reuse is the point of the licence.
 *
 * PCGamingWiki was tried and dropped. Its robots.txt reads permissively —
 * `Allow: /` on articles, `Content-Signal: use=reference` — but the server
 * answers **403 to any client that identifies itself as one**. The same URL
 * returns 142 KB to a browser User-Agent and 5 KB of refusal to an honest one.
 * Getting in would mean disguising the client to defeat an access control,
 * which is not a thing to do quietly, so it is not done at all.
 *
 * Wikipedia is credited on every record that uses it, with the licence named.
 *
 * ## What it takes
 *
 * Wikipedia's game infobox carries the facts people search for and no store
 * page states: director, composer, engine, series, modes, and the release
 * date per platform. PCGamingWiki carries what a PC player asks: middleware,
 * frame-rate caps, ultrawide support, storage.
 *
 * Prose is not taken from either. The article generator composes sentences
 * from these fields, as it does everywhere else on this network.
 */
import fs from 'fs'
import path from 'path'

/**
 * A descriptive User-Agent, as Wikimedia's policy asks for.
 *
 * A generic browser string on an API client is the thing that policy exists to
 * stop: it makes the traffic unattributable and un-contactable. This says what
 * the tool is and where to complain.
 */
const UA =
  'VellumWikiNetwork/1.0 (game wiki network; non-commercial; +https://github.com/) node-fetch'

const OUT_DIR = path.resolve('src/seed/raw/reference')

const GAMES = {
  dawnwalker: { wikipedia: 'The Blood of Dawnwalker' },
  'onimusha-way-of-the-sword': { wikipedia: 'Onimusha: Way of the Sword' },
  'control-resonant': { wikipedia: 'Control Resonant' },
  'resonance-a-plague-tale-legacy': { wikipedia: 'Resonance: A Plague Tale Legacy' },
  'gears-of-war-e-day': { wikipedia: 'Gears of War: E-Day' },
  'phantom-blade-zero': { wikipedia: 'Phantom Blade Zero' },
  'silent-hill-townfall': { wikipedia: 'Silent Hill: Townfall' },
  'star-wars-zero-company': { wikipedia: 'Star Wars Zero Company' },
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const get = async (url, asJson = true, attempt = 0) => {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return asJson ? await response.json() : await response.text()
  } catch (error) {
    if (attempt < 2) {
      await sleep(1500 * (attempt + 1))
      return get(url, asJson, attempt + 1)
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// Wikitext helpers
// ---------------------------------------------------------------------------

const clean = (value) =>
  String(value ?? '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/\{\{(?:vgrelease|video game release|vgr)\|([^}]*)\}\}/gi, (_, inner) =>
      inner.split('|').filter(Boolean).join(' '),
    )
    .replace(/\{\{[Ss]tart date[^}]*\|(\d{4})\|(\d{1,2})\|(\d{1,2})[^}]*\}\}/g, '$3/$2/$1')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]*>/g, '')
    .replace(/^[\s*|]+/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim()

/** Split a template body on its own pipes, ignoring nested ones. */
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

/** The {{Infobox video game}} on a Wikipedia article, as key/value pairs. */
const gameInfobox = (wikitext) => {
  const start = wikitext.search(/\{\{\s*Infobox\s+video\s+game/i)
  if (start === -1) return {}

  let depth = 0
  let end = start
  for (let index = start; index < wikitext.length - 1; index += 1) {
    if (wikitext.startsWith('{{', index)) depth += 1
    else if (wikitext.startsWith('}}', index)) {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  if (end <= start) return {}

  const facts = {}
  for (const part of topLevelParts(wikitext.slice(start + 2, end)).slice(1)) {
    const split = part.indexOf('=')
    if (split === -1) continue
    const key = part.slice(0, split).trim().toLowerCase()
    const value = clean(part.slice(split + 1))
    if (!key || !value || value.length < 2) continue
    if (/^(image|caption|alt|collapsible|title)$/.test(key)) continue
    facts[key] = value.slice(0, 260)
  }
  return facts
}

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const [slug, source] of Object.entries(GAMES)) {
  process.stdout.write(`\n${slug}\n`)

  const record = {
    slug,
    fetchedAt: new Date().toISOString().slice(0, 10),
    wikipedia: null,
  }

  // --- Wikipedia ---------------------------------------------------------
  const wp = await get(
    `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(source.wikipedia)}&format=json&formatversion=2`,
  )
  const page = wp?.query?.pages?.[0]

  if (page && !page.missing) {
    const facts = gameInfobox(page.revisions?.[0]?.slots?.main?.content ?? '')
    record.wikipedia = {
      title: page.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      licence: 'CC BY-SA 4.0',
      facts,
    }
    console.log(`  wikipedia: ${Object.keys(facts).length} infobox facts`)
  } else {
    console.log('  wikipedia: no article')
  }
  await sleep(900)

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), `${JSON.stringify(record, null, 2)}\n`)
  await sleep(1200)
}

console.log('\nWritten to src/seed/raw/reference/')
