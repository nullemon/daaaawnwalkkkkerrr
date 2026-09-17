/**
 * Company facts for the companies host, from Wikipedia.
 *
 *   node tools/fetch-companies.mjs [--limit 100]
 *
 * ## Where the list comes from
 *
 * "The top 100 most popular gaming companies" is not a thing anyone publishes,
 * because popular is not a measurable quantity. What is published, and cited,
 * is a ranking by revenue — so that article is the spine, and the ranking this
 * network shows means revenue, on the date the list was read, and says so.
 *
 * Three sources of names, in order:
 *
 *   1. **List of largest video game companies by revenue.** Ranked, sourced,
 *      about fifty entries.
 *   2. **The developers and publishers of the games this network covers.**
 *      Already on the site; they belong on this host whatever their revenue.
 *   3. **The parent and subsidiary fields of everything found in 1 and 2.**
 *      This is the useful trick: it reaches a hundred companies without anyone
 *      inventing a list, and every name arrives *because a sourced infobox
 *      named it*, which is also exactly the relationship graph the profiles
 *      need. Sony Interactive Entertainment names Naughty Dog; Embracer names
 *      what it bought.
 *
 * Selection is editorial and the site says so. Every **fact** on a profile
 * comes from that company's own article, cited, with the date it was read.
 *
 * ## Terms
 *
 * Wikipedia is CC BY-SA 4.0 with no mining or AI prohibition, and Wikimedia
 * publishes this API for programmatic use, asking for a descriptive
 * User-Agent and a polite rate. Both below. See the longer note in
 * `fetch-reference-facts.mjs` for why Fextralife and PCGamingWiki are not used.
 *
 * **Logos are not downloaded.** A company logo on Wikipedia is almost always
 * non-free, uploaded under a fair-use rationale that covers Wikipedia and not
 * us. Text under CC BY-SA and a trademark under fair use are different things,
 * and copying the second because the first was fine is how a site gets a
 * letter. The `logo` field stays empty until somebody supplies art we may use.
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const UA =
  'VellumWikiNetwork/1.0 (game wiki network; non-commercial; +https://github.com/) node-fetch'

const API = 'https://en.wikipedia.org/w/api.php'
const OUT = path.resolve('src/seed/raw/companies.json')
const LICENCE = 'CC BY-SA 4.0'
const RANKING_ARTICLE = 'List of largest video game companies by revenue'

const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 100

/** Games this network covers, so their makers are always included. */
const NETWORK_HOLDERS = [
  'Capcom',
  'Konami',
  'Annapurna Interactive',
  'Electronic Arts',
  'Focus Entertainment',
  'Remedy Entertainment',
  'Xbox Game Studios',
  'The Coalition (company)',
  'Bandai Namco Entertainment',
  'Rebel Wolves',
  'Asobo Studio',
  'Bit Reactor',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const get = async (params, attempt = 0) => {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (response.status === 429 || response.status === 403) {
      // Terminal, not retryable. The lesson from tools/fetch-search-queries.mjs:
      // a retry loop turns a rate limit into a silently empty harvest.
      throw Object.assign(new Error(`HTTP ${response.status}`), { terminal: true })
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    if (error.terminal) throw error
    if (attempt < 2) {
      await sleep(1500 * (attempt + 1))
      return get(params, attempt + 1)
    }
    return null
  }
}

// --- wikitext ---------------------------------------------------------------

/**
 * Wikitext to a plain sentence.
 *
 * Infobox values nest templates several deep — a {{ubl}} of {{nowrap}}s each
 * holding a {{cite}} — and a single pass that deletes `{{...}}` leaves the
 * outer braces behind and swallows whatever the inner one held. Tencent's
 * revenue came out as "(2025)" that way, and two named CEOs came out as
 * "(president and CEO)}}" with the names gone.
 *
 * So templates are resolved innermost-first, repeatedly, until none is left:
 * list templates give up their arguments, date and money ones give up the
 * figure, and anything unrecognised is dropped whole rather than half-deleted.
 */
const LIST_TEMPLATES =
  /^(ubl|unbulleted list|plainlist|flatlist|hlist|nowrap|nobold|small|smaller|nowraplinks)$/i
/*
  Templates whose arguments are the fact, rather than decoration around it.

  The currency list was written as ISO codes, which is how the money templates
  on a *company* article are usually named - and is not how they are named on
  a European one. Remedy's revenue is `{{Increase}} {{€|59.5 million}} (2025)`
  and Asobo's is `{{Euro|7 million|link=yes}}`: neither `€` nor `Euro` was in
  this list, so the template was dropped whole and what survived was the
  parenthesised year. Six companies stored a revenue of literally "(2025)".

  It is the same failure the innermost-first resolution was written to fix,
  arriving through the other door: that one lost the inside of a template it
  half-deleted, this one loses the inside of a template it does not recognise.
  A name missing from this list is silent by construction, so the list holds
  the symbol forms as well as the codes, and `clean()` now says when a value
  came out as nothing but a year.
*/
const KEEP_ARGS =
  /^(start date and age|start date|end date|currency|us\$|usd|inr|jpy|eur|gbp|cny|rmb|krw|aud|cad|chf|sek|try|brl|rub|val|number|formatnum|url|circa|c\.|approx|increase|decrease|euro|pound sterling|yen|yuan|renminbi|won|rupee|dollar|aud\$|nz\$|hk\$|€|£|¥|₹|₩|$|a\$|c\$|nt\$|r\$|₽|₺|kr|zl|zł)$/i

/**
 * Entities survive the wikitext because they are HTML, not wiki markup.
 *
 * `{{US$|8.0&nbsp;billion}}` came out as the literal "8.0&nbsp;billion" on
 * five revenue figures, which is the kind of thing a reader notices and an
 * author never does, because it only appears once the templates around it
 * have been stripped.
 */
const decodeEntities = (value) =>
  value
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    /* Last, so an escaped ampersand cannot re-form another entity. */
    .replace(/&amp;/gi, '&')

/**
 * Split a template body on its own pipes, leaving a piped link intact.
 *
 * `{{ubl|[[Chief executive officer|CEO]]}}` splits into one argument, not two.
 * Splitting naively made every CEO field read "Chief executive officer, CEO",
 * because the link's own pipe was read as an argument separator and both
 * halves survived.
 */
const splitArgs = (body) => {
  const parts = []
  let buffer = ''
  let depth = 0
  for (let index = 0; index < body.length; index += 1) {
    if (body.startsWith('[[', index)) depth += 1
    if (body.startsWith(']]', index)) depth -= 1
    const character = body[index]
    if (character === '|' && depth <= 0) {
      parts.push(buffer)
      buffer = ''
    } else buffer += character
  }
  parts.push(buffer)
  return parts
}

const resolveTemplates = (input) => {
  let text = input
  for (let pass = 0; pass < 12; pass += 1) {
    // Innermost templates only: no braces inside the body.
    const next = text.replace(/\{\{([^{}]*)\}\}/g, (_, body) => {
      const parts = splitArgs(body)
      const name = (parts[0] ?? '').trim()
      const args = parts
        .slice(1)
        .map((part) => part.trim())
        .filter(Boolean)
        // Named arguments in these templates are formatting, not content.
        .filter((part) => !/^[a-z_]+\s*=/i.test(part))

      if (LIST_TEMPLATES.test(name)) return args.join(', ')
      if (KEEP_ARGS.test(name)) {
        // {{start date and age|1983|6|11}} — the year is the fact.
        if (/^(start|end) date/i.test(name)) return args[0] ?? ''
        /*
          Positional arguments only. `{{Euro|7 million|link=yes}}` would
          otherwise render as "7 million link=yes", which is the kind of thing
          that reads as a typo on the page and as a parser bug nowhere.
        */
        return args.filter((arg) => !/^[a-z_][a-z0-9_ -]*=/i.test(arg.trim())).join(' ')
      }
      // Growth arrows, flag icons, citations and the rest carry nothing.
      return ' '
    })
    if (next === text) break
    text = next
  }
  // Anything still unbalanced after twelve passes is not worth showing.
  return text.replace(/\{\{|\}\}/g, ' ')
}

/*
  Values that survived the template pass as nothing but a date.

  A dropped template is silent: the arguments vanish and whatever sat outside
  the braces looks like a complete answer. `{{€|59.5 million}} (2025)` became
  "(2025)" and was stored, ranked and rendered as a revenue figure. Collected
  here and printed at the end of the run, so the next unrecognised template
  shows up as a line of output rather than as six quietly wrong companies.
*/
export const suspectValues = []
const YEAR_ONLY = /^\(?\s*(c\.|circa)?\s*\d{4}(\s*[-–]\s*\d{2,4})?\s*\)?$/

const note = (field, before, after) => {
  if (after === '' && before.trim() !== '') suspectValues.push({ field, before, after })
  else if (YEAR_ONLY.test(after) && !/^\d{4}$/.test(before.trim())) {
    suspectValues.push({ field, before, after })
  }
  return after
}

export const clean = (value) =>
  decodeEntities(
    resolveTemplates(
      String(value ?? '')
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<ref[^>]*\/>/gi, ''),
    ),
  )
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
    // A surviving pipe is a list separator, not punctuation.
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim()


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

const companyInfobox = (wikitext) => {
  const start = wikitext.search(/\{\{\s*Infobox\s+(company|video game company)/i)
  if (start === -1) return {}
  let nesting = 0
  let end = start
  for (let index = start; index < wikitext.length; index += 1) {
    if (wikitext.startsWith('{{', index)) nesting += 1
    if (wikitext.startsWith('}}', index)) {
      nesting -= 1
      if (nesting === 0) {
        end = index
        break
      }
    }
  }
  const body = wikitext.slice(start + 2, end)
  const fields = {}
  for (const part of topLevelParts(body).slice(1)) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const raw = part.slice(eq + 1)
    const value = note(key, raw, clean(raw))
    if (key && value) fields[key] = value
  }
  return fields
}

/** Article titles linked from a field, before `clean` flattens them. */
const linkedNames = (raw) =>
  [...String(raw ?? '').matchAll(/\[\[([^\]|#]+)/g)]
    .map((match) => match[1].trim())
    .filter((name) => name && !/^(File|Image|Category|Template):/i.test(name))

const rawField = (wikitext, key) => {
  const start = wikitext.search(/\{\{\s*Infobox\s+(company|video game company)/i)
  if (start === -1) return ''
  const body = wikitext.slice(start)
  const match = body.match(new RegExp(`\\|\\s*${key}\\s*=([\\s\\S]*?)\\n\\s*\\|`, 'i'))
  return match ? match[1] : ''
}

// --- the run ----------------------------------------------------------------

/**
 * A logo file's real licence, from Commons.
 *
 * The first version of this tool downloaded nothing, on the assumption that a
 * company logo is non-free. That is true of the ones uploaded locally to
 * en.wikipedia under a fair-use rationale - and false of most of the ones on
 * Commons, because a logo made of type and flat shapes is usually below the
 * threshold of originality and therefore public domain. Electronic Arts and
 * Capcom both are.
 *
 * So rather than assume either way, ask: Commons publishes the licence in
 * `extmetadata`. Free files are taken and credited with the licence they
 * actually carry; anything marked non-free, or not on Commons at all, is left
 * alone and the reason recorded.
 */
const FREE_LICENCE = /^(public domain|cc[ -]|pd-|no restrictions)/i

const logoLicence = async (filename) => {
  if (!filename) return null
  const clean = filename.replace(/^File:/i, '').replace(/_/g, ' ').trim()
  if (!clean) return null

  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    /*
      Ask for a rendered thumbnail as well as the original. Most of these
      logos are SVG, and Payload cannot read an SVG's dimensions - it throws
      "unable to determine dimensions" and the upload fails, which is why the
      first run got ten logos out of a hundred and twenty-five free ones.
      Commons rasterises on request, so `thumburl` is a PNG it can handle.
    */
    iiurlwidth: '512',
    titles: `File:${clean}`,
  })}`

  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!response.ok) return null
    const data = await response.json()
    const page = data?.query?.pages && Object.values(data.query.pages)[0]
    if (!page || page.missing !== undefined) {
      return { file: clean, free: false, reason: 'not on Commons — likely non-free on en.wikipedia' }
    }
    const info = page.imageinfo?.[0]
    const meta = info?.extmetadata ?? {}
    const licence = meta.LicenseShortName?.value ?? ''
    const nonFree = String(meta.NonFree?.value ?? '') === '1'
    const artist = String(meta.Artist?.value ?? '')
      .replace(/<[^>]*>/g, '')
      .trim()
    const free = !nonFree && FREE_LICENCE.test(licence)
    return {
      file: clean,
      free,
      licence: licence || null,
      artist: artist || null,
      /*
        Prefer the rendered thumbnail: it is a PNG even when the original is
        an SVG, which is the only form the upload pipeline can measure. Fall
        back to the original for files that are already raster. The API
        decorates URLs with campaign parameters; the file is the file.
      */
      url: free ? String(info?.thumburl || info?.url || '').split('?')[0] || null : null,
      reason: free ? null : `licence "${licence || 'unknown'}" does not permit reuse here`,
    }
  } catch {
    return null
  }
}

/**
 * One address out of a website field.
 *
 * `{{URL|https://www.tencent.com/|tencent.com}}` carries the link and the text
 * to show for it, and keeping both produced "https://www.tencent.com/
 * tencent.com". Take the first thing that is actually an address, and give a
 * bare domain the scheme it needs to be a working link.
 */
const tidyUrl = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return null

  const withScheme = text.match(/https?:\/\/[^\s,]+/i)
  if (withScheme) return withScheme[0].replace(/[.,;]+$/, '')

  const bare = text.match(/(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s,]*)?/i)
  return bare ? `https://${bare[0].replace(/[.,;]+$/, '')}` : null
}

const fetchArticle = async (title) => {
  const data = await get({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1',
    titles: title,
  })
  const page = data?.query?.pages && Object.values(data.query.pages)[0]
  if (!page || page.missing !== undefined) return null
  return {
    title: page.title,
    wikitext: page.revisions?.[0]?.slots?.main?.['*'] ?? '',
  }
}

const run = async () => {
  const fetchedAt = new Date().toISOString().slice(0, 10)

  // --- 1. the ranked spine -------------------------------------------------
  const ranking = await fetchArticle(RANKING_ARTICLE)
  if (!ranking) {
    console.error('could not read the ranking article; nothing written')
    process.exit(1)
  }
  const ranked = []
  for (const name of [...ranking.wikitext.matchAll(/\|\s*\[\[([^\]|#]+)/g)].map((m) => m[1].trim())) {
    if (!name || /^(File|Image|Category):/i.test(name)) continue
    if (!ranked.includes(name)) ranked.push(name)
  }
  console.log(`ranked by revenue: ${ranked.length}`)

  // --- 2. plus the makers of the games we cover ----------------------------
  /*
    Two queues, because order decides what a 300-company harvest contains.

    The ranked companies and our own, plus whatever their infoboxes name, go
    in the priority queue. The categories are filler. With one queue the
    thousand category members sat in front of every discovered relative, so
    the corporate graph - the reason to have a hundred of these rather than
    fifty - never got harvested at all.
  */
  const priority = [...ranked]
  for (const name of NETWORK_HOLDERS) if (!priority.includes(name)) priority.push(name)
  const filler = []
  console.log(`plus this network's own: ${priority.length}`)

  /*
    --- 2b. plus Wikipedia's own gaming-company categories ------------------

    Definitionally on-topic, which the revenue list and the corporate graph
    are not on their own: the ranking stops at fifty, and expanding the graph
    any further than one hop walks out of the industry entirely. A category
    called "Video game development companies" cannot drift, because membership
    of it is the claim.

    They seed but never expand. Their parents and subsidiaries would be a
    second hop, which is the thing that produced an exam board last time.
  */
  const categories = ['Video game development companies', 'Video game publishers']
  const fromCategory = new Set()
  for (const category of categories) {
    const data = await get({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '500',
      cmnamespace: '0',
    })
    for (const member of data?.query?.categorymembers ?? []) {
      const title = String(member.title)
      if (!title || priority.includes(title) || filler.includes(title)) continue
      filler.push(title)
      fromCategory.add(title)
    }
    await sleep(350)
  }
  console.log(`plus gaming-company categories: ${fromCategory.size}`)

  // --- 3. harvest, expanding one hop through parent/subsidiaries -----------
  /** Why a name is in the harvest, which also decides whether it expands. */
  const basisFor = (title) =>
    ranked.includes(title)
      ? 'revenue-ranking'
      : NETWORK_HOLDERS.includes(title)
        ? 'network-game'
        : fromCategory.has(title)
          ? 'gaming-category'
          : 'related-company'

  const out = []
  const seen = new Set()
  let expanded = 0

  while ((priority.length > 0 || filler.length > 0) && out.length < LIMIT) {
    const title = priority.shift() ?? filler.shift()
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const article = await fetchArticle(title)
    await sleep(350)
    if (!article) {
      console.log(`  ${title}: no article`)
      continue
    }
    const box = companyInfobox(article.wikitext)
    if (Object.keys(box).length === 0) {
      console.log(`  ${article.title}: no company infobox, skipped`)
      continue
    }

    const logo = await logoLicence(box.logo)
    if (logo) await sleep(200)

    const parents = linkedNames(rawField(article.wikitext, 'parent'))
    const subsidiaries = linkedNames(rawField(article.wikitext, 'subsid'))
      .concat(linkedNames(rawField(article.wikitext, 'subsidiaries')))
      .concat(linkedNames(rawField(article.wikitext, 'divisions')))

    out.push({
      wikipediaTitle: article.title,
      name: box.name || article.title,
      founded: box.founded ?? null,
      founder: box.founder ?? null,
      headquarters: box.hq_location ?? box.hq_location_city ?? box.location ?? null,
      country: box.hq_location_country ?? null,
      industry: box.industry ?? null,
      type: box.type ?? null,
      keyPeople: box.key_people ?? null,
      employees: box.num_employees ?? null,
      employeesYear: box.num_employees_year ?? null,
      revenue: box.revenue ?? null,
      revenueYear: box.fiscal_year ?? null,
      website: tidyUrl(box.homepage ?? box.website ?? box.url),
      parents,
      subsidiaries,
      products: box.products ?? null,
      logo,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
      licence: LICENCE,
      fetchedAt,
      /* Where the name came from, so the site can be honest about selection. */
      basis: basisFor(title),
    })

    /*
      One hop, and one hop only.

      Letting discovered companies expand in turn walks straight out of the
      industry: Sony names Sony Music, which names Universal Music, which
      eventually named an exam board and a cable TV service. Filtering the
      results by industry afterwards is not the fix either - Tencent, Nexon,
      Square Enix and Embracer all describe themselves as conglomerates or
      leave the field empty, so that rule deletes the very companies this is
      for.

      Expanding only from the seeded set keeps what was asked for - the
      corporate structure *of gaming companies* - and nothing further out.
    */
    const isSeed = ['revenue-ranking', 'network-game'].includes(basisFor(title))
    if (isSeed) {
      for (const related of [...parents, ...subsidiaries]) {
        if (seen.has(related.toLowerCase()) || priority.includes(related)) continue
        priority.push(related)
        expanded += 1
      }
    }

    if (out.length % 10 === 0) console.log(`  ${out.length} harvested…`)
  }

  const freeLogos = out.filter((entry) => entry.logo?.free).length
  const blockedLogos = out.filter((entry) => entry.logo && !entry.logo.free).length
  console.log(`\nharvested ${out.length} (${expanded} names discovered via parent/subsidiary)`)
  console.log(
    `logos: ${freeLogos} freely licensed, ${blockedLogos} left alone as non-free, ` +
      `${out.length - freeLogos - blockedLogos} with none named`,
  )

  // --- the guard ----------------------------------------------------------
  if (fs.existsSync(OUT)) {
    try {
      const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'))
      const before = previous.companies?.length ?? 0
      if (before > 0 && out.length < before * 0.9 && !process.argv.includes('--allow-shrink')) {
        console.error(
          `refusing to write: ${out.length} companies against ${before} already on disk. ` +
            'A harvest that shrinks is a failed harvest, not a smaller world. ' +
            'Pass --allow-shrink if the narrowing is deliberate.',
        )
        process.exit(1)
      }
    } catch {
      // An unreadable previous file is not a reason to refuse a good one.
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        fetchedAt,
        licence: LICENCE,
        ranking: {
          title: RANKING_ARTICLE,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(RANKING_ARTICLE.replace(/ /g, '_'))}`,
        },
        companies: out,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`wrote ${OUT}`)

  /*
    The values that came back as nothing, or as nothing but a year. Printed
    rather than thrown: an unrecognised template is a gap in KEEP_ARGS, and the
    run's other three hundred companies are still worth writing. But it must be
    visible — six revenues reading "(2025)" sat in the database for weeks
    because a dropped template leaves no trace of itself.
  */
  if (suspectValues.length > 0) {
    console.log(`
${suspectValues.length} value${suspectValues.length === 1 ? '' : 's'} lost to a template this parser does not know:`)
    for (const row of suspectValues.slice(0, 20)) {
      console.log(`  ${row.field.padEnd(18)} ${JSON.stringify(row.after)}  <-  ${row.before.trim().slice(0, 90)}`)
    }
    if (suspectValues.length > 20) console.log(`  ...and ${suspectValues.length - 20} more`)
    console.log('Add the template name to KEEP_ARGS and re-run.')
  }
}

/*
  Only when run, not when imported.

  `clean` and its template resolver are the part of this file most worth
  testing and the part hardest to reach: a bad revenue figure is invisible in
  the output and shows up weeks later on a page. Guarding the entry point lets
  `tools/fetch-companies.test.mjs` import the function without starting a
  three-hundred-article harvest as a side effect.
*/
const invokedDirectly =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  run().catch((error) => {
    console.error(error.message ?? error)
    process.exit(1)
  })
}
