/**
 * Everything each company has made, for the catalogue on its profile.
 *
 *   node tools/fetch-company-games.mjs [--limit N] [--only <slug>] [--refresh]
 *   pnpm seed:company-games
 *
 * A studio page that lists only the one game this network happens to have a
 * wiki for is a worse page than the studio's own site. The point of the
 * companies host is that a body of work is context a single game cannot
 * carry - so this harvests the body of work, and the owner was explicit that
 * none of it becomes a wiki: a title here is information on a company page.
 *
 * ## Two sources, because neither one is the whole story
 *
 * **Steam**, for what is on sale now. `store.steampowered.com/search/` takes
 * `developer=` or `publisher=` and returns the whole catalogue in one request,
 * each row carrying the app id, the title, the price in cents, the release
 * date and the review summary. That is the reason to use it rather than
 * `appdetails`, which is rate-limited to roughly two hundred calls per five
 * minutes and would need one call per *title* - three hundred companies of
 * those is hours.
 *
 * **Wikipedia**, for everything before Steam and everything that never
 * reached it. Half of these studios predate the store by a decade and several
 * are console-only; a Capcom profile whose catalogue starts at Resident Evil 5
 * is not a catalogue. Where the article carries a real games table - a Title
 * column and a Year column, headers we can read - it is parsed. Where it does
 * not, the company is skipped rather than guessed at, and the manifest records
 * why. A guessed release year is the fabricated figure this project exists to
 * avoid.
 *
 * ## What is not recorded
 *
 * A blocked endpoint is never written down as an empty answer. Wikipedia
 * answers a burst with `HTTP 200` and a plain-text "You are making too many
 * requests" body - which `JSON.parse` rejects, and which an ordinary
 * try/catch would turn into "this company has no games". So: a non-JSON body
 * is a rate limit, it is retried with backoff, and if it does not clear the
 * sweep stops. Nothing is written for a company we failed to read.
 *
 * The manifest is **merged, never replaced**, and written after every company.
 * A run that dies in the middle costs the run and not the work, and a blocked
 * run cannot shrink the file - which is the guard `tools/fetch-search-queries.mjs`
 * had to grow after a 403 nearly replaced several thousand real searches with
 * a valid empty file.
 */
import fs from 'fs'
import path from 'path'

const IN = path.resolve('src/seed/raw/companies.json')
const OUT = path.resolve('src/seed/raw/company-games.json')

const UA =
  'VellumWikiNetwork/1.0 (game wiki network; non-commercial; company catalogues; contact via the site)'

const arg = (flag, fallback = null) => {
  const at = process.argv.indexOf(flag)
  return at > -1 ? process.argv[at + 1] : fallback
}
const LIMIT = Number(arg('--limit', '0')) || 0
/*
  One slug, or a comma-separated list of them.

  A parse fix does not reach the companies already in the manifest - the
  merge is by design a merge - so re-reading exactly the sixty-three whose
  tables the old reader shifted is the repair, and re-reading all three
  hundred to do it is forty minutes of requests Wikipedia did not need to
  serve.
*/
const ONLY = (arg('--only') ?? '')
  .split(',')
  .map((slug) => slug.trim())
  .filter(Boolean)
const REFRESH = process.argv.includes('--refresh')

/**
 * Sixty titles.
 *
 * Chosen because it is roughly where a catalogue stops being a catalogue and
 * starts being a database dump: Ubisoft and SEGA have several hundred rows on
 * Steam alone, and nobody reads the three hundredth. The count found before
 * the cap is kept as `found`, so the page can say "60 of 214" rather than
 * implying the list is complete.
 */
const CAP = 60

/** Steam returns fifty rows a page; three pages is the most we will ask for. */
const PAGE = 50
const MAX_PAGES = 3

/**
 * Two list articles per company at most.
 *
 * Sega's games section links both "List of Sega arcade games" and "List of
 * Sega video games"; following every link in a section would walk the whole
 * encyclopedia one request at a time.
 */
const MAX_LIST_ARTICLES = 2

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const today = new Date().toISOString().slice(0, 10)

/** Raised when an endpoint is refusing us rather than answering. */
class Blocked extends Error {}

// --- fetching ---------------------------------------------------------------

/**
 * JSON from an endpoint that may be refusing us instead of answering.
 *
 * Both hosts here signal a rate limit with a 200 and a body that is not JSON,
 * so the parse failure *is* the signal and has to be told apart from an empty
 * answer. Four backoffs, then `Blocked` - which stops the sweep rather than
 * recording a company as having no games because we were throttled.
 */
const json = async (url, label) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let response
    try {
      response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    } catch (error) {
      if (attempt === 4) throw new Blocked(`${label}: ${error.message}`)
      await sleep(2000 * 2 ** attempt)
      continue
    }
    const body = await response.text()
    if (response.status === 429 || response.status === 403 || response.status >= 500) {
      /*
        Five seconds doubling, not two. Wikipedia's 429 wants about a minute
        before it will talk again, and a thirty-second ladder ran out while it
        was still saying no - stopping a sweep sixty companies in over a wait
        it had nearly finished.
      */
      if (attempt === 4) throw new Blocked(`${label}: HTTP ${response.status}`)
      await sleep(5000 * 2 ** attempt)
      continue
    }
    if (!response.ok) return null
    try {
      return JSON.parse(body)
    } catch {
      // A 200 that is not JSON is the throttle page, not an answer.
      if (attempt === 4) throw new Blocked(`${label}: ${body.slice(0, 60).replace(/\s+/g, ' ')}`)
      await sleep(3000 * 2 ** attempt)
    }
  }
  return null
}

// --- names ------------------------------------------------------------------

/**
 * The slug the profile is filed under.
 *
 * `src/seed/companies.ts` keys every record on `slugify(plainName(wikipediaTitle))`,
 * so this manifest has to agree exactly or the seeder finds nothing and says
 * nothing about it. Kept identical on purpose; do not "improve" one side.
 */
const plainName = (title) =>
  title.replace(/\s*\((company|division|video game company|developer|publisher)\)\s*$/i, '').trim()

const slugify = (value) =>
  // Identical to `slugify` in src/fields/shared.ts, on purpose. A tidier one
  // here - stripping accents, say - produces a key no company record carries,
  // and the seeder would then skip that company in silence.
  value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Steam's developer filter matches the string the storefront files a game
 * under, which is rarely the one Wikipedia uses for the article. "Tencent
 * Holdings Ltd." finds nothing; "Tencent" finds the catalogue. So the legal
 * suffixes come off and the shortened name is tried when the full one draws a
 * blank - two candidates, not a fuzzy search, because a loose match on a
 * company name puts another company's games on this page.
 */
const LEGAL_SUFFIX =
  /[\s,]+(inc\.?|incorporated|llc|l\.l\.c\.|ltd\.?|limited|plc|corp\.?|corporation|co\.?,?\s*ltd\.?|co\.|company|gmbh|s\.?a\.?s?\.?|a\.?s\.?|ab|oy|oyj|k\.?k\.?|nv|n\.v\.|bv|b\.v\.|pty|holdings?|group|sa|srl|s\.r\.l\.|spa|s\.p\.a\.)$/i

const shorten = (name) => {
  let text = name.trim().replace(/\s*\([^)]*\)\s*$/, '')
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text.replace(LEGAL_SUFFIX, '').trim().replace(/[,\s]+$/, '')
    if (next === text || !next) break
    text = next
  }
  return text
}

/**
 * The strings Steam might file this company under.
 *
 * Steam matches the developer name **exactly, including its case**, which is
 * the difference between forty-three Konami games and none: `developer=Konami`
 * returns zero and `developer=KONAMI` returns the catalogue. Sega, Capcom and
 * Bandai Namco are all shouted on the storefront and written normally
 * everywhere else, and every one of them came back empty on the first run
 * without anything going wrong that a log would show.
 *
 * So: the article's name, the legal name, the legal name with the suffix
 * taken off, and the two shouted forms. All of them are asked and the answers
 * merged, because a company can be filed under several at once.
 */
const steamNames = (articleName, legalName) => {
  const short = shorten(legalName)
  const suffix = legalName.startsWith(short) ? legalName.slice(short.length) : ''
  return [
    ...new Set([
      articleName,
      short,
      legalName,
      articleName.toUpperCase(),
      `${short.toUpperCase()}${suffix}`,
    ]),
  ].filter((name) => name && name.length > 1)
}

/** For matching a Steam title against a Wikipedia one, and both against ours. */
const key = (title) =>
  title
    .normalize('NFKD')
    // NFKD splits an accent off its letter, and the last step below drops it
    // with every other non-alphanumeric - so "Pokemon" on a storefront and
    // "Pokémon" in an article reach the same key, with no combining-mark
    // range to get wrong. Trademark symbols go the same way.
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')

// --- Steam ------------------------------------------------------------------

const STEAM_SEARCH = 'https://store.steampowered.com/search/results/'

/**
 * Steam's own product type, rather than our guess about the title.
 *
 * `category1=998` is the storefront's "Games" type. It is what keeps the
 * soundtracks, art books, demos, edition upgrades and DLC out - Bloober Team's
 * eighteen rows are five games and thirteen of those - and it does it on
 * Steam's classification rather than on a pattern we invented. A filter
 * written to stop bad records is still a filter: an over-broad one throws away
 * good records just as silently, and that is the reason to prefer somebody
 * else's declared type over a regular expression over titles.
 */
const steamUrl = (role, name, start) =>
  `${STEAM_SEARCH}?${new URLSearchParams({
    [role]: name,
    category1: '998',
    ndl: '1',
    cc: 'us',
    l: 'english',
    ignore_preferences: '1',
    start: String(start),
    count: String(PAGE),
    infinite: '1',
  })}`

/**
 * One row per result, sliced out of the page before any field is read.
 *
 * Deliberately not one regular expression across a whole record. A lazy
 * quantifier stepping over an optional group is how the achievement scraper
 * read fifty-two rows and captured a null unlock rate for every one of them,
 * silently: `[\s\S]*?` matches the shortest thing that satisfies the *rest* of
 * the pattern, so it skips the optional part entirely. Each field below is
 * read from its own row's block and from nowhere else.
 */
const rowsOf = (html) => {
  const starts = [
    ...html.matchAll(/<a href="(https:\/\/store\.steampowered\.com\/[^"]+)"\s+data-ds-appid="(\d+)"/g),
  ]
  return starts.map((match, index) => ({
    href: match[1],
    appid: match[2],
    block: html.slice(match.index, index + 1 < starts.length ? starts[index + 1].index : html.length),
  }))
}

const cell = (block, pattern) => {
  const found = block.match(pattern)
  return found ? found[1] : null
}

const entities = (value) =>
  String(value ?? '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, '&')

/**
 * The belt to `category1=998`'s braces.
 *
 * Steam's own type is the filter that does the work; this only catches a row
 * the storefront has typed as a game and titled as something else. It is
 * anchored rather than loose - "Demo" has to be the tail of the title, not a
 * word inside it - because the first version of the entity filter deleted
 * Antar 4, a real moon, for ending in a digit. If this ever starts catching
 * more than a handful, the classification changed and somebody should look;
 * the count is printed at the end of the run for exactly that reason.
 */
const NOT_A_GAME =
  /(\bsoundtrack\b|\bost\b|\bdedicated server\b|\bseason pass\b|\bartbook\b|\bart book\b|[\s-]+(demo|playtest|beta|prologue demo)\s*$|\bedition (content|upgrade)\b|\bupgrade pack\b|\bdigital deluxe upgrade\b)/i

const steamRow = (row) => {
  const block = row.block
  const title = entities(cell(block, /<span class="title">([^<]*)<\/span>/) ?? '').trim()
  if (!title) return null

  const platforms = [...block.matchAll(/platform_img ([a-z_]+)"/g)].map((match) => match[1])
  // A row whose only badge is `music` is an album Steam happened to type as a
  // game. There is no title to show and a price for it would read as a claim.
  if (platforms.length > 0 && platforms.every((name) => name === 'music')) return null
  if (NOT_A_GAME.test(title)) return { rejected: title }

  const released = entities(cell(block, /class="search_released[^"]*">([\s\S]*?)<\/div>/) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const priceCents = cell(block, /class="search_price_discount_combined[^"]*"\s+data-price-final="(-?\d+)"/)
  const shown = entities(cell(block, /class="discount_final_price[^"]*">([^<]*)</) ?? '').trim()
  // The tooltip is "Very Positive<br>86% of the 10,341 user reviews…"; the
  // summary and the count are the parts worth keeping.
  const tooltip = entities(cell(block, /class="search_review_summary[^"]*"\s+data-tooltip-html="([^"]*)"/) ?? '')
  const summary = tooltip.split(/<br\s*\/?>/i)[0]?.trim() || null
  const count = tooltip.match(/of the ([\d,]+) user reviews/)?.[1] ?? null

  const cents = priceCents === null ? null : Number(priceCents)
  const free = /^free/i.test(shown)

  return {
    title,
    appid: row.appid,
    storeUrl: row.href.split('?')[0],
    year: released.match(/\b(\d{4})\b/)?.[1] ?? null,
    released: released || null,
    // Kept as cents as well as text: the text is what a reader sees, the
    // number is what a later run can compare against without re-parsing a
    // currency string.
    priceCents: free ? 0 : cents,
    priceText: free ? 'Free' : shown || (cents ? `$${(cents / 100).toFixed(2)}` : null),
    isFree: free,
    reviews: summary && count ? `${summary} (${count})` : summary,
    platforms: platforms.filter((name) => name !== 'music'),
  }
}

/**
 * A company's Steam catalogue in the role asked for.
 *
 * **Every candidate is asked, and the answers are merged**, rather than
 * stopping at the first that returns anything. Capcom's older games are filed
 * under "Capcom" and its last twenty years under "CAPCOM Co., Ltd." - two
 * strings, one company, and taking the first non-empty answer would have put
 * sixteen titles on a profile that has a hundred and thirty. Steam matches the
 * developer string exactly, so a catalogue split across spellings is split
 * until somebody asks for both.
 *
 * Returns `null` - never an empty list - when no candidate matched at all, so
 * "we asked and Steam has nothing" and "we never managed to ask" stay
 * different things all the way into the manifest.
 */
const steamCatalogue = async (candidates, role, counters) => {
  const kept = []
  const seen = new Set()
  const matched = []
  let total = 0
  let rejected = 0
  let asked = 0

  for (const name of candidates) {
    if (kept.length >= CAP) break
    const first = await json(steamUrl(role, name, 0), `steam ${role}=${name}`)
    await sleep(800)
    asked += 1
    if (!first || first.success !== 1) continue
    const count = Number(first.total_count ?? 0)
    if (count === 0) continue
    total += count
    matched.push(name)

    let pages = 0
    let html = first.results_html ?? ''
    for (;;) {
      pages += 1
      const rows = rowsOf(html)
      for (const row of rows) {
        const parsed = steamRow(row)
        if (!parsed) continue
        if (parsed.rejected) {
          rejected += 1
          counters.rejected.push(parsed.rejected)
          continue
        }
        // The same app can answer to two spellings of the same company.
        if (seen.has(parsed.appid)) continue
        seen.add(parsed.appid)
        kept.push(parsed)
      }
      if (rows.length < PAGE || pages >= MAX_PAGES || kept.length >= CAP) break
      const next = await json(steamUrl(role, name, pages * PAGE), `steam ${role}=${name} p${pages}`)
      await sleep(800)
      if (!next || next.success !== 1) break
      html = next.results_html ?? ''
    }
  }

  if (matched.length === 0) return asked > 0 ? { name: null, total: 0, kept: [], rejected: 0 } : null
  return { name: matched.join(' / '), total, kept, rejected }
}

/**
 * Genre, platforms and Metacritic, for the six companies that made a game we
 * cover.
 *
 * `appdetails` answers one app per call and allows roughly two hundred calls
 * in five minutes, so three hundred companies' worth of titles is hours and
 * the search page above is the whole catalogue in one request. What it does
 * not carry is genre or a Metacritic score - so this runs only where the
 * profile is one a reader arrives at from a wiki, which is the handful with
 * `basis: network-game`, and only over the titles already kept.
 */
const ENRICH_LIMIT = 40

const enrich = async (titles) => {
  let done = 0
  for (const entry of titles) {
    if (!entry.appid || done >= ENRICH_LIMIT) continue
    const data = await json(
      `https://store.steampowered.com/api/appdetails?${new URLSearchParams({ appids: entry.appid, cc: 'us', l: 'english' })}`,
      `appdetails ${entry.appid}`,
    )
    await sleep(1600)
    done += 1
    const detail = data?.[entry.appid]
    if (!detail?.success || !detail.data) continue
    const genres = (detail.data.genres ?? []).map((genre) => genre.description).filter(Boolean)
    if (genres.length > 0) entry.genre = genres.join(', ')
    if (typeof detail.data.metacritic?.score === 'number') entry.metacritic = detail.data.metacritic.score
    const platforms = Object.entries(detail.data.platforms ?? {})
      .filter(([, supported]) => supported)
      .map(([name]) => ({ windows: 'Windows', mac: 'macOS', linux: 'Linux' })[name] ?? name)
    // Only where nothing better is known: an article's platform list names the
    // consoles, and a storefront's names the three it sells on.
    if (!entry.platforms && platforms.length > 0) entry.platforms = platforms.join(', ')
  }
  return done
}

// --- Wikipedia --------------------------------------------------------------

const WIKI = 'https://en.wikipedia.org/w/api.php'

const article = async (title) => {
  const url = `${WIKI}?${new URLSearchParams({
    action: 'parse',
    format: 'json',
    formatversion: '2',
    prop: 'text',
    redirects: '1',
    page: title,
  })}`
  const data = await json(url, `wikipedia ${title}`)
  // Two seconds. One and a third was under the limit for an hour and then was
  // not, and a sweep that has to restart costs more than the wait.
  await sleep(2000)
  if (!data || data.error) return null
  return { title: data.parse?.title ?? title, html: data.parse?.text ?? '' }
}

const text = (html) =>
  entities(
    String(html ?? '')
      // Footnote markers first: they are inside the cell and would otherwise
      // arrive as stray digits glued to a title.
      .replace(/<sup[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, ', ')
      /*
        A list item ends a value even though it has no visible separator.
        Remedy's five founders are five `<li>`s, and stripping the tags with
        nothing in their place produced "Samuli SyvähuokoMarkus MäkiSami
        Nopanen" — which is not a mangled list, it is a name that does not
        exist, printed as though a source had stated it.
      */
      .replace(/<\/(li|p|div|dd|dt)>/gi, ', ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*(,\s*)+/g, ', ')
    // A separator landing in front of a bracket came from a `<br>` inside one
    // list item, not from the end of a value: "Zipline Studios, (2010–2011)".
    .replace(/,\s*\(/g, ' (')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim()

/**
 * The infobox, and only if it is a company's.
 *
 * "Rebel Wolves" redirects to "The Blood of Dawnwalker", whose infobox has a
 * Developer and a Composer and no Founded at all - and reading it as a company
 * would file a game's director as a studio's founder. It is the same failure
 * as a franchise wiki selling a film as a location: the source is real, the
 * *kind* of thing is wrong, and nothing downstream would notice. So the table
 * has to declare itself a company infobox, or carry the labels one has.
 */
const COMPANY_LABELS = /^(founded|founders?|headquarters|industry|type|parent|defunct|formerly)$/i

const infobox = (html) => {
  const at = html.search(/<table class="infobox[^"]*"/)
  if (at === -1) return null
  const end = html.indexOf('</table>', at)
  const table = html.slice(at, end === -1 ? html.length : end)
  const isCompany = /class="infobox[^"]*\bib-company\b/.test(table)

  const fields = {}
  for (const row of table.matchAll(
    /<th[^>]*class="[^"]*infobox-label[^"]*"[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*class="[^"]*infobox-data[^"]*"[^>]*>([\s\S]*?)<\/td>/g,
  )) {
    const label = text(row[1]).toLowerCase().replace(/[^a-z ]/g, '').trim()
    /*
      A same-page anchor in an infobox value is a pointer, not a value. Sega's
      Products field is two links to its own sections, and rendering them as
      text gave the profile "Known for: Mobile, Franchises" - two words no
      source ever offered as a series name, sitting under the one label that
      promises one. The link is dropped whole, text and all, because the text
      is the section heading rather than the fact.
    */
    const value = text(row[2].replace(/<a[^>]*href="#[^"]*"[^>]*>[\s\S]*?<\/a>/g, ' '))
    if (label && value) fields[label] = value
  }

  const labelled = Object.keys(fields).filter((label) => COMPANY_LABELS.test(label)).length
  if (!isCompany && labelled < 2) return null
  return fields
}

/** Section headings a games table could plausibly live under. */
const GAMES_SECTION = /\b(game|games|title|titles|work|works|ludograph|creation|release|releases|software|product|products|portfolio|publications|developed|published)\b/i

const sectionsOf = (html) => {
  const heads = [...html.matchAll(/<div class="mw-heading mw-heading[23][^"]*">\s*<h[23] id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/g)]
  const sections = heads.map((head, index) => ({
    id: head[1],
    label: text(head[2]),
    html: html.slice(head.index, index + 1 < heads.length ? heads[index + 1].index : html.length),
  }))
  /*
    The lead counts. "List of games by Epic Games" puts its whole table above
    the first heading, and slicing only from heading to heading lost every row
    of it while reporting "no readable games table" - a wrong answer that reads
    exactly like a true one. Its empty label keeps it out of the company-article
    pass, which asks for a heading that names games.
  */
  const lead = heads.length > 0 ? html.slice(0, heads[0].index) : html
  return [{ id: '', label: '', html: lead }, ...sections]
}

const TITLE_COLUMN = /^(title|titles|game|games|name|names)$/
const YEAR_COLUMN = /^(year|years|released?|release date|release year|first released?|date)$/
const PLATFORM_COLUMN = /^(platforms?|systems?|consoles?|release platforms?)$/
const ROLE_COLUMN = /^(roles?|credit|credits|involvement|contribution)$/
const DEVELOPER_COLUMN = /^(developers?|developed by)$/
const PUBLISHER_COLUMN = /^(publishers?|published by)$/

/**
 * A table's cells, with the ones a rowspan carries down put back.
 *
 * This is the whole of the Asobo Studio bug. Its table is Year / Game /
 * Publisher / Platform, and a year covering two releases is written once with
 * `rowspan="2"` - so the second row of the pair arrives with three cells, not
 * four. Read by position that shifts every column left by one: the *publisher*
 * lands in the title column, and `/asobo-studio` grew rows for Ubisoft, THQ,
 * Microsoft Studios, Disney Interactive Studios and HIP Interactive, each
 * marked "Developed", while the real game on that row was thrown away. The
 * count said 27 titles and 22 of them were titles.
 *
 * The tell was there in the data and nothing was reading it: every one of
 * those rows had a null year and an empty platform list, because the year cell
 * held a game's name and the platform cell did not exist. Four hundred and
 * thirty-two rows across sixty-three companies carry that signature.
 *
 * `colspan` is handled for the same reason and one other: a cell spanning the
 * whole width is a section divider - "2010s" - not a game, and a row whose
 * only cell spans everything is refused by the caller.
 */
const gridOf = (rowsHtml, columns) => {
  /** column index -> { text, rows left to carry } */
  const carried = new Map()
  return rowsHtml.map((rowHtml) => {
    const own = [...rowHtml.matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/\1>/g)].map((match) => ({
      attrs: match[2],
      text: text(match[3]),
    }))
    const line = new Array(columns).fill(null)
    /*
      Whatever a previous row is still spanning holds its own column, and one
      row of that span is spent here. `rows` counts the rows still to fill, so
      a cell declared with rowspan="2" enters the map owing one.
    */
    for (const [at, cell] of [...carried]) {
      if (at < columns) line[at] = cell.text
      cell.rows -= 1
      if (cell.rows <= 0) carried.delete(at)
    }

    let next = 0
    let spanned = 1
    for (let at = 0; at < columns && next < own.length; at += 1) {
      if (line[at] !== null) continue
      const cell = own[next]
      next += 1
      const rows = Number(cell.attrs.match(/rowspan\s*=\s*"?(\d+)/i)?.[1] ?? 1)
      const cols = Math.min(Number(cell.attrs.match(/colspan\s*=\s*"?(\d+)/i)?.[1] ?? 1), columns - at)
      if (cols > spanned) spanned = cols
      for (let step = 0; step < cols; step += 1) line[at + step] = cell.text
      if (rows > 1) carried.set(at, { text: cell.text, rows: rows - 1 })
      at += cols - 1
    }

    return {
      cells: line.map((cell) => cell ?? ''),
      own: own.length,
      /* Columns that actually received a cell, its own or carried from above. */
      placed: line.filter((cell) => cell !== null).length,
      spanned,
    }
  })
}

/**
 * One games table, or nothing.
 *
 * The headers are the whole guard. Capcom's article carries a wikitable in its
 * games section whose columns are Franchise / First release / Sales - a real
 * table, correctly parsed, and every row of it is a series rather than a game.
 * Requiring a column literally headed Title, Game or Name (and one headed Year
 * or Release) is what tells the two apart, and a table that does not say what
 * its columns are is skipped rather than guessed at.
 */
const parseTable = (tableHtml, company, baseRole) => {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => row[1])
  if (rows.length < 3) return null

  /*
    A parenthetical in a header is a note about the column, not part of its
    name: "Developer(s)", "Platform(s)", "Title (Episodes)". Flattening the
    brackets into spaces instead left "title episodes", which matched nothing,
    and every row of the Epic Games list was dropped for having no title
    column while the table sat there with one.
  */
  const headerCells = [...rows[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((cellHtml) =>
    text(cellHtml[1]).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim(),
  )
  if (headerCells.length < 2) return null

  const column = (pattern) => headerCells.findIndex((header) => pattern.test(header))
  const titleAt = column(TITLE_COLUMN)
  const yearAt = column(YEAR_COLUMN)
  if (titleAt === -1 || yearAt === -1) return null

  const platformAt = column(PLATFORM_COLUMN)
  const roleAt = column(ROLE_COLUMN)
  const developerAt = column(DEVELOPER_COLUMN)
  const publisherAt = column(PUBLISHER_COLUMN)
  const shortName = shorten(company).toLowerCase()

  const out = []
  /*
    `th` and `td` in document order, with rowspans carried down: a sortable
    table with plainrowheaders puts the first column in a `th`, so reading only
    `td`s shifts every column by one and files the year as the title - and a
    row under a spanned cell is short by exactly one cell, which shifts them
    the other way. See `gridOf`.
  */
  for (const row of gridOf(rows.slice(1), headerCells.length)) {
    const cells = row.cells
    /*
      Nothing of its own, or one cell stretched across the table. Both are
      furniture rather than data: a decade heading inside the list, or a row
      the carry has already filled from above with no new fact in it.
    */
    if (row.own === 0) continue
    if (row.own === 1 && row.spanned > 1) continue
    /*
      The original guard, now counting columns filled rather than cells
      written: a row under a rowspan is short in the markup and complete in the
      table, and it was the guard's job to keep out the malformed ones, not
      those.
    */
    if (row.placed < headerCells.length - 1) continue

    const title = (cells[titleAt] ?? '').replace(/\[\d+\]/g, '').trim()
    if (!title || title.length > 120) continue
    if (NOT_A_GAME.test(title)) continue

    const year = (cells[yearAt] ?? '').match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1] ?? null
    const platforms = platformAt > -1 ? (cells[platformAt] ?? '').slice(0, 200) : null

    /*
      Null where nothing states it. Capcom's best-selling-games table has a
      Title, a Year and a Sales figure and says nothing about who did what -
      and defaulting that to "developed" would have put a bare assertion on
      every row of every publisher whose article carries a sales table. The
      seeder fills it from the company's own `role`, which is derived from
      facts the game records state.
    */
    let role = baseRole
    if (roleAt > -1) {
      const stated = (cells[roleAt] ?? '').toLowerCase()
      const developed = /develop/.test(stated)
      const published = /publish/.test(stated)
      role = developed && published ? 'both' : published ? 'publisher' : 'developer'
    } else {
      /*
        The heading is a fact about every row in the table, and the columns can
        only add to it. A "Games developed" table with a Publisher(s) column
        naming Remedy on Control means they developed *and* published it — read
        as columns alone it came out as "published", which says they did not
        make their own game.
      */
      const developed =
        baseRole === 'developer' ||
        (developerAt > -1 && (cells[developerAt] ?? '').toLowerCase().includes(shortName))
      const published =
        baseRole === 'publisher' ||
        (publisherAt > -1 && (cells[publisherAt] ?? '').toLowerCase().includes(shortName))
      role = developed && published ? 'both' : developed ? 'developer' : published ? 'publisher' : null

      /*
        The table says who made each game, and for this row it says somebody
        else. "List of Xbox video games" is a list of games for the console,
        not games Microsoft made, and following it put Diablo, Fallout and
        Overwatch on the Xbox profile with a real source URL behind every one -
        the same shape as a franchise wiki selling the film as a location. A
        table with an attribution column that does not name them is evidence
        against the row, not an absence of evidence.
      */
      if (!role && (developerAt > -1 || publisherAt > -1)) continue
    }

    out.push({ title, year, platforms, role })
  }
  return out.length >= 2 ? out : null
}

/**
 * The list article a games section points at, where there is one.
 *
 * Capcom's games section is a hatnote and a franchise table; the catalogue is
 * on "List of Capcom games". Following the article's own link is better than
 * guessing a title, because the guess is wrong for every company that spells
 * it differently and a 404 costs a request either way.
 */
const listArticlesIn = (sectionHtml) => {
  const titles = []
  for (const link of sectionHtml.matchAll(/<a href="\/wiki\/(List_of_[^"#]+|Lists?_of_games[^"#]*)"/g)) {
    const title = decodeURIComponent(link[1]).replace(/_/g, ' ')
    if (/\b(games|titles|software)\b/i.test(title) && !titles.includes(title)) titles.push(title)
  }
  return titles
}

const tablesIn = (html) => [...html.matchAll(/<table[^>]*class="[^"]*wikitable[\s\S]*?<\/table>/g)].map((match) => match[0])

/**
 * The parts of a list article that are not the list.
 *
 * "List of Xbox video games" ends with a Films table and a TV series table,
 * both headed Title / Release date / Production company - real tables, cleanly
 * parsed, and every row of them a film. An Untitled Sea of Thieves film on a
 * studio's catalogue is the franchise wiki selling the film as a location,
 * arriving through a different door, and nothing downstream would have caught
 * it because the *kind* of thing is wrong rather than the fact.
 *
 * An exclusion list rather than an inclusion one, because a list article is
 * presumed to be about games and the sections that are not say so; an
 * inclusion list would have thrown away the decade headings ("1990s", "2000s")
 * that most of these articles are organised by. Bare "series" is deliberately
 * not in it - that word flagged a real enemy record once already.
 */
const NOT_GAMES_SECTION =
  /\b(films?|movies?|tv series|television series|web series|anime|manga|comics?|novels?|soundtracks?|albums?|merchandise|other media|adaptations?)\b/i

/**
 * Tables from the parts of a page that are about games.
 *
 * A page with no headings at all is taken whole: there is nothing to exclude
 * and skipping it would lose the short list articles that are one table.
 */
const gameTablesIn = (html) =>
  sectionsOf(html)
    .filter((section) => !NOT_GAMES_SECTION.test(section.label))
    .flatMap((section) => tablesIn(section.html).map((table) => ({ table, label: section.label })))

/**
 * The role a heading states, or null.
 *
 * "Games developed" is a claim about every row under it; a bare "Games" is
 * not, and gets no base role rather than a guessed one. Without this the
 * Published games table on a list article had a Developer column naming other
 * studios, nothing naming the publisher, and every row was thrown out as
 * somebody else's - on the one page whose heading said whose they were.
 */
const roleFromHeading = (label) => {
  const developed = /\bdevelop/i.test(label)
  const published = /\bpublish/i.test(label)
  if (developed && !published) return 'developer'
  if (published && !developed) return 'publisher'
  return null
}


const wikipediaTitles = async (companyName, wikipediaTitle, notes) => {
  const page = await article(wikipediaTitle)
  if (!page) return { skipped: 'article could not be read' }

  const box = infobox(page.html)
  if (!box) {
    // Not a company article at all - most often a studio whose name redirects
    // to its one game. Nothing here is about the company, so nothing is taken.
    return { skipped: `not a company article (resolved to "${page.title}")`, history: null }
  }

  const history = historyFrom(box)

  const sections = sectionsOf(page.html).filter((section) => GAMES_SECTION.test(section.label))
  if (sections.length === 0) return { history, skipped: 'no games section on the article' }

  /*
    Every readable table, not the first one.

    A games section routinely holds two - developed and published - and a list
    article splits its catalogue one table per decade. Stopping at the first
    parseable table gave Take-Two Interactive seven titles out of several
    hundred, and gave a company with separate developed and published tables
    only half of what its own article listed.
  */
  const rows = []
  const seen = new Set()
  const usedIn = []
  const add = (parsed, where) => {
    let added = 0
    for (const row of parsed) {
      const id = key(row.title)
      if (!id || seen.has(id)) continue
      seen.add(id)
      rows.push(row)
      added += 1
    }
    if (added > 0 && !usedIn.includes(where)) usedIn.push(where)
  }

  for (const section of sections) {
    for (const table of tablesIn(section.html)) {
      const parsed = parseTable(table, companyName, roleFromHeading(section.label))
      if (parsed) add(parsed, section.label)
    }
  }
  if (rows.length > 0) return { history, article: page.title, table: usedIn.join(', '), rows }

  // Nothing on the article itself: follow what its games section points at.
  const linked = [...new Set(sections.flatMap((section) => listArticlesIn(section.html)))].slice(0, MAX_LIST_ARTICLES)
  if (linked.length === 0) return { history, skipped: 'no readable games table' }

  for (const listTitle of linked) {
    const list = await article(listTitle)
    notes.listArticles += 1
    if (!list) continue
    for (const { table, label } of gameTablesIn(list.html)) {
      const parsed = parseTable(table, companyName, roleFromHeading(label))
      if (parsed) add(parsed, list.title)
    }
    if (rows.length > 0) return { history, article: list.title, table: 'list article', rows }
  }

  return { history, skipped: `${linked.map((title) => `"${title}"`).join(', ')} has no readable games table` }
}

// --- the history fields -----------------------------------------------------

/**
 * Product categories, which an infobox files under the same label as a
 * franchise.
 *
 * Tencent's Products reads "Antivirus software, Artificial intelligence, Video
 * games, Web browsers" and Capcom's reads "Resident Evil, Street Fighter,
 * Monster Hunter". The field is the same field; only one of the two is a
 * series. This is a reviewed list rather than a cleverer rule for the reason
 * `src/lib/harvest.ts` keeps one: two guesses at this kind of thing have
 * already been wrong in both directions, and fifty-odd names somebody can read
 * beats a regular expression nobody can.
 */
const NOT_A_FRANCHISE = new Set(
  [
    'video games', 'video game', 'videogames', 'games', 'video game consoles', 'consoles',
    'computer games', 'pc games', 'mobile games', 'online games', 'arcade games',
    'browser games', 'casual games', 'social games', 'board games', 'card games',
    'toys', 'trading cards', 'anime', 'manga', 'comics', 'films', 'film', 'movies',
    'television', 'tv', 'music', 'books', 'publishing', 'magazines', 'merchandise',
    'software', 'computer software', 'application software', 'middleware', 'operating systems',
    'hardware', 'computer hardware', 'consumer electronics', 'electronics', 'semiconductors',
    'personal computers', 'smartphones', 'mobile phones', 'tablets', 'laptops', 'televisions',
    'cameras', 'audio equipment', 'headphones', 'processors', 'graphics cards',
    'artificial intelligence', 'cloud computing', 'cloud gaming', 'web browsers',
    'antivirus software', 'social media', 'social networking', 'instant messaging',
    'online advertising', 'advertising', 'e-commerce', 'digital distribution',
    'streaming media', 'music streaming', 'video streaming', 'payment systems',
    'financial services', 'insurance', 'banking', 'telecommunications', 'internet',
    'esports', 'amusement parks', 'pachinko', 'pachislot', 'slot machines', 'gambling',
    'theme parks', 'restaurants', 'animation', 'visual effects', 'game engines',
    'semiconductor', 'robotics', 'appliances', 'imaging', 'sensors', 'batteries',
    /*
      What is left of a category once the trailing word comes off, plus the
      bare section names an infobox uses as its own table of contents. Every
      one of these arrived on a real profile: "Known for: Video", "Known for:
      Mobile, Franchises".
    */
    'video', 'online', 'mobile', 'arcade', 'amusement', 'digital', 'consumer',
    'franchises', 'products', 'brands', 'services', 'online services',
    'arcade facilities', 'amusement facilities', 'video game consoles',
    'game consoles', 'consoles', 'game engines', 'engines', 'gaming',
    'role-playing games', 'roleplaying games', 'collectible card games',
    'electronic games', 'strategy games', 'puzzle games', 'action games',
  ].map((value) => value.toLowerCase()),
)

const listOf = (value) =>
  String(value ?? '')
    .split(/,(?![^(]*\))/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

const historyFrom = (box) => {
  const pick = (...labels) => {
    for (const label of labels) {
      const value = box[label]
      if (value && value.trim()) return value.trim()
    }
    return null
  }

  const fate = pick('fate')
  const parent = pick('parent', 'owner')

  /*
    The acquisition, where a source states it as an event rather than as a
    present-tense owner. "Fate: Acquired by Microsoft" is the event; a Parent
    field carrying a year - "Microsoft Gaming (2014-present)" - is the same
    fact written differently. Anything else leaves the field empty, because a
    parent with no date attached says who owns them and not when it happened,
    and inventing the year is the one thing this cannot do.

    The second rule is deliberately narrow: one name and one year, nothing
    else. Remedy's Owner field is its share register — five holders with their
    percentages and an "as of 31 May 2026" — and a loose "does it contain a
    year" test read that as "Remedy was acquired by Markus Mäki", which is
    both false and exactly the kind of false that reads plausibly.
  */
  const OWNER_WITH_YEAR = /^[^,;:(]{2,60}\((?:since\s*|acquired\s*)?(1[89]\d{2}|20\d{2})(?:\s*[–—-]\s*(present|1[89]\d{2}|20\d{2}))?\)$/i
  let acquired = null
  if (fate && /\b(acquired|purchased|bought|merged into|sold to)\b/i.test(fate)) acquired = fate
  else if (parent && OWNER_WITH_YEAR.test(parent.trim())) acquired = parent.trim()

  const products = pick('products', 'brands')
  /*
    An infobox Products field is often a link to the list rather than the list:
    "Complete list of games", "See developed games". Rendered, that reads as a
    franchise called "Complete list of games" - a name no source ever stated,
    on the one field whose label promises a series.
  */
  const POINTER = /^(see|view|complete list|full list|list of|various|others?)\b/i
  /*
    The category test runs on the entry as written *and* on what is left after
    the trailing "series"/"games" comes off, in that order. Testing only the
    trimmed form turned "Video games" into "Video" - which is in no list of
    categories, because it is not a phrase anybody writes - and three profiles
    went out saying they were known for Video.
  */
  const franchises = listOf(products)
    .filter((item) => item && !POINTER.test(item) && !NOT_A_FRANCHISE.has(item.toLowerCase()))
    /*
      "series" and "franchise" come off; "games" does not. Stripping it turned
      "Collectible card games" into "Collectible card" and "Films and
      television series based on video games" into "…based on video" - a
      category was at least true, and a category with its last word missing is
      a phrase no source ever wrote.
    */
    .map((item) => item.replace(/\s+(series|franchise)$/i, '').trim())
    // A franchise has a name, not a description. Anything this long is a
    // sentence about what the company does, which the summary already says.
    .filter((item) => item && item.split(/\s+/).length <= 6 && !NOT_A_FRANCHISE.has(item.toLowerCase()))

  /*
    "18 August 1995; 31 years ago (1995-08-18)" is one date written three
    times by a template. The relative half goes stale the moment it is stored
    and the ISO half is the same fact again, so only the part a source would
    print survives.
  */
  const founded = pick('founded')
  // The same three-ways-round date, on the field that says when a studio
  // closed: "1 October 2010; 15 years ago (2010-10-01)".
  const dateOnly = (value) => (value ? value.split(';')[0].replace(/\s*\([^)]*\)\s*$/, '').trim() || null : null)

  return {
    founded: dateOnly(founded),
    founders: pick('founders', 'founder'),
    formerNames: pick('formerly', 'former name', 'former names', 'formerly called'),
    defunct: dateOnly(pick('defunct')),
    fate,
    parent,
    acquired,
    products,
    // Empty rather than the whole Products field when every entry is a
    // category: "Known for: web browsers" is true of Tencent and useless, and
    // the field's own label promises a series.
    franchises: franchises.length > 0 ? franchises.join(', ') : null,
    headquarters: pick('headquarters'),
    industry: pick('industry'),
  }
}

// --- merge ------------------------------------------------------------------

/**
 * One list out of two sources, with Steam's price on the row Wikipedia dated.
 *
 * Steam knows what a thing costs today; Wikipedia knows that Death Rally came
 * out in 1996 on MS-DOS. A title in both is one row carrying both, marked so
 * the page can say where each half came from.
 */
const PLATFORM_NAME = { win: 'Windows', mac: 'macOS', linux: 'Linux', vr: 'VR' }

const merge = (fromSteam, fromWikipedia) => {
  const byKey = new Map()

  for (const entry of fromSteam) {
    const id = key(entry.title)
    const existing = byKey.get(id)
    if (existing) {
      // The same app under both the developer and the publisher query.
      if (existing.role !== entry.role) existing.role = 'both'
      continue
    }
    byKey.set(id, {
      title: entry.title,
      // Steam's date is when the *store listing* went up. Max Payne came out
      // in 2001 and reached Steam in 2008, and printing 2008 as the year is a
      // wrong fact rather than a missing one — so the article's year wins
      // below where there is one, and this is kept under its own name.
      year: entry.year,
      steamReleased: entry.released,
      role: entry.role,
      appid: entry.appid,
      storeUrl: entry.storeUrl,
      priceCents: entry.priceCents,
      priceText: entry.priceText,
      isFree: entry.isFree,
      reviews: entry.reviews,
      platforms: [...new Set(entry.platforms.map((name) => PLATFORM_NAME[name] ?? name))].join(', ') || null,
      source: 'steam',
    })
  }

  for (const entry of fromWikipedia) {
    const id = key(entry.title)
    const existing = byKey.get(id)
    if (existing) {
      existing.source = 'both'
      if (entry.year) existing.year = entry.year
      // The article lists consoles; the store lists the three it sells on.
      if (entry.platforms) existing.platforms = entry.platforms
      // A null role is "the source did not say", not a third value to combine.
      if (!existing.role) existing.role = entry.role
      else if (entry.role && entry.role !== existing.role) existing.role = 'both'
      continue
    }
    byKey.set(id, {
      title: entry.title,
      year: entry.year,
      role: entry.role,
      platforms: entry.platforms ?? null,
      source: 'wikipedia',
    })
  }

  const all = [...byKey.values()]
  // Steam order first (its relevance ranking puts the known ones at the top),
  // then everything only Wikipedia has, newest first. A catalogue that opens
  // with an art-of book nobody bought is a catalogue nobody reads.
  const onSteam = all.filter((entry) => entry.source !== 'wikipedia')
  const onlyWiki = all
    .filter((entry) => entry.source === 'wikipedia')
    .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))
  return [...onSteam, ...onlyWiki]
}

// --- the run ----------------------------------------------------------------

/**
 * Write the manifest, retrying, because Windows will refuse a file another
 * process has open.
 *
 * A sweep of sixty companies died on its forty-eighth write with `UNKNOWN:
 * unknown error, open …company-games.json` — a virus scanner or the dev
 * server's file watcher holding the handle for a moment. The forty-seven
 * already on disk survived, which is the point of writing after every company,
 * but the fifteen still to read cost another half-hour of requests. The same
 * lesson `tools/reset-db.mjs` carries: on this platform a file operation that
 * fails once is usually a file operation that succeeds a second later.
 */
const save = async (manifest) => {
  const body = `${JSON.stringify(manifest, null, 2)}\n`
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.writeFileSync(OUT, body)
      return
    } catch (error) {
      if (attempt >= 5) throw error
      await sleep(500 * (attempt + 1))
    }
  }
}

const run = async () => {
  const source = JSON.parse(fs.readFileSync(IN, 'utf8'))
  const manifest = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, 'utf8'))
    : { fetchedAt: today, cap: CAP, source: {}, companies: {} }

  manifest.cap = CAP
  manifest.source = {
    steam: 'store.steampowered.com/search — category1=998 (Games), cc=us, prices in USD',
    wikipedia: 'en.wikipedia.org — company infobox and the games table on the article or its list article',
  }
  manifest.companies = manifest.companies ?? {}

  let entries = source.companies
  if (ONLY.length > 0) {
    entries = entries.filter((entry) => ONLY.includes(slugify(plainName(entry.wikipediaTitle))))
    const found = new Set(entries.map((entry) => slugify(plainName(entry.wikipediaTitle))))
    /* Named but not in companies.json — a typo in the list, said out loud
       rather than quietly read as "nothing to do". */
    const missing = ONLY.filter((slug) => !found.has(slug))
    if (missing.length > 0) console.log(`not in companies.json: ${missing.join(', ')}`)
  }
  if (LIMIT) entries = entries.slice(0, LIMIT)

  const counters = { rejected: [] }
  const notes = { listArticles: 0, enriched: 0 }
  let done = 0
  let resumed = 0
  let blocked = null

  for (const entry of entries) {
    const name = plainName(entry.wikipediaTitle)
    const slug = slugify(name)
    if (!slug) continue
    if (!REFRESH && manifest.companies[slug]) {
      resumed += 1
      continue
    }

    const candidates = steamNames(name, entry.name ?? name)

    try {
      const developed = await steamCatalogue(candidates, 'developer', counters)
      const published = await steamCatalogue(candidates, 'publisher', counters)
      const wiki = await wikipediaTitles(name, entry.wikipediaTitle, notes)

      const fromSteam = [
        ...(developed?.kept ?? []).map((row) => ({ ...row, role: 'developer' })),
        ...(published?.kept ?? []).map((row) => ({ ...row, role: 'publisher' })),
      ]
      const merged = merge(fromSteam, wiki.rows ?? [])
      const capped = merged.slice(0, CAP)
      const enriched = entry.basis === 'network-game' ? await enrich(capped) : 0
      notes.enriched += enriched

      manifest.companies[slug] = {
        name,
        wikipediaTitle: entry.wikipediaTitle,
        basis: entry.basis ?? null,
        readAt: today,
        steam:
          developed || published
            ? {
                query: developed?.name ?? published?.name ?? null,
                developerResults: developed?.total ?? null,
                publisherResults: published?.total ?? null,
                kept: (developed?.kept.length ?? 0) + (published?.kept.length ?? 0),
              }
            : // Null, not zero: we asked and Steam returned nothing under any
              // candidate name, which is different from never having asked.
              { query: null, developerResults: 0, publisherResults: 0, kept: 0 },
        wikipedia: wiki.skipped
          ? { skipped: wiki.skipped }
          : { article: wiki.article, table: wiki.table, rows: wiki.rows?.length ?? 0 },
        history: wiki.history ?? null,
        found: merged.length,
        enriched: enriched > 0 ? enriched : undefined,
        titles: capped,
      }
      done += 1
    } catch (error) {
      if (error instanceof Blocked) {
        blocked = error.message
        break
      }
      throw error
    }

    /*
      After every company, not at the end. A rate limit two hundred names in
      should cost the two hundred and first, not the two hundred before it -
      and because this merges into what is already on disk, a blocked run can
      never shrink the manifest.
    */
    await save(manifest)

    /*
      A line per company, while it runs. The first version printed only a
      summary at the end, which on a forty-minute sweep is indistinguishable
      from a hung process - and the one thing worth watching here is whether a
      company came back empty because it has nothing or because a name was
      never matched.
    */
    const written = manifest.companies[slug]
    const wiki = written.wikipedia.skipped ? `wiki: ${written.wikipedia.skipped}` : `wiki: ${written.wikipedia.rows} from ${written.wikipedia.table}`
    console.log(
      `${String(done + resumed).padStart(3)}/${entries.length} ${slug.padEnd(30)} ` +
        `${String(written.titles.length).padStart(3)} titles  ` +
        `steam: ${written.steam.query ?? 'no name matched'} (${written.steam.kept})  ${wiki}`,
    )
  }

  manifest.fetchedAt = today
  await save(manifest)

  const all = Object.values(manifest.companies)
  const withTitles = all.filter((company) => company.titles.length > 0)
  const totalTitles = all.reduce((sum, company) => sum + company.titles.length, 0)

  console.log(`\nread this run: ${done}${resumed ? `, already on file: ${resumed}` : ''}`)
  console.log(`companies in the manifest: ${all.length}`)
  console.log(`  with a catalogue:        ${withTitles.length}`)
  console.log(`  with nothing found:      ${all.length - withTitles.length}`)
  console.log(`titles: ${totalTitles}`)
  console.log(`wikipedia list articles followed: ${notes.listArticles}`)
  console.log(`titles enriched from appdetails (network-game companies only): ${notes.enriched}`)
  console.log(
    `titles rejected by name after Steam's own type filter: ${counters.rejected.length}` +
      (counters.rejected.length > 0 ? ` — ${counters.rejected.slice(0, 10).join('; ')}` : ''),
  )

  if (blocked) {
    console.error(`\nSTOPPED: ${blocked}`)
    console.error('Nothing was written for the company being read. Re-run to resume where it stopped.')
    process.exit(1)
  }
  console.log(`\nWrote ${OUT}. Run \`pnpm seed:company-games\` to put it on the profiles.`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
