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
const KEEP_ARGS =
  /^(start date and age|start date|end date|currency|us\$|usd|inr|jpy|eur|gbp|cny|rmb|krw|aud|cad|chf|sek|val|number|formatnum)$/i

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
        return args.join(' ')
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

const clean = (value) =>
  resolveTemplates(
    String(value ?? '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<ref[^>]*\/>/gi, ''),
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
    const value = clean(part.slice(eq + 1))
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
  const queue = [...ranked]
  for (const name of NETWORK_HOLDERS) if (!queue.includes(name)) queue.push(name)
  const seeded = queue.length
  console.log(`plus this network's own: ${seeded}`)

  // --- 3. harvest, expanding one hop through parent/subsidiaries -----------
  const out = []
  const seen = new Set()
  let expanded = 0

  while (queue.length > 0 && out.length < LIMIT) {
    const title = queue.shift()
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
      website: box.homepage ?? box.website ?? null,
      parents,
      subsidiaries,
      products: box.products ?? null,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
      licence: LICENCE,
      fetchedAt,
      /* Where the name came from, so the site can be honest about selection. */
      basis: ranked.includes(title)
        ? 'revenue-ranking'
        : NETWORK_HOLDERS.includes(title)
          ? 'network-game'
          : 'related-company',
    })

    // One hop outward, and only to fill the quota.
    if (out.length + queue.length < LIMIT) {
      for (const related of [...parents, ...subsidiaries]) {
        if (seen.has(related.toLowerCase()) || queue.includes(related)) continue
        queue.push(related)
        expanded += 1
      }
    }

    if (out.length % 10 === 0) console.log(`  ${out.length} harvested…`)
  }

  console.log(`\nharvested ${out.length} (${expanded} names discovered via parent/subsidiary)`)

  // --- the guard ----------------------------------------------------------
  if (fs.existsSync(OUT)) {
    try {
      const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'))
      const before = previous.companies?.length ?? 0
      if (before > 0 && out.length < before * 0.9) {
        console.error(
          `refusing to write: ${out.length} companies against ${before} already on disk. ` +
            'A harvest that shrinks is a failed harvest, not a smaller world.',
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
}

run().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
