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

  /*
    The second wave. Each title was resolved against the Wikipedia API before
    it was written down, redirects followed, because a title that is one
    character off returns a `-1` page id and the harvest records the game as
    having no article rather than as having been asked for wrongly.

    `Deadlock (video game)` carries its disambiguator: Valve's game shares a
    name with a 1996 strategy game, a board game and an ordinary English word,
    and the bare title is a disambiguation page whose infobox belongs to
    nothing.

    These articles matter more here than they do for the first eight, and for
    a reason worth stating: `tools/fetch-people.mjs` reads *these files* for
    each game's credited staff. Two of these wikis — GTA 6 and Fire Emblem —
    have no Steam listing at all, so Wikipedia is the only structured source
    either of them has.
  */
  'resident-evil-requiem': { wikipedia: 'Resident Evil Requiem' },
  'subnautica-2': { wikipedia: 'Subnautica 2' },
  'forza-horizon-6': { wikipedia: 'Forza Horizon 6' },
  'nba-2k27': { wikipedia: 'NBA 2K27' },
  'deadlock': { wikipedia: 'Deadlock (video game)' },
  'gta-6': { wikipedia: 'Grand Theft Auto VI' },
  'fire-emblem-fortunes-weave': { wikipedia: "Fire Emblem: Fortune's Weave" },
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Thrown when Wikipedia would not answer, as opposed to answering that there
 * is no such page.
 *
 * Those two were the same value — `null` — and the loop below could not tell
 * them apart, so it reported "no article" and wrote `wikipedia: null` over a
 * file that held a complete harvest. A rate-limited run destroyed the
 * Dawnwalker and Onimusha records that way: 753 and 836 bytes of infobox facts
 * replaced by 77 and 92, with the script printing a tidy summary and exiting 0.
 * The downstream symptom was `tools/fetch-posters.mjs` saying "no Wikipedia
 * article recorded" for a game whose article it had read the week before.
 *
 * It is the failure `tools/fetch-search-queries.mjs` already guards against,
 * arriving through a second door. A refusal is a fact about the network and
 * must never be written down as a fact about the game.
 */
class Refused extends Error {
  constructor(url, why) {
    super(`Wikipedia would not answer: ${why}`)
    this.url = url
  }
}

const get = async (url, asJson = true, attempt = 0) => {
  let why
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (response.ok) return asJson ? await response.json() : await response.text()
    why = `HTTP ${response.status}`
  } catch (error) {
    why = String(error?.message ?? error)
  }

  if (attempt < 2) {
    await sleep(1500 * (attempt + 1))
    return get(url, asJson, attempt + 1)
  }

  /*
    Out of retries. Every path to here is "we did not get an answer" — a 429, a
    403, a 500, a dropped socket — and not one of them is evidence about the
    article. Throwing is what stops the caller recording it as one.
  */
  throw new Refused(url, why)
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

/** What is on disk already, so a thinner answer can be refused. */
const existing = (slug) => {
  const file = path.join(OUT_DIR, `${slug}.json`)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

let written = 0
let kept = 0
const stillMissing = []

for (const [slug, source] of Object.entries(GAMES)) {
  process.stdout.write(`\n${slug}\n`)

  const record = {
    slug,
    fetchedAt: new Date().toISOString().slice(0, 10),
    wikipedia: null,
  }

  // --- Wikipedia ---------------------------------------------------------
  let page
  try {
    const wp = await get(
      `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(source.wikipedia)}&format=json&formatversion=2`,
    )
    page = wp?.query?.pages?.[0]
  } catch (error) {
    if (!(error instanceof Refused)) throw error
    /*
      Terminal, not skippable. Wikipedia rate-limits per client, so the next
      article will be refused too, and carrying on would walk the whole list
      turning good files into empty ones — which is exactly what happened.
      Stop, keep everything already on disk, and exit non-zero so a caller in
      a chain does not treat the run as done.
    */
    console.log(`  ${error.message}`)
    console.log(
      `\nStopped at ${slug}. ${written} file${written === 1 ? '' : 's'} written, everything else left as it was.\n` +
        'Nothing was overwritten with an empty harvest. Wait for the limit to clear and run it again.',
    )
    process.exit(1)
  }

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

  /*
    The second half of the guard, for the case a refusal does not cover:
    Wikipedia answers, and answers with less than we already hold. A page that
    has been moved or blanked reads as `missing`, and an infobox somebody is
    mid-edit on reads as fewer facts. Neither is a reason to throw away a good
    harvest — this is the only copy, and there is no way back from a write.
  */
  const held = existing(slug)
  const heldFacts = Object.keys(held?.wikipedia?.facts ?? {}).length
  const freshFacts = Object.keys(record.wikipedia?.facts ?? {}).length

  if (held?.wikipedia && !record.wikipedia) {
    console.log(`  KEPT the harvest on disk — "${held.wikipedia.title}", ${heldFacts} facts. Nothing was written.`)
    kept += 1
    await sleep(1200)
    continue
  }

  if (held?.wikipedia && freshFacts < heldFacts) {
    console.log(`  KEPT the harvest on disk — ${heldFacts} facts held, ${freshFacts} offered. Nothing was written.`)
    kept += 1
    await sleep(1200)
    continue
  }

  if (!record.wikipedia) stillMissing.push(slug)

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), `${JSON.stringify(record, null, 2)}\n`)
  written += 1
  await sleep(1200)
}

console.log(`\n${written} written to src/seed/raw/reference/${kept > 0 ? `, ${kept} left as they were` : ''}`)
if (stillMissing.length > 0) {
  console.log(
    `\nNo article found for: ${stillMissing.join(', ')}\n` +
      'Check the title in GAMES above against the one Wikipedia actually uses —\n' +
      'these are the games tools/fetch-posters.mjs will report as having no cover.',
  )
}
