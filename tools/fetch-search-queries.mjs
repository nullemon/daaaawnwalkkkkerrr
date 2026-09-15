/**
 * Harvests what people actually search for about each game.
 *
 *   node tools/fetch-search-queries.mjs                    # every game
 *   node tools/fetch-search-queries.mjs onimusha-way-of-the-sword
 *
 * ## Why autocomplete and not Google Trends
 *
 * Trends has no public API. The endpoint its own page calls answers 429 to
 * anything without a browser session, and scraping a signed-in interface is
 * both fragile and rude.
 *
 * Autocomplete is open, and for this job it is the better source anyway.
 * Trends ranks a handful of rising queries; autocomplete returns the actual
 * long tail — "blood of dawnwalker how long to beat", "how many endings",
 * "how big is the map" — which is what an article gets written against. It is
 * the same underlying thing Trends' "related queries" panel shows, without the
 * sampling.
 *
 * ## How the sweep works
 *
 * Each game is queried with question stems ("how", "where", "is", "can you"),
 * intent words ("guide", "best", "all"), and then the alphabet — "<game> a",
 * "<game> b" and so on. The alphabet pass is what surfaces the tail: Google
 * completes each prefix with its most-searched continuations, so twenty-six
 * cheap requests return far more than twenty-six guessed phrases would.
 *
 * Writes `src/seed/raw/queries/<slug>.json`.
 */
import fs from 'fs'
import path from 'path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const OUT_DIR = path.resolve('src/seed/raw/queries')
const RAW_GAMES = path.resolve('src/seed/raw/games')

/**
 * What to search as, per game.
 *
 * `terms` are the phrasings a person would actually type. Dawnwalker is
 * searched as "blood of dawnwalker" far more than by its full title, and
 * "gears of war e day" outweighs the punctuated form — so the seeds are the
 * spoken names, not the marketing ones.
 */
const GAMES = {
  dawnwalker: ['blood of dawnwalker', 'dawnwalker'],
  'onimusha-way-of-the-sword': ['onimusha way of the sword', 'onimusha'],
  'control-resonant': ['control resonant', 'control 2'],
  'resonance-a-plague-tale-legacy': ['a plague tale resonance', 'plague tale legacy'],
  'gears-of-war-e-day': ['gears of war e day', 'gears e day'],
  'phantom-blade-zero': ['phantom blade zero'],
  'silent-hill-townfall': ['silent hill townfall'],
  'star-wars-zero-company': ['star wars zero company', 'zero company'],
}

/**
 * What to append to each game's name before asking for completions.
 *
 * Three layers, each returning a different shape of query:
 *
 *   Question stems   the long tail — "how many endings", "where is".
 *   Intent words     commercial and comparison searches — "vs", "worth it".
 *   The alphabet     everything else. Google completes each prefix with its
 *                    most-searched continuations, so cheap requests return far
 *                    more than guessed phrases would.
 *
 * The two-letter pairs are the deepest layer. A single letter's ten slots are
 * taken by the most popular terms; "…ac", "…be" reach past them, which is
 * where the genuinely specific questions live.
 */
const STEMS = [
  '',
  'how', 'how to', 'how long', 'how many', 'how big', 'how much', 'how hard',
  'where', 'where is', 'where to', 'what', 'what is', 'what are', 'what happens',
  'when', 'when does', 'when is', 'why', 'which', 'who',
  'is', 'is it', 'are', 'does', 'do', 'can', 'can you', 'should', 'will',
  'best', 'worst', 'all', 'every', 'list of', 'number of',
  'guide', 'walkthrough', 'tips', 'tricks', 'help', 'explained',
  'vs', 'or', 'like', 'compared to', 'similar',
  'review', 'worth it', 'price', 'cheapest', 'free', 'deal',
  'release', 'gameplay', 'story', 'ending', 'characters', 'bosses',
  'weapons', 'items', 'map', 'length', 'difficulty', 'settings',
  'pc', 'ps5', 'xbox', 'switch', 'steam', 'requirements', 'fps', 'mods',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'abcdefghijklmnopqrstuvwxyz'
    .split('')
    .flatMap((first) => ['a', 'e', 'i', 'o', 'u', 'r', 'l'].map((second) => first + second)),
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const suggest = async (phrase, locale = 'en', attempt = 0) => {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${locale}&q=${encodeURIComponent(phrase)}`
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json()
    return Array.isArray(body?.[1]) ? body[1] : []
  } catch (error) {
    if (attempt < 2) {
      await sleep(900 * (attempt + 1))
      return suggest(phrase, locale, attempt + 1)
    }
    return []
  }
}

const only = process.argv[2]
fs.mkdirSync(OUT_DIR, { recursive: true })

for (const [slug, terms] of Object.entries(GAMES)) {
  if (only && only !== slug) continue

  process.stdout.write(`\n${slug}\n`)

  /** query -> how many different stems produced it, a rough popularity proxy. */
  const seen = new Map()

  // The longest word in each term: "dawnwalker", not "blood"; "onimusha", not
  // "way". Short words are common nouns that match half the internet.
  const distinctive = [
    ...new Set(
      terms.flatMap((term) =>
        term
          .split(' ')
          .filter((word) => word.length >= 5)
          .sort((a, b) => b.length - a.length)
          .slice(0, 2),
      ),
    ),
  ]

  for (const term of terms) {
    for (const stem of STEMS) {
      const phrase = stem ? `${term} ${stem}` : term
      // Two locales: the same prefix ranks differently in en and en-GB, and
      // the tails barely overlap.
      const results = [...(await suggest(phrase, 'en')), ...(await suggest(phrase, 'en-GB'))]

      for (const raw of results) {
        const query = String(raw).toLowerCase().trim()
        if (query.length < 8 || query.length > 90) continue
        /*
          Must still be about this game.

          Matching on the first word of a term is not enough: "blood of
          dawnwalker" starts with "blood", so Google's completions brought back
          "how to see blood in valorant". The test is the distinctive token —
          the longest word in the term, which is the game's actual name rather
          than a common noun in front of it.
        */
        if (!distinctive.some((token) => query.includes(token))) continue
        seen.set(query, (seen.get(query) ?? 0) + 1)
      }

      // Autocomplete is generous but not free.
      await sleep(160)
    }
    process.stdout.write(`  "${term}": ${seen.size} unique so far\n`)
  }

  const queries = [...seen.entries()]
    .map(([query, weight]) => ({ query, weight }))
    .sort((a, b) => b.weight - a.weight || a.query.localeCompare(b.query))

  fs.writeFileSync(
    path.join(OUT_DIR, `${slug}.json`),
    `${JSON.stringify(
      { slug, fetchedAt: new Date().toISOString().slice(0, 10), terms, queries },
      null,
      2,
    )}\n`,
  )

  console.log(`  => ${queries.length} distinct queries`)
  console.log(`     top: ${queries.slice(0, 5).map((q) => q.query).join(' | ')}`)
}

console.log('\nWritten to src/seed/raw/queries/')
