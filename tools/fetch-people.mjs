/**
 * The people behind the eight games: who a sourced page says made them, and
 * what the English Wikipedia says about those people.
 *
 *   node tools/fetch-people.mjs        # merges into src/seed/raw/people.json
 *   node tools/fetch-people.mjs --refresh   # ignore the cache, ask again
 *   pnpm seed:people                   # write the records
 *
 * ## Where a name is allowed to come from
 *
 * Three sources. Nothing here searches for people; it only looks up names a
 * source already printed.
 *
 *   1. `src/seed/raw/reference/*.json` — each game's own Wikipedia infobox,
 *      fields `director`, `designer`, `artist`, `writer`, `composer`,
 *      `producer`, `programmer`.
 *   2. `src/seed/raw/wiki-entities/*.json` — the performance credits on
 *      community-wiki infoboxes: `actor`, `voiced by`, `portrayed by`,
 *      `Voice Actors`, `mo-capped by` and `Face Models`, read off both
 *      characters and enemies. Six keys because seven wikis never agreed on
 *      one, and both collections because Control files a person who becomes a
 *      boss under `enemies`.
 *   3. `dawnwalker.fandom.com`, live. Dawnwalker is the one game with no file
 *      under `wiki-entities/`, because its 440 records are hand-written rather
 *      than harvested — so without this the flagship wiki is the only one of
 *      the eight with no cast at all. Its wiki went up when the game shipped
 *      and uses the same infobox shape as the other seven, so the same reader
 *      handles it. **Only person names are taken from it**: the Cast and Crew
 *      categories, plus the `actor` field on character pages so an actor can
 *      be matched to a character record that already exists. Nothing is
 *      created or edited in `characters` from here; that collection is
 *      hand-written and this has no business touching it.
 *
 * Company `keyPeople` is the fourth route `src/collections/People.ts` names. It
 * is not read here: those values live in the database rather than in raw JSON,
 * and they are prose ("Haruhiro Tsujimoto (President and COO)") rather than a
 * list, so splitting them is the same guess this file refuses to make about
 * actor strings. `basis: 'company-officer'` therefore has no records yet, and
 * that is a gap rather than a claim.
 *
 * ## The rule this file exists to enforce
 *
 * These are pages about living people, so **a wrong name is much worse than a
 * missing one** and an invented biography is worse than both. Two consequences
 * run through everything below:
 *
 *   - A fragment that cannot be split confidently is **dropped and listed**,
 *     never guessed at. The `dropped` array in the output is a reviewable
 *     list, in the same two-tier spirit as `pnpm check:kind`.
 *   - A name that resolves to no article, to a disambiguation page, or to a
 *     company/game/film is recorded as **unresolved with its reason**, keeping
 *     the credit and the source that named it. It is never dropped silently
 *     and nothing about it is filled in.
 *
 * ## Rate limits are not answers
 *
 * `tools/fetch-search-queries.mjs` learned this the expensive way: a blocked
 * endpoint answered with a page, the retry loop turned it into an empty array,
 * and a "successful" run nearly replaced days of gathered data with nothing.
 * So: a descriptive User-Agent, paced requests, exponential backoff on 429 and
 * 503, and when the backoff runs out the sweep **stops** rather than recording
 * the remaining names as "no article". The file is written after every lookup
 * and every article already on disk is carried forward, so a rate limit costs
 * the run and not the work.
 *
 * ## The known cost, written down rather than fixed
 *
 * Only *articles* are cached. A name that resolved to nothing is looked up
 * again on every run, which is most of the cost of a sweep — 128 candidates,
 * 86 of them unresolved, two requests each. It is deliberate: an article
 * written next month should reach the record, and this is the only thing that
 * makes that happen.
 *
 * Caching the negatives would need `fetch:people` adding to `pnpm refresh`,
 * or the network re-reads everything weekly and these stay stale forever. That
 * is a change to `package.json`'s refresh chain, which is not this file's to
 * make, so the cost stays and this paragraph says why.
 */
import fs from 'fs'
import path from 'path'

import { harvestText } from '../src/lib/text-encoding-table.mjs'

const REFERENCE = path.resolve('src/seed/raw/reference')
const ENTITIES = path.resolve('src/seed/raw/wiki-entities')
const OUT = path.resolve('src/seed/raw/people.json')
const API = 'https://en.wikipedia.org/w/api.php'

/*
  Wikimedia's policy asks for a User-Agent that says what the tool is and how
  to reach whoever runs it. A browser string on an API client is precisely what
  that policy exists to stop.
*/
const UA = 'VellumWikiNetwork/1.0 (game wiki network; non-commercial) fetch-people'

const REFRESH = process.argv.includes('--refresh')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Thrown when Wikipedia is still saying "later" after the last backoff. */
class RateLimited extends Error {}

/*
  The pace, which only ever slows down.

  A fixed delay plus per-request backoff was not enough: the first run got
  through a dozen names, hit 429 on the thirteenth, backed off to sixteen
  seconds, succeeded, and then hit 429 again two names later — because the
  backoff forgets. A 429 is Wikipedia saying the *rate* is wrong, not that this
  one request was unlucky, so the answer is to slow the whole sweep down and
  keep it slow.
*/
let pace = 900
const slowDown = () => {
  pace = Math.min(pace * 2, 15000)
  console.log(`    rate limited — pacing every request at ${pace / 1000}s from here`)
}

const api = async (params, attempt = 0) => {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  let response
  try {
    response = await fetch(url, { headers: { 'User-Agent': UA } })
  } catch (error) {
    /* A dropped connection is also "come back later", not "no such person". */
    if (attempt >= 3) throw new RateLimited(`network failure: ${error.message}`)
    await sleep(2000 * 2 ** attempt)
    return api(params, attempt + 1)
  }
  if (response.status === 429 || response.status === 503) {
    if (attempt >= 6) throw new RateLimited(`HTTP ${response.status} after ${attempt} retries`)
    if (attempt === 0) slowDown()
    const wait = Number(response.headers.get('retry-after')) * 1000 || 3000 * 2 ** attempt
    console.log(`    ${response.status}, waiting ${Math.round(wait / 1000)}s`)
    await sleep(wait)
    return api(params, attempt + 1)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  await sleep(pace)
  return response.json()
}

// ---------------------------------------------------------------------------
// Splitting names out of infobox values
// ---------------------------------------------------------------------------

/*
  Case is tested with `\p{Lu}` and `\p{Ll}` under the `u` flag, never with a
  character range.

  The first version of this file used ranges — `[A-ZÀ-ÖØ-ÞĀ-ſ]` for uppercase —
  to cover the diacritics these credits actually carry. Latin Extended-A
  interleaves the two cases inside one block, so `Ā-ſ` holds `ł`, `ę` and `ż`
  as well as `Ł` and `Ę`, and the glue test below read the `tł` in "Bartłomiej"
  as a lowercase letter followed by an uppercase one. Five real Dawnwalker
  credits — Bartłomiej Gaweł, Jakub Szamałek, Nikola Kołodziejczyk, Piotr
  Musiał, Adam Jędrysik — were dropped as unsplittable, and the only reason
  anybody noticed is that they were listed rather than discarded silently.

  A filter written to stop bad records is still a filter. This one threw away
  every Polish name on the network's biggest wiki.
*/
const UPPER_FIRST = /^\p{Lu}/u

/**
 * Words that are legitimately lowercase inside a name, so a fragment beginning
 * or continuing with one is still a name rather than a sentence fragment.
 */
const PARTICLES = new Set([
  'de',
  'del',
  'della',
  'der',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
  'y',
  'da',
  'dos',
  'den',
  'ter',
  'bin',
  'al',
])

/**
 * Prefixes that legitimately put a capital in the middle of a word.
 *
 * "McDougall", "McCaffrey", "McKellan", "McFall", "O'Quinn", "MacLeod". The
 * glue test below looks for a lowercase letter followed by an uppercase one,
 * which every one of those trips. Stripping the prefix before the test is what
 * keeps three real Remedy and Silent Hill names out of the dropped list.
 */
/**
 * Word shapes that make a long name credible as one name.
 *
 * A four-word fragment is the hard case. "Stéphanie Cassignard Robyn Wolf" is
 * two mo-cap performers with a space between them, and "Gabin Linot Chloé
 * Louis" is two more - the wiki puts each on its own line and the harvester
 * flattens that, so the boundary is a space exactly like the three inside the
 * names. Four capitalised words on their own are therefore refused.
 *
 * A particle ("de", "van") or a suffix ("Jr.", "III") is a signal the source
 * itself supplies that the words belong together, so four survives with one.
 * Everything else four words long goes in `dropped` for somebody to read -
 * all four of the ones on this network today are genuinely two people.
 */
const SUFFIX = /^(Jr\.?|Sr\.?|II|III|IV|PhD|MBE|OBE)$/i

const NAME_PREFIX = new RegExp(`^(Mc|Mac|Fitz|O'|O’|D'|D’|L'|L’)`)

/**
 * Two names shoved together with nothing between them.
 *
 * Community-wiki infoboxes put each credit on its own line and the harvester
 * flattens that, so `"Alan WakeMark Blum (voice)AWEMartin McDougall (voice)"`
 * arrives as one string in which the boundaries are invisible: "WakeMark" is a
 * game title welded to a first name, "AWEMartin" is an expansion acronym
 * welded to another. Splitting it means deciding where a word ends, and there
 * is no way to do that which does not eventually cut a real name in half.
 *
 * So this detects the glue and the fragment is dropped. Losing Mark Blum is a
 * gap; inventing "Wakemark Blum" is a page about a person who does not exist.
 */
const isGlued = (word) => {
  const core = word.replace(NAME_PREFIX, '')
  if (/\p{Ll}\p{Lu}/u.test(core)) return true
  /* "AWEMartin", "ControlThe" — an acronym run, then a word. */
  if (/^\p{Lu}{2,}\p{Ll}/u.test(core)) return true
  return false
}

/**
 * Is what is left of a fragment a name we are willing to publish?
 *
 * Deliberately narrow. Everything this refuses is listed in `dropped` for
 * somebody to read, which is the right place for a judgement call — unlike a
 * looser rule, whose mistakes end up on a page about a living person with
 * nothing anywhere saying why.
 */
const looksLikeName = (value, allowMononym = false) => {
  const words = value.split(/\s+/).filter(Boolean)
  /*
    One word is only a name when it is the *whole* value — "Pilotpriest", the
    composer credited on Silent Hill: Townfall, is a mononym and rejecting it
    would lose a real credit. A single word taken out of a longer string is a
    different thing entirely: it is half of something, and half a name is the
    failure this file is built around.
  */
  const least = allowMononym ? 1 : 2
  if (words.length < least || words.length > 4) return false
  /* Four words need a particle or a suffix holding them together. See SUFFIX. */
  if (
    words.length === 4 &&
    !words.some((word, index) => index > 0 && PARTICLES.has(word.toLowerCase())) &&
    !words.some((word) => SUFFIX.test(word))
  ) {
    return false
  }
  if (/\d/.test(value)) return false
  if (words.some(isGlued)) return false
  if (words.length === 1 && words[0].length < 3) return false
  return words.every((word, index) => {
    if (PARTICLES.has(word.toLowerCase()) && index > 0) return true
    return UPPER_FIRST.test(word)
  })
}

/** Strip a trailing full stop, quotes and stray punctuation from a fragment. */
const tidy = (value) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;&/·|-]+|[\s,;&/·|.-]+$/g, '')
    .trim()

/**
 * Split one infobox value into candidate names, with the qualifier each one
 * carried and a reason for everything thrown away.
 *
 * The qualifier is the part in brackets — "(voice)", "(model)", "(likeness)",
 * "(Japanese dub)" — and it is what tells an actor credit from a voice one, so
 * it is kept rather than discarded with the rest of the punctuation.
 */
const splitNames = (raw) => {
  const kept = []
  const dropped = []

  /*
    A closing bracket immediately followed by a capital is the one concatenation
    boundary the source actually marks: "Ilkka Villi (model)Matthew Porretta
    (voice)". Everything else is separated by a comma, a semicolon, a slash or
    the word "and".
  */
  const separated = String(raw ?? '')
    .replace(/\)(?=\p{Lu})/gu, ')||')
    .replace(/\s*[;/]\s*/g, '||')
    .replace(/\s*,\s*/g, '||')
    .replace(/\s+and\s+/g, '||')
    .replace(/\s+&\s+/g, '||')

  const fragments = separated.split('||').map(tidy).filter(Boolean)
  /* See `looksLikeName`: a mononym is only credible as the entire value. */
  const mononym = fragments.length === 1

  for (const fragment of fragments) {

    const qualifiers = [...fragment.matchAll(/\(([^)]*)\)/g)].map((match) => match[1].trim())
    const name = tidy(fragment.replace(/\([^)]*\)/g, ' '))
    if (!name) continue

    /*
      A one-word name inside a longer value, where the source bracketed it.

      Onimusha credits Okuni Izumo to "Leader Looi (English)Chiharu
      (Japanese)Xie Ying (Mandarin Chinese)". Chiharu is a mononym and the
      only one of its kind on the network, and the blanket "a single word is
      only a name when it is the whole value" rule threw her away. The
      bracket is the source marking where the fragment begins and ends,
      which is the same evidence the splitter already trusts to cut the
      value up at all - so a fragment carrying its own qualifier may be one
      word.

      Still narrow: a bare word with no bracket, sitting in a longer list,
      is half of something and stays refused.
    */
    const single = mononym || qualifiers.length > 0

    /*
      "X or Y" is a source that is not sure which spelling is the credit —
      Phantom Blade Zero's article says "Soulframe Liang or Soulframe." Where
      one is contained in the other it is one person under two spellings, and
      the longer form is the name with the shorter recorded as an alias.
      Two unrelated names either side of "or" is a conflict this file does not
      resolve: both are kept, and the seeder's confidence says so.
    */
    if (/\bor\b/i.test(name)) {
      const options = name
        .split(/\s+or\s+/i)
        .map(tidy)
        .filter(Boolean)
      const longest = options.reduce((a, b) => (b.length > a.length ? b : a), options[0] ?? '')
      const contained = options.every((option) => longest.toLowerCase().includes(option.toLowerCase()))
      if (contained && looksLikeName(longest, single)) {
        kept.push({
          name: longest,
          qualifiers,
          alias: options.filter((option) => option !== longest),
        })
        continue
      }
      for (const option of options) {
        if (looksLikeName(option, single)) kept.push({ name: option, qualifiers, alias: [] })
        else dropped.push({ fragment: option, reason: 'not a name shape', from: String(raw) })
      }
      continue
    }

    if (looksLikeName(name, single)) kept.push({ name, qualifiers, alias: [] })
    else {
      dropped.push({
        fragment: name,
        reason: name.split(/\s+/).some(isGlued)
          ? 'two names concatenated with no separator — cannot be split confidently'
          : name.split(/\s+/).length === 4
            ? 'four capitalised words with no separator — probably two names, and there is no way to tell where one ends'
            : 'not a name shape',
        from: String(raw),
      })
    }
  }

  return { kept, dropped }
}

// ---------------------------------------------------------------------------
// Wikitext, for the infobox and the sort key
// ---------------------------------------------------------------------------

/**
 * Wikitext to readable text.
 *
 * Birth dates come first and on purpose: `{{Birth date and age|1978|3|12}}` is
 * the only fact on a person's infobox that lives entirely inside a template,
 * so the generic "strip every template" pass below would silently turn a
 * sourced date of birth into an empty field.
 *
 * ## The last line is the one that was missing
 *
 * Everything here strips *wikitext*. A Wikipedia infobox also carries HTML
 * entities and invisible characters, and this file decoded neither. These are
 * pages about living people, which is where it costs most: `1992&ndash;present`
 * reached a reader as those eight literal characters, and a zero-width joiner
 * inside a name is invisible and fatal to every match that would have linked
 * the person to the games they are credited on.
 *
 * `harvestText` is the whole repair, from the one table in
 * `src/lib/text-encoding-table.mjs` — shared rather than copied, because a
 * second copy of a repair table drifts and a drifted one writes faults in
 * rather than out. It runs last, so it sees what the markup passes left and
 * cannot re-form an entity out of a stripped brace.
 */
const clean = (value) =>
  harvestText(
    String(value ?? '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<ref[^>]*\/>/gi, '')
      .replace(
        /\{\{\s*(?:birth date and age|birth date|bda|birth-date and age|death date and age|death date)\s*\|([^}]*)\}\}/gi,
        (_, inner) => {
          const numbers = inner
            .split('|')
            .map((part) => part.trim())
            .filter((part) => /^\d+$/.test(part))
          if (numbers.length < 3) return numbers[0] ?? ' '
          const [year, month, day] = numbers
          const MONTHS = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ]
          return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`
        },
      )
      .replace(/\{\{\s*(?:circa|c\.)\s*\|?\s*([^}|]*)\}\}/gi, 'c. $1')
      .replace(/\{\{\s*(?:URL|official website)\s*\|([^}|]*)[^}]*\}\}/gi, '$1')
      .replace(/\{\{\s*(?:nowrap|nobold|small|flatlist|plainlist|hlist|ubl|unbulleted list)\s*\|/gi, '')
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
      /*
        Whatever brace survived the two passes above.

        A nested template with an unbalanced close leaves a bare "}}" in the
        value, and it looks like text from there on: one reached a person's
        occupation as "actress, voice actress, }}" and would have been
        published as a sentence. Nothing downstream can tell that apart from a
        fact.
      */
      .replace(/[{}]+/g, ' ')
      .replace(/'''?/g, '')
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<\/?li>/gi, ', ')
      .replace(/<[^>]*>/g, '')
      .replace(/^[\s*|]+/gm, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(', ')
      .replace(/\s*,\s*,+/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim(),
  )

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

/**
 * The first `{{Infobox …}}` on the article, as key/value pairs.
 *
 * Any infobox, not `Infobox person` specifically: these people are filed under
 * `Infobox musical artist`, `Infobox person`, `Infobox writer` and
 * `Infobox video game designer`, and insisting on one of them would leave most
 * of the composers with no facts at all.
 *
 * Each field is read from its own block, which is the rule the achievement
 * scraper's silent failure bought: one lazy-quantified expression spanning a
 * whole record skips past every optional group in it.
 */
const INFOBOX_TEMPLATE = /\{\{\s*(?:Infobox[\s_]|Sidebar\/)/i

const infobox = (wikitext, pattern = INFOBOX_TEMPLATE) => {
  const start = wikitext.search(pattern)
  if (start === -1) return {}

  let depth = 0
  let end = -1
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
    if (/^(image|caption|alt|image_size|imagesize|signature|module|embed)/.test(key)) continue
    facts[key] = value.slice(0, 400)
  }
  return facts
}

/**
 * Wikipedia's own sort key for the article, e.g. `{{DEFAULTSORT:Gaweł,
 * Bartłomiej}}`.
 *
 * This is taken rather than computed because "the last word is the surname" is
 * wrong for a great many of these names — Japanese names in their own order,
 * Spanish double surnames, mononyms — and the field's own comment says a wrong
 * guess about somebody's name is not worth making. Where an article has no
 * DEFAULTSORT the seeder leaves `sortName` blank and the directory sorts on
 * the name as written, which is the documented fallback.
 */
const defaultSort = (wikitext) => {
  const match = wikitext.match(/\{\{\s*DEFAULTSORT\s*:\s*([^}|]+)/i)
  const value = match ? clean(match[1]) : ''
  return value.includes(',') ? value : ''
}

// ---------------------------------------------------------------------------
// Is the article about a person, and is it about this person?
// ---------------------------------------------------------------------------

/* An article about a human being says so in its categories, every time. */
const BIRTH_SIGNAL = /^Category:(Living people|\d{4}s? births|\d{4} deaths|Year of birth)/i
const OCCUPATION_SIGNAL =
  /\b(actors?|actresses|composers?|musicians?|writers?|screenwriters?|novelists?|designers?|directors?|producers?|programmers?|artists?|singers?|voice actors?|voice actresses|animators?|illustrators?|people|alumni|male|female|births|expatriates)\b/i

/* …and an article about a product, a company or a film says that, too. */
const NOT_A_PERSON =
  /\b(video games|companies|corporations|subsidiaries|films|television series|albums|EPs|singles|software|studios|organizations|franchises|characters|disambiguation|set indices)\b/i

const classify = (page) => {
  const categories = (page.categories ?? []).map((category) => category.title)
  if (page.pageprops && 'disambiguation' in page.pageprops) {
    return { person: false, why: 'disambiguation page', categories }
  }
  if (categories.some((category) => BIRTH_SIGNAL.test(category))) {
    return { person: true, why: 'birth/living-people category', categories }
  }
  const occupation = categories.filter((category) => OCCUPATION_SIGNAL.test(category))
  const product = categories.filter((category) => NOT_A_PERSON.test(category))
  if (occupation.length > 0 && product.length === 0) {
    return { person: true, why: `occupation category (${occupation[0]})`, categories }
  }
  return {
    person: false,
    why: product[0]
      ? `resolved to a non-person article (${product[0].replace(/^Category:/, '')})`
      : 'no category confirms a person',
    categories,
  }
}

/** One article, with everything this network is willing to record about it. */
const fetchArticle = async (title) => {
  const data = await api({
    action: 'query',
    redirects: '1',
    titles: title,
    prop: 'extracts|categories|pageprops|info|revisions',
    exintro: '1',
    explaintext: '1',
    cllimit: 'max',
    clshow: '!hidden',
    inprop: 'url',
    rvprop: 'content',
    rvslots: 'main',
  })
  const page = data.query?.pages?.[0]
  if (!page || page.missing) return null
  const wikitext = page.revisions?.[0]?.slots?.main?.content ?? ''
  const verdict = classify(page)
  return {
    title: page.title,
    url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    extract: String(page.extract ?? '').trim(),
    categories: verdict.categories.map((category) => category.replace(/^Category:/, '')),
    facts: infobox(wikitext),
    sortName: defaultSort(wikitext),
    person: verdict.person,
    why: verdict.why,
  }
}

/**
 * Titles worth trying for a name, in order.
 *
 * Exact first. Then, only if the exact title is missing or turned out to be a
 * disambiguation page or a product, whatever the search index offers that is
 * *the same name plus a bracketed disambiguator* — "Adam Lastiwka (composer)".
 * Nothing looser: a free-text search for a person's name returns the article
 * about the game they worked on as readily as the article about them, and
 * accepting that is how a biography ends up on the wrong human being.
 */
const searchTitles = async (name) => {
  const data = await api({
    action: 'query',
    list: 'search',
    srsearch: `"${name}"`,
    srlimit: '10',
    srnamespace: '0',
  })
  const lower = name.toLowerCase()
  return (data.query?.search ?? [])
    .map((hit) => hit.title)
    .filter((title) => {
      const plain = title.toLowerCase().replace(/\s*\([^)]*\)\s*$/, '')
      return plain === lower && title.toLowerCase() !== lower
    })
}

/**
 * Does the article we landed on actually say this name?
 *
 * Wikipedia follows redirects, and a redirect is not always an alias. Two real
 * results from the first sweep:
 *
 *   Pilotpriest   -> Anthony Scott Burns      correct; a stage name, and the
 *                                             article says "Pilotpriest"
 *   Derek Hagen   -> Derek Hagan              wrong; a near-spelling redirect
 *                                             to an American footballer, whose
 *                                             article has never heard of a
 *                                             Derek Hagen
 *
 * Structurally identical — a queried name, a differently titled article — so
 * the only thing that separates them is whether the article uses the name we
 * asked about. Where the title matches, nothing to check. Where it does not,
 * the name has to appear in the lead or in an infobox field, or this is
 * somebody else and the record goes back to unresolved.
 *
 * Applied on every pass, cached articles included, so tightening it takes
 * effect on a re-run rather than only on names fetched fresh. `seed:prune`
 * exists because the opposite is true of the guide generators, and this is the
 * same trap one door along.
 */
const confirmsName = (article, name) => {
  /*
    Compared with the diacritics folded away, because the credit and the
    article are often two romanisations of one name: Onimusha's wiki writes
    "Yuko Kaida" and Wikipedia titles the article "Yūko Kaida". A macron is a
    spelling difference, not a different person — whereas "Derek Hagen" against
    "Derek Hagan" survives this fold and is still correctly refused, because
    the letters themselves differ.
  */
  const fold = (value) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  const plain = fold(article.title).replace(/\s*\([^)]*\)\s*$/, '')
  if (plain === fold(name)) return true
  const haystack = fold(`${article.extract} ${Object.values(article.facts ?? {}).join(' ')}`)
  return haystack.includes(fold(name))
}

const lookup = async (name) => {
  const exact = await fetchArticle(name)
  if (exact?.person) return { article: exact }

  const alternatives = await searchTitles(name)
  const people = []
  for (const title of alternatives) {
    const candidate = await fetchArticle(title)
    if (candidate?.person) people.push(candidate)
  }
  /*
    Exactly one, or none. Two articles about two different people with the same
    name is not something this file is in a position to choose between, and
    choosing wrong puts one person's date of birth on the other's page.
  */
  if (people.length === 1) return { article: people[0] }
  if (people.length > 1) {
    return { article: null, why: `ambiguous — ${people.length} articles share this name` }
  }
  return { article: null, why: exact ? exact.why : 'no article' }
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

const ROLE_FIELDS = ['director', 'designer', 'artist', 'writer', 'composer', 'producer', 'programmer']
/**
 * Every infobox key a performance credit arrives under, across seven wikis.
 *
 * The first three were the whole list, and Onimusha therefore had a crew of
 * fourteen and no cast at all: its wiki spells the key `Voice Actors`, with
 * the language in brackets after each name. The last three are read the same
 * way as the first three, qualifiers and all - what changes is the role the
 * seeder gives them, which the key itself now decides.
 *
 * Widening this does not widen the splitter. `mo-capped by` is where the
 * genuinely unsplittable values live - "Stéphanie Cassignard Robyn Wolf" is
 * two names with a space between them and no way to tell which space - and
 * those still go in `dropped` and stay there.
 */
const ACTOR_FIELDS = [
  'actor',
  'voiced by',
  'portrayed by',
  'Voice Actors',
  'mo-capped by',
  'Face Models',
  /*
    The second survey, across all fifteen harvests.

    The six above were what seven wikis spelled it. Adding eight wikis added
    seven more spellings, and between them they carried **158 credits this
    file was not reading** — nearly three times what it was. Nothing errored:
    a key nobody reads produces a clean run and a cast of nobody, which is
    exactly how Onimusha came to have a crew of fourteen and no actors.

    Read off the harvests rather than guessed:

      voice        50  GTA 6, Resident Evil Requiem
      voiceby      41  Fire Emblem
      mocap        30  Resident Evil Requiem
      jpn_voiceby  28  Fire Emblem
      portrayer     4  Resident Evil Requiem
      portrayed     3  Silent Hill Townfall
      voiceactor    2  Subnautica 2

    `jpn_voiceby` is the Japanese cast and belongs here for the same reason
    Onimusha's bracketed languages do: a performance credit is a performance
    credit, and which language it was in is a qualifier the splitter already
    handles.
  */
  'voice',
  'voiceby',
  'jpn_voiceby',
  'voiceactor',
  'mocap',
  'portrayer',
  'portrayed',
]

/**
 * A page about a real person, on a wiki that files them beside its characters.
 *
 * Silent Hill's wiki keeps its cast and crew in the article namespace with the
 * same infobox shape as everybody else, so the entity harvester filed Jovan
 * Adepo, Kezia Burrows, Terry O'Quinn, Christophe Gans and Franck Besançon as
 * *characters in Silent Hill*. `pnpm check:kind` and `seed:prune-entities`
 * have since taken them out of that collection, which is right and also leaves
 * five sourced people with nowhere to be. This is where they go.
 *
 * The wiki marks them itself: "The Real World" is its category for a page
 * about somebody who exists, and an occupational category says what they did.
 * Both are required - the marker alone also covers studios and teams.
 */
const REAL_WORLD = 'The Real World'
const OCCUPATION_CATEGORY =
  /^(Actors|Actresses|Staff|Crew|Writers|Directors|Composers|Voice Actors|Cast|Musicians|Artists)$/i

/**
 * In a wiki's real-people categories, and not a person.
 *
 * Reviewed by hand rather than matched. "Team Silent" is Konami's in-house
 * group and carries every category a person does - The Real World, Staff,
 * Crew, Writers - so the only thing that separates it is knowing what it is.
 * A rule on the word "Team" is the kind of guess that deleted Antar 4, and
 * this list is short enough to read. A company record is where this one
 * belongs, which is somebody else's collection.
 */
const NOT_A_PERSON_ENTITY = new Set(['Team Silent'])

const isPersonEntity = (entity) => {
  const categories = entity.categories ?? []
  if (!categories.includes(REAL_WORLD)) return false
  if (NOT_A_PERSON_ENTITY.has(entity.title)) return false
  return categories.some((category) => OCCUPATION_CATEGORY.test(category))
}

/** Punctuation-blind, so "Silent Hill Townfall People" matches "Silent Hill: Townfall". */
const flatten = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** A comma-separated list field, as a list. */
const listField = (value) =>
  String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

/**
 * One person's own page on a harvested wiki.
 *
 * The infoboxes here are unusually good — `occupation`, `hometown`, `born`,
 * `debut`, `otherappearances` and `portrayed`, which hands over the character
 * relationship directly.
 *
 * The load-bearing part is `onOurGame`. **Christophe Gans directed the Silent
 * Hill films, not Silent Hill: Townfall**, and his page is on the Silent Hill
 * wiki for that reason alone. Letting "appears on the wiki for this franchise"
 * become "worked on the game this network covers" is the invented fact the
 * whole project exists to avoid, and it is the same line `seed/companies.ts`
 * draws about a studio named on a franchise wiki. So a credit against our game
 * is pushed only where the wiki itself puts them on it — its `debut` field or
 * a category naming the game. Otherwise the record carries their role and
 * their own credits and says nothing about our game at all.
 */
const readPersonEntity = (entity, harvest, gameTitle, draftFor, dropped) => {
  const facts = entity.facts ?? {}
  const categories = entity.categories ?? []
  const retrieved = harvest.fetchedAt ?? null

  const { kept } = splitNames(facts.name ?? entity.title)
  if (kept.length !== 1) {
    /*
      A person page whose own title will not split. Taking the title as the
      name would be assuming it is one, which is the assumption this file is
      built to refuse.
    */
    dropped.push({
      fragment: entity.title,
      reason: 'a real-person page whose title does not read as a single name',
      from: entity.url,
      game: harvest.slug,
      field: 'person page',
    })
    return
  }

  const name = kept[0].name
  const draft = draftFor(name)

  const fullName = facts.fullname && facts.fullname !== name ? facts.fullname : null
  if (fullName && !draft.alsoKnownAs.includes(fullName)) draft.alsoKnownAs.push(fullName)

  const stated = [facts.role, facts.occupation, facts.profession].filter(Boolean).join(' ')
  const onOurGame = flatten(`${facts.debut ?? ''} ${categories.join(' ')}`).includes(
    flatten(gameTitle),
  )

  draft.profile = {
    title: entity.title,
    url: entity.url,
    wiki: harvest.host,
    game: harvest.slug,
    gameTitle,
    profession: facts.occupation ?? facts.profession ?? null,
    crewRole: facts.role ?? null,
    /*
      `hometown` is not `birthPlace` and is not written into it. Where somebody
      is from and where they were born are different facts, and the schema has
      a field for one of them — so this reaches the reader as its own sentence
      rather than as a date-of-birth-shaped claim nobody sourced.
    */
    hometown: facts.hometown ?? null,
    born: facts.born ?? facts.birthdate ?? null,
    birthPlace: facts.birthplace ?? null,
    nationality: facts.nationality ?? null,
    activeSince: facts.active ?? null,
    /* The field name says these are films; the other list does not say what it is. */
    films: listField(facts.shmovies),
    otherWorks: listField(facts.otherappearances),
    roles: rolesFromWords(stated),
    onOurGame,
    sortName: '',
    retrieved,
  }

  if (onOurGame) {
    const roles = draft.profile.roles.length > 0 ? draft.profile.roles : ['developer']
    for (const role of roles) {
      draft.credits.push({
        game: harvest.slug,
        gameTitle,
        role,
        note: stated || null,
        stated: stated || `credited on ${gameTitle}`,
        uncertain: false,
        source: entity.url,
        sourceTitle: `${entity.title} — ${harvest.host} (CC BY-SA)`,
        retrieved,
      })
    }
  }

  /* `portrayed` names the part, from the performer's side. */
  for (const character of listField(facts.portrayed)) {
    const already = draft.characters.some(
      (entry) => entry.game === harvest.slug && entry.character === character,
    )
    if (already) continue
    draft.characters.push({
      game: harvest.slug,
      gameTitle,
      character,
      collection: 'characters',
      field: 'portrayed',
      note: facts.occupation ?? null,
      source: entity.url,
      sourceTitle: `${entity.title} — ${harvest.host} (CC BY-SA)`,
      retrieved,
    })
  }
}

const collect = () => {
  const people = new Map()
  const dropped = []

  const draftFor = (name) => {
    const key = name.toLowerCase()
    let draft = people.get(key)
    if (!draft) {
      draft = { name, alsoKnownAs: [], credits: [], characters: [], profile: null }
      people.set(key, draft)
    }
    return draft
  }

  // --- 1. Each game's own Wikipedia infobox --------------------------------
  const games = {}
  for (const entry of fs.readdirSync(REFERENCE)) {
    if (!entry.endsWith('.json')) continue
    const reference = JSON.parse(fs.readFileSync(path.join(REFERENCE, entry), 'utf8'))
    const wikipedia = reference.wikipedia
    if (!wikipedia) continue
    games[reference.slug] = {
      title: wikipedia.title,
      url: wikipedia.url,
      released: wikipedia.facts?.released ?? null,
      developer: wikipedia.facts?.developer ?? null,
      publisher: wikipedia.facts?.publisher ?? null,
    }

    for (const field of ROLE_FIELDS) {
      const value = wikipedia.facts?.[field]
      if (!value) continue
      const { kept, dropped: bad } = splitNames(value)
      for (const entry of bad) dropped.push({ ...entry, game: reference.slug, field })
      for (const person of kept) {
        const draft = draftFor(person.name)
        for (const alias of person.alias) {
          if (!draft.alsoKnownAs.includes(alias)) draft.alsoKnownAs.push(alias)
        }
        draft.credits.push({
          game: reference.slug,
          gameTitle: wikipedia.title,
          role: field,
          note: person.qualifiers.join(', ') || null,
          /*
            The conflict, kept rather than resolved. Phantom Blade Zero's
            article gives its director as "Soulframe Liang or Soulframe", and
            `docs/DATA.md` is where that kind of thing is recorded — not in a
            coin flip here.
          */
          stated: value,
          uncertain: /\bor\b/i.test(value),
          source: wikipedia.url,
          sourceTitle: `${wikipedia.title} — Wikipedia (${wikipedia.licence ?? 'CC BY-SA 4.0'})`,
          retrieved: reference.fetchedAt ?? null,
        })
      }
    }
  }


  // --- 2. Character infoboxes on the community wikis ------------------------
  for (const entry of fs.readdirSync(ENTITIES)) {
    if (!entry.endsWith('.json')) continue
    const harvest = JSON.parse(fs.readFileSync(path.join(ENTITIES, entry), 'utf8'))
    const gameTitle = games[harvest.slug]?.title ?? harvest.slug
    for (const entity of harvest.entities ?? []) {
      /*
        Enemies too, not only characters.

        Control files Helen Marshall under `enemies` - she is a person who
        becomes a boss - and her infobox carries the only actor credit on the
        network that sits outside `characters`. Reading characters alone lost
        Brig Bennett and Jade Anouka for a filing decision made on another
        wiki. The collection is recorded with the credit so the seeder can
        link a relationship only where there is a `characters` record to
        point at.
      */
      if (entity.collection !== 'characters' && entity.collection !== 'enemies') continue
      if (isPersonEntity(entity)) {
        readPersonEntity(entity, harvest, gameTitle, draftFor, dropped)
        /*
          A page about a person has no part to play in itself. Falling through
          to the actor fields would read a crew member's own page as though it
          were a character's.
        */
        continue
      }

      for (const field of ACTOR_FIELDS) {
        const value = entity.facts?.[field]
        if (!value) continue
        const { kept, dropped: bad } = splitNames(value)
        for (const item of bad) {
          dropped.push({ ...item, game: harvest.slug, field, character: entity.title })
        }
        for (const person of kept) {
          const draft = draftFor(person.name)
          draft.characters.push({
            game: harvest.slug,
            gameTitle,
            character: entity.title,
            /* Which collection the part is filed in - see the gate above. */
            collection: entity.collection,
            field,
            /*
              "(voice)", "(model)", "(likeness)", "(Japanese dub)" — the
              difference between playing a part and dubbing it, which the
              seeder turns into `actor` versus `voice-actor` rather than
              flattening both to the same claim.
            */
            note: person.qualifiers.join(', ') || null,
            source: entity.url,
            sourceTitle: `${entity.title} — ${harvest.host} (CC BY-SA)`,
            retrieved: harvest.fetchedAt ?? null,
          })
        }
      }
    }
  }

  return { people, dropped, games, draftFor }
}

// ---------------------------------------------------------------------------
// Dawnwalker's own wiki, which is live rather than harvested
// ---------------------------------------------------------------------------

const DAWNWALKER_WIKI = 'dawnwalker.fandom.com'

/* Where the cast and crew are filed, and where the character pages are. */
const DW_PERSON_CATEGORIES = [
  'Cast',
  'Cast (The Blood of Dawnwalker)',
  'Crew',
  'Crew (The Blood of Dawnwalker)',
]
const DW_CHARACTER_CATEGORIES = ['Characters (The Blood of Dawnwalker)']

const fandom = async (params, attempt = 0) => {
  const url = `https://${DAWNWALKER_WIKI}/api.php?${new URLSearchParams({
    format: 'json',
    formatversion: '2',
    ...params,
  })}`
  let response
  try {
    response = await fetch(url, { headers: { 'User-Agent': UA } })
  } catch (error) {
    if (attempt >= 3) throw new RateLimited(`network failure: ${error.message}`)
    await sleep(2000 * 2 ** attempt)
    return fandom(params, attempt + 1)
  }
  if (response.status === 429 || response.status === 503) {
    if (attempt >= 4) throw new RateLimited(`HTTP ${response.status} after ${attempt} retries`)
    await sleep(2000 * 2 ** attempt)
    return fandom(params, attempt + 1)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  await sleep(500)
  return response.json()
}

/** Article-namespace members of a category. Templates and files are not people. */
const categoryPages = async (category) => {
  const data = await fandom({
    action: 'query',
    list: 'categorymembers',
    cmtitle: `Category:${category}`,
    cmnamespace: '0',
    cmlimit: '500',
  })
  return (data.query?.categorymembers ?? []).map((member) => member.title)
}

/** Wikitext for a batch of titles. Fifty at a time is the API's own limit. */
const wikitextFor = async (titles) => {
  const out = new Map()
  for (let index = 0; index < titles.length; index += 40) {
    const batch = titles.slice(index, index + 40)
    const data = await fandom({
      action: 'query',
      titles: batch.join('|'),
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
    })
    for (const page of data.query?.pages ?? []) {
      if (page.missing) continue
      out.set(page.title, page.revisions?.[0]?.slots?.main?.content ?? '')
    }
  }
  return out
}

const dwUrl = (title) =>
  `https://${DAWNWALKER_WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

/**
 * `profession = Actor` / `crewrole = Composer` onto the collection's own roles.
 *
 * Anything this does not recognise is left for the seeder to fall back on
 * rather than mapped to the nearest option — "Stunt coordinator" is not a
 * director, and `developer` ("role not stated") is the honest answer to a word
 * the schema has no value for.
 */
const ROLE_WORDS = [
  [/voice/i, 'voice-actor'],
  [/motion|mo-?cap|performance capture/i, 'motion-capture'],
  [/actor|actress|cast|starring/i, 'actor'],
  [/composer|music|score/i, 'composer'],
  [/director/i, 'director'],
  [/designer/i, 'designer'],
  [/writer|narrative|script/i, 'writer'],
  [/artist|art /i, 'artist'],
  [/producer/i, 'producer'],
  [/programmer|engineer/i, 'programmer'],
]

const roleFromWords = (value) => {
  for (const [pattern, role] of ROLE_WORDS) if (pattern.test(value)) return role
  return null
}

/**
 * Every role a description names, not just the first.
 *
 * Silent Hill's wiki gives Christophe Gans as "Director Writer (uncredited)",
 * which is two credits in one field. Taking only the first would file a writer
 * as nothing.
 */
const rolesFromWords = (value) => {
  const found = ROLE_WORDS.filter(([pattern]) => pattern.test(value)).map(([, role]) => role)
  return [...new Set(found)]
}

/**
 * The character titles in a person page's `role` field.
 *
 * `[[Coen]]<br>[[Lunka]]` reaches here as "Coen, Lunka": `clean` has already
 * resolved the links and turned the line break into a comma, so reading this
 * with a wiki-link pattern found nothing at all and every Dawnwalker actor
 * arrived with no part. Split what is actually there, not what the wikitext
 * looked like two functions ago.
 */
const roleTargets = (value) =>
  String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

/**
 * Cast and crew from `dawnwalker.fandom.com`, and the characters they play.
 *
 * Two passes that agree with each other: the person pages carry a `role` field
 * naming the character, and the character pages carry an `actor` field naming
 * the person. Reading both is free and a disagreement between them is worth
 * seeing rather than smoothing over.
 *
 * Nothing about a character is taken beyond its title, which is used to match
 * a record that already exists. Dawnwalker's 440 records are hand-written.
 */
const collectDawnwalker = async (draftFor, dropped, games) => {
  const gameTitle = games.dawnwalker?.title ?? 'The Blood of Dawnwalker'
  const retrieved = new Date().toISOString().slice(0, 10)
  let profiles = 0
  let credits = 0

  // --- The person pages ----------------------------------------------------
  const personTitles = new Set()
  for (const category of DW_PERSON_CATEGORIES) {
    for (const title of await categoryPages(category)) personTitles.add(title)
  }

  const personText = await wikitextFor([...personTitles])
  for (const [title, wikitext] of personText) {
    const facts = infobox(wikitext, /\{\{\s*Sidebar\/person/i)
    /*
      A page in the Cast category that is not built on the person infobox is
      not something to guess about. It is listed rather than parsed loosely.
    */
    if (Object.keys(facts).length === 0) {
      dropped.push({
        fragment: title,
        reason: 'in the Cast/Crew category but carries no person infobox',
        from: dwUrl(title),
        game: 'dawnwalker',
        field: 'category',
      })
      continue
    }

    const { kept, dropped: bad } = splitNames(facts.name ?? title)
    for (const item of bad) {
      dropped.push({ ...item, game: 'dawnwalker', field: 'fandom person page' })
    }
    /*
      A person page whose own name will not split is dropped rather than taken
      from the page title, which would be assuming the title is the name.
    */
    if (kept.length !== 1) continue

    const draft = draftFor(kept[0].name)
    profiles += 1

    const fullName = facts.fullname && facts.fullname !== kept[0].name ? facts.fullname : null
    if (fullName && !draft.alsoKnownAs.includes(fullName)) draft.alsoKnownAs.push(fullName)

    draft.profile = {
      title,
      url: dwUrl(title),
      wiki: DAWNWALKER_WIKI,
      profession: facts.profession ?? null,
      crewRole: facts.crewrole ?? null,
      born: facts.birthdate ?? null,
      birthPlace: facts.birthplace ?? null,
      nationality: facts.nationality ?? null,
      activeSince: facts.active ?? null,
      sortName: defaultSort(wikitext),
      retrieved,
    }

    const role = roleFromWords(`${facts.crewrole ?? ''} ${facts.profession ?? ''}`)
    if (role) {
      draft.credits.push({
        game: 'dawnwalker',
        gameTitle,
        role,
        note: facts.crewrole ?? facts.profession ?? null,
        stated: facts.crewrole ?? facts.profession ?? '',
        uncertain: false,
        source: dwUrl(title),
        sourceTitle: `${title} — ${DAWNWALKER_WIKI} (CC BY-SA)`,
        retrieved,
      })
      credits += 1
    }

    /* `role = [[Coen]]` — the character, named by the actor's own page. */
    for (const character of roleTargets(facts.role)) {
      draft.characters.push({
        game: 'dawnwalker',
        gameTitle,
        character,
        collection: 'characters',
        field: 'role',
        note: facts.profession ?? null,
        source: dwUrl(title),
        sourceTitle: `${title} — ${DAWNWALKER_WIKI} (CC BY-SA)`,
        retrieved,
      })
    }
  }

  // --- The character pages, for the same fact from the other end -----------
  const characterTitles = new Set()
  for (const category of DW_CHARACTER_CATEGORIES) {
    for (const title of await categoryPages(category)) characterTitles.add(title)
  }

  const characterText = await wikitextFor([...characterTitles])
  for (const [title, wikitext] of characterText) {
    const facts = infobox(wikitext, /\{\{\s*Sidebar\/character/i)
    for (const field of ACTOR_FIELDS) {
      const value = facts[field]
      if (!value) continue
      const { kept, dropped: bad } = splitNames(value)
      for (const item of bad) {
        dropped.push({ ...item, game: 'dawnwalker', field, character: title })
      }
      for (const person of kept) {
        const draft = draftFor(person.name)
        const already = draft.characters.some(
          (entry) => entry.game === 'dawnwalker' && entry.character === title,
        )
        if (already) continue
        draft.characters.push({
          game: 'dawnwalker',
          gameTitle,
          character: title,
          collection: 'characters',
          field,
          note: person.qualifiers.join(', ') || null,
          source: dwUrl(title),
          sourceTitle: `${title} — ${DAWNWALKER_WIKI} (CC BY-SA)`,
          retrieved,
        })
      }
    }
  }

  console.log(
    `dawnwalker.fandom.com: ${personTitles.size} cast/crew pages, ${profiles} with a person infobox, ${credits} credits, ${characterTitles.size} character pages read for their actor field`,
  )
}

const run = async () => {
  const { people, dropped, games, draftFor } = collect()
  console.log(`${people.size} candidate names from the local harvests`)

  /*
    The live source. A failure here is not allowed to cost the local names, so
    it is reported and the run continues — the other seven wikis' cast came out
    of JSON on disk and does not depend on Fandom being up.
  */
  try {
    await collectDawnwalker(draftFor, dropped, games)
  } catch (error) {
    console.log(`dawnwalker.fandom.com: unreachable (${error.message}) — no Dawnwalker cast this run`)
  }

  console.log(`${people.size} candidate names from ${Object.keys(games).length} games`)
  console.log(`${dropped.length} fragments dropped as unsplittable — listed in people.json\n`)

  /*
    Every article already on disk is carried forward. Re-running after a rate
    limit therefore only ever adds, which is what makes the incremental write
    below safe: the file cannot shrink to a worse version of itself.
  */
  const previous =
    !REFRESH && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { people: [] }
  const cached = new Map(
    (previous.people ?? [])
      .filter((person) => person.article)
      .map((person) => [person.name.toLowerCase(), person.article]),
  )
  const previouslyResolved = cached.size

  const records = []
  let resolved = 0
  let unresolved = 0
  let stoppedEarly = null

  const drafts = [...people.values()]

  /**
   * Write the file, including the names this run has not reached yet.
   *
   * The first version wrote only the records already processed, so killing a
   * sweep half way left a file holding half the candidates — and since the
   * cache is built from that file, the next run had to re-fetch everything the
   * killed one had already resolved. "A rate limit costs the run and not the
   * work" was true only if the run was allowed to finish, which is the one
   * case where it does not matter.
   *
   * So every unreached candidate is written too, carrying whatever article the
   * previous file had for it and saying plainly that it has not been looked up
   * this time. The file is always the whole candidate list.
   */
  const write = () => {
    const pending = drafts.slice(records.length).map((draft) => {
      const held = cached.get(draft.name.toLowerCase()) ?? null
      return {
        ...draft,
        article: held,
        unresolvedReason: held ? null : 'not looked up — the run has not reached this name',
      }
    })
    const payload = {
      fetchedAt: new Date().toISOString().slice(0, 10),
      source: 'en.wikipedia.org/w/api.php (CC BY-SA 4.0)',
      complete: !stoppedEarly && pending.length === 0,
      games,
      counts: { candidates: people.size, resolved, unresolved, dropped: dropped.length },
      people: [...records, ...pending],
      dropped,
    }
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)
  }

  /* Written once before the sweep, so an interrupted first pass still leaves a
     complete candidate list rather than an empty file. */
  write()

  for (const draft of drafts) {
    const record = { ...draft, article: null, unresolvedReason: null }

    const hit = cached.get(draft.name.toLowerCase())
    if (hit) {
      if (confirmsName(hit, draft.name)) {
        record.article = hit
        resolved += 1
        console.log(`  ${draft.name.padEnd(30)} cached — ${hit.title}`)
      } else {
        record.unresolvedReason = `redirects to "${hit.title}", which does not mention this name`
        unresolved += 1
        console.log(`  ${draft.name.padEnd(30)} rejected: ${record.unresolvedReason}`)
      }
      records.push(record)
      continue
    }

    if (stoppedEarly) {
      /*
        The sweep is over but the candidate is still real. It is recorded with
        the credit that named it and no reason invented: "not looked up" is the
        truth, and a later run fills it in. Writing "no article" here is the
        mistake `fetch-search-queries.mjs` exists to warn about.
      */
      record.unresolvedReason = 'not looked up — the run stopped before reaching this name'
      records.push(record)
      continue
    }

    try {
      const { article, why } = await lookup(draft.name)
      if (article && !confirmsName(article, draft.name)) {
        record.unresolvedReason = `redirects to "${article.title}", which does not mention this name`
        unresolved += 1
        console.log(`  ${draft.name.padEnd(30)} rejected: ${record.unresolvedReason}`)
      } else if (article) {
        record.article = article
        resolved += 1
        console.log(`  ${draft.name.padEnd(30)} ${article.title} — ${article.why}`)
      } else {
        /*
          An article that exists and is **not about a person** ends the
          credit, rather than recording it unresolved and publishing it anyway.

          The distinction matters and it is the whole of this guard. A real
          performer with no Wikipedia article is the ordinary case: keep them,
          low confidence, nothing filled in — that is what `unresolved` is for.
          A name whose article is a *video game* is not a performer at all, and
          the classifier has already said so in as many words.

          Widening `ACTOR_FIELDS` is what made this load-bearing. Fire Emblem's
          wiki puts appearances under `voiceby` on at least one character:
          Anna's reads "Awakening, Fates, Three Houses, Three Hopes, Heroes".
          The splitter turns that into five names, four of them resolve to Fire
          Emblem games, and without this they would have been published as five
          human beings with profiles on `people.<domain>`. That is the
          "Stéphanie Cassignard Robyn Wolf" failure with a worse ending,
          because these ones look plausible.

          Only the article-says-otherwise cases are dropped — a game, a film, a
          company, a disambiguation page. "No article" and "no category
          confirms a person" both stay, because neither is evidence against a
          person, only an absence of evidence for one.
        */
        if (/resolved to a non-person article|disambiguation page/.test(why)) {
          dropped.push({
            character: draft.from?.[0]?.character ?? '',
            value: draft.name,
            why: `${why} — not published: an article that says it is not a person is evidence, not silence`,
          })
          console.log(`  ${draft.name.padEnd(30)} DROPPED: ${why}`)
          continue
        }
        record.unresolvedReason = why
        unresolved += 1
        console.log(`  ${draft.name.padEnd(30)} unresolved: ${why}`)
      }
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error
      stoppedEarly = error.message
      record.unresolvedReason = 'not looked up — the run stopped before reaching this name'
      console.log(`\n  STOPPED: ${error.message}`)
      console.log('  Everything already resolved is kept. Re-run later to finish.\n')
    }

    records.push(record)
    write()
  }

  /*
    The guard from `tools/fetch-search-queries.mjs`, for the same reason: a
    blocked endpoint must never be recorded as an answer. Articles are merged
    from the cache so this should be unreachable, which is exactly when a
    guard is worth having.
  */
  if (resolved < previouslyResolved * 0.9) {
    console.error(
      `\nREFUSING TO WRITE: ${resolved} resolved against ${previouslyResolved} already on disk.`,
    )
    console.error('That is a collapse, not a result. src/seed/raw/people.json is unchanged.')
    process.exit(1)
  }

  write()

  console.log(`\ncandidates ${people.size}  resolved ${resolved}  unresolved ${people.size - resolved}`)
  console.log(`fragments dropped as unsplittable: ${dropped.length}`)
  for (const item of dropped) {
    console.log(`  ${(item.character ?? item.game).padEnd(26)} ${item.fragment} — ${item.reason}`)
  }
  console.log(`\nWritten to ${OUT}`)
  if (stoppedEarly) {
    console.log('Run was cut short by a rate limit. Re-run it; cached articles are not re-fetched.')
    process.exit(2)
  }
  console.log('Run `pnpm seed:people` to write the records.')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
