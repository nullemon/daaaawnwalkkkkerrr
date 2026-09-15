import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'
import { GAME_SCOPED } from '../lib/tenancy'
import { slugify } from '../fields/shared'

/**
 * Writes an article for each thing people actually search about each game.
 *
 *   pnpm seed:articles
 *
 * ## Where the topics come from
 *
 * `tools/fetch-search-queries.mjs` harvests Google's own autocomplete — 4,200
 * real queries across the eight games. Not guesses at what people might want:
 * the phrasings Google records them typing.
 *
 * Those get bucketed into topics below. A topic is written **only if this
 * database can answer it**. "Gears of War E-Day system requirements" is
 * answerable, because the store page states them. "How long is Gears of War
 * E-Day" is not, because nobody has finished a game that is not out, and an
 * article guessing at it is the exact thing this network exists not to be.
 *
 * Unanswerable topics are not silently dropped — they are written into the
 * requests queue as a content backlog, so the admin shows what readers want
 * and nobody has yet written.
 *
 * ## The title is the query
 *
 * Each article is titled with the most-searched phrasing in its bucket rather
 * than a tidied-up version. "Is Star Wars Zero Company like XCOM" is what
 * people type; "Zero Company: tactical combat compared" is what a content
 * marketer would write, and it matches nothing.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const QUERY_DIR = path.join(dirname, 'raw', 'queries')
const GAME_DIR = path.join(dirname, 'raw', 'games')
const ART_DIR = path.resolve('assets/_games')

type Query = { query: string; weight: number }
type Harvest = { slug: string; fetchedAt: string; terms: string[]; queries: Query[] }

type RawGame = {
  slug: string
  title: string
  storeUrl: string
  fetchedAt: string
  developers: string[]
  publishers: string[]
  releaseDate: string | null
  comingSoon: boolean
  genres: string[]
  categories: string[]
  languages: string
  platforms: string[]
  requirements: { minimum: { label: string; value: string }[]; recommended: { label: string; value: string }[] }
  editions: { title: string; priceText: string | null }[]
  achievements: unknown[]
}

/** Facts this database holds about one game, gathered once. */
type Facts = {
  name: string
  full: string
  raw?: RawGame
  counts: Record<string, number>
  sources: { title: string; url: string; retrieved: string }[]
}

const prettyDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const list = (values: string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`

/** Does the store page declare a feature? Steam's category strings are exact. */
const hasCategory = (facts: Facts, pattern: RegExp) =>
  (facts.raw?.categories ?? []).some((category) => pattern.test(category))

/**
 * A topic: which queries it answers, and how to write it.
 *
 * `build` returns null when this particular game cannot answer it, which is
 * how a wiki for an unreleased game ends up with eight articles instead of
 * fourteen rather than six invented ones.
 */
type Topic = {
  id: string
  match: RegExp
  build: (facts: Facts, queries: string[]) => {
    title: string
    summary: string
    blocks: Block[]
    keywords: string[]
  } | null
}

const TOPICS: Topic[] = [
  {
    id: 'release-date',
    match: /\b(release date|come out|launch|when is|when does|out on|release time)\b/,
    build: (facts) => {
      const date = prettyDate(facts.raw?.releaseDate)
      if (!date) return null
      const out = !facts.raw?.comingSoon
      return {
        title: `${facts.name} release date: when does it come out?`,
        summary: `${facts.full} ${out ? 'released' : 'releases'} on ${date}. Confirmed on the publisher's own store page, with the platforms it is listed for.`,
        keywords: [`${facts.name} release date`, `when does ${facts.name} come out`],
        blocks: [
          `${facts.full} ${out ? 'released' : 'is scheduled for'} **${date}**. That date is taken from the publisher's own store listing rather than from a news report, and this page is rewritten whenever the listing changes.`,
          { h: 'What is confirmed' },
          {
            ul: [
              `${out ? 'Released' : 'Expected'}: ${date}`,
              `Developer: ${list(facts.raw?.developers ?? [])}`,
              `Publisher: ${list(facts.raw?.publishers ?? [])}`,
              ...(facts.raw?.genres.length ? [`Genre: ${list(facts.raw.genres)}`] : []),
            ],
          },
          { h: 'Why a date can still move' },
          out
            ? 'It is out, so this one is settled. What does still change is the platform list — console versions are often dated separately and appear on the store page later.'
            : 'A dated listing is a commitment, not a guarantee, and publishers move them. The date above is what the store page says today; if it slips, this page changes with it rather than keeping an old promise.',
        ],
      }
    },
  },

  {
    id: 'platforms',
    match: /\b(ps5|ps4|playstation|xbox|switch|steam deck|game pass|pc|platforms?|console|exclusive)\b/,
    build: (facts) => {
      if (!facts.raw) return null
      const deck = hasCategory(facts, /steam deck/i)
      return {
        title: `What platforms is ${facts.name} on?`,
        summary: `${facts.full} is confirmed for ${list(facts.raw.platforms.map((p) => (p === 'windows' ? 'PC' : p)))}. What the store page states, and what it does not.`,
        keywords: [`${facts.name} platforms`, `is ${facts.name} on ps5`, `${facts.name} xbox`],
        blocks: [
          `The short answer is what the publisher lists, and nothing more. ${facts.full} is confirmed on **${list(facts.raw.platforms.map((p) => (p === 'windows' ? 'PC' : p)))}**.`,
          { h: 'What the store page declares' },
          { ul: [...facts.raw.categories] },
          ...(deck
            ? ([{ h: 'Steam Deck' }, 'The store page carries a Steam Deck compatibility rating, which is Valve’s own testing rather than the publisher’s claim.'] as Block[])
            : []),
          { h: 'What we will not tell you' },
          'Whether it is coming to a platform that has not been announced. Console versions are routinely confirmed months after a PC listing goes up, and a wiki guessing at one is just repeating a rumour with a tidier layout. When a platform is announced, it appears above.',
        ],
      }
    },
  },

  {
    id: 'requirements',
    match: /\b(system requirements|specs|can (my|i) run|minimum|recommended|gpu|graphics card|ram|fps|performance|optimi[sz])\b/,
    build: (facts) => {
      const min = facts.raw?.requirements.minimum ?? []
      if (min.length === 0) return null
      const rec = facts.raw?.requirements.recommended ?? []
      return {
        title: `${facts.name} system requirements: can your PC run it?`,
        summary: `The minimum and recommended specification for ${facts.full}, as the publisher states them — and what "minimum" actually means in practice.`,
        keywords: [`${facts.name} system requirements`, `can i run ${facts.name}`, `${facts.name} pc specs`],
        blocks: [
          `These are the figures on the game's own store page. They are a support commitment, not a benchmark — read "minimum" as "it starts and runs", not "it runs well".`,
          { h: 'Minimum' },
          { ul: min.map((row) => `${row.label}: ${row.value}`) },
          ...(rec.length ? ([{ h: 'Recommended' }, { ul: rec.map((row) => `${row.label}: ${row.value}`) }] as Block[]) : []),
          { h: 'How to read these' },
          'A publisher sets the minimum at the lowest configuration they are willing to answer support tickets about, usually at 1080p and 30 frames on low settings. The recommended row is nearer to 1080p60 on high. Neither says anything about the resolution or frame rate you actually want.',
          'We do not publish benchmark figures for this game, because we have not run any. Anyone quoting exact frame rates before a game ships is quoting a preview build on hardware you do not have.',
        ],
      }
    },
  },

  {
    id: 'editions',
    match: /\b(edition|deluxe|ultimate|pre.?order|price|cost|how much|buy|worth it|free)\b/,
    build: (facts) => {
      const editions = facts.raw?.editions ?? []
      if (editions.length < 2) return null
      return {
        title: `${facts.name} editions: which one should you buy?`,
        summary: `The ${editions.length} editions of ${facts.full} the publisher sells, what separates them, and why the prices here are not tracked.`,
        keywords: [`${facts.name} editions`, `${facts.name} deluxe edition`, `${facts.name} price`],
        blocks: [
          `${facts.full} is sold in ${editions.length} editions. What each contains is set by the publisher and changes; this is what the store page showed when it was last read.`,
          { h: 'The editions' },
          { ul: editions.map((e) => (e.priceText ? `${e.title} — ${e.priceText}` : e.title)) },
          { h: 'On the prices' },
          'Those are the publisher’s US list prices and they are not tracked here. Regional pricing, sales and storefront exclusives all vary, and a figure quoted on a wiki is wrong the week after it is written. Check the store.',
          { h: 'Which to buy' },
          'That depends on what the extra content is, which the store page describes and we do not restate — a paragraph rewording a marketing bullet helps nobody. What is worth knowing is that deluxe content in a single-player game is usually cosmetic or an early-unlock, neither of which changes the game.',
        ],
      }
    },
  },

  {
    id: 'multiplayer',
    match: /\b(multiplayer|co.?op|online|pvp|single.?player|split.?screen|crossplay)\b/,
    build: (facts) => {
      if (!facts.raw) return null
      const multi = hasCategory(facts, /multi-?player|co-?op|pvp|online/i)
      const single = hasCategory(facts, /single-?player/i)
      if (!multi && !single) return null
      return {
        title: `Is ${facts.name} multiplayer or single-player?`,
        summary: `${facts.full} is declared ${single ? 'single-player' : ''}${single && multi ? ' and ' : ''}${multi ? 'with multiplayer features' : ''} on its store page. Exactly which modes are listed.`,
        keywords: [`is ${facts.name} multiplayer`, `${facts.name} co op`, `${facts.name} single player`],
        blocks: [
          multi
            ? `${facts.full} declares multiplayer features on its store page. The full list of what it claims is below.`
            : `${facts.full} is listed as single-player. No multiplayer or co-operative mode is declared on its store page.`,
          { h: 'Every mode and feature the store page declares' },
          { ul: facts.raw.categories },
          { h: 'A caution' },
          'These are the publisher’s own tags. A game claiming a feature means it has one, not that it is good — and tags are occasionally set before a mode ships. Anything not in that list is not confirmed, whatever a preview said.',
        ],
      }
    },
  },

  {
    id: 'achievements',
    match: /\b(achievement|trophy|trophies|100%|platinum|completion)\b/,
    build: (facts) => {
      const count = facts.counts.achievements ?? 0
      if (count === 0) return null
      return {
        title: `All ${count} ${facts.name} achievements and how rare each is`,
        summary: `Every achievement in ${facts.full}, with the share of players who have unlocked each one, read from the platform rather than estimated.`,
        keywords: [`${facts.name} achievements`, `${facts.name} trophy list`, `${facts.name} 100%`],
        blocks: [
          `${facts.full} has **${count} achievements**. Every one has its own page here with the developer's description, its icon, and the percentage of owners who have it.`,
          { h: 'Why the percentage is the useful part' },
          'A list of names tells you nothing about difficulty. "0.4% of players have this" tells you it is either at the end of a very long game or asks for something almost nobody repeats. Those figures come from the platform and move over time, so each page records when its figure was taken.',
          { h: 'What is not here yet' },
          'How to actually get each one. Those are written from having done them, not from guessing at what a name implies, so an achievement page with an empty method is one nobody here has earned yet. That is a slower way to fill a wiki and the only honest one.',
        ],
      }
    },
  },

  {
    id: 'languages',
    match: /\b(language|subtitle|dub|english|voice|translat)\b/,
    build: (facts) => {
      if (!facts.raw?.languages) return null
      return {
        title: `What languages does ${facts.name} support?`,
        summary: `Every language ${facts.full} is listed in, and which of them are dubbed rather than subtitled.`,
        keywords: [`${facts.name} languages`, `${facts.name} english dub`, `${facts.name} subtitles`],
        blocks: [
          `As listed by the publisher. On the store page an asterisk marks a language with full audio; everything else is interface and subtitles only.`,
          { h: 'Supported' },
          facts.raw.languages,
          { h: 'Why this matters more than it looks' },
          'A game that is subtitled but not dubbed in your language is a different experience in a story-heavy game, and the store page is the only place that distinction is stated plainly before you buy.',
        ],
      }
    },
  },

  {
    id: 'how-many',
    match: /\b(how many|number of|all the|list of|every)\b/,
    build: (facts) => {
      const notable = Object.entries(facts.counts)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
      if (notable.length < 2) return null
      const total = notable.reduce((sum, [, n]) => sum + n, 0)
      return {
        title: `${facts.name}: how many characters, bosses and items are there?`,
        summary: `${total} things catalogued in ${facts.full} so far, broken down by type — and a plain statement of how complete that is.`,
        keywords: [`how many bosses in ${facts.name}`, `${facts.name} characters list`, `${facts.name} all items`],
        blocks: [
          `This wiki holds **${total} records** for ${facts.full}. Here is the breakdown, counted from the database when this page was built rather than typed in.`,
          { h: 'What is catalogued' },
          { ul: notable.map(([collection, n]) => `${n} ${collection.replace(/-/g, ' ')}`) },
          { h: 'Is that all of them?' },
          'Almost certainly not, and this page will not pretend otherwise. These are the ones documented so far. A count on a wiki is a count of what somebody has written down, and any site presenting one as the complete total is guessing.',
        ],
      }
    },
  },
]

/**
 * The buckets we cannot answer, and what to do about them.
 *
 * "How long to beat" is the most-searched question about half these games and
 * there is no honest answer for an unreleased one. Rather than write it badly
 * or pretend nobody asked, the demand is recorded in the requests queue so it
 * shows up in the admin as work waiting to be done.
 */
const UNANSWERABLE: { id: string; match: RegExp; why: string }[] = [
  { id: 'how-long', match: /\b(how long|length|hours|beat|completion time)\b/, why: 'Nobody here has finished it, and there is no published figure to restate.' },
  { id: 'best-build', match: /\b(best|build|loadout|tier list|strongest|meta)\b/, why: 'A recommendation needs somebody who has played enough to have one.' },
  { id: 'how-to-beat', match: /\b(how to (beat|kill|defeat)|boss fight|strategy)\b/, why: 'Needs somebody who has fought it.' },
  { id: 'where-find', match: /\b(where (is|to find|can i)|location of)\b/, why: 'Needs somebody who has found it.' },
  { id: 'is-it-good', match: /\b(is it (good|worth|scary|hard|fun)|review|rating)\b/, why: 'An opinion, and not one this site is for.' },
  { id: 'endings', match: /\b(ending|endings|secret ending|true ending)\b/, why: 'Needs somebody who has reached them.' },
]

async function upsertGuide(
  payload: Payload,
  gameId: number | string,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'guides',
    where: { and: [{ slug: { equals: slug } }, { game: { equals: gameId } }] },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) {
    await payload.update({ collection: 'guides', id: existing.docs[0].id, data: { ...data, game: gameId } as never, depth: 0 })
    return
  }
  await payload.create({ collection: 'guides', data: { ...data, game: gameId } as never, depth: 0 })
}

/**
 * A picture for every article, and a different one each time.
 *
 * Screenshots are decorative here: they illustrate the game, not a claim about
 * a specific place or person, which is the placement `docs/ASSETS.md` permits.
 * Cycling through the library rather than reusing one image is the difference
 * between a site that looks made and one that looks generated.
 */
const imagePicker = (slug: string, payload: Payload, credit: string) => {
  const dir = path.join(ART_DIR, slug)
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^screenshot-\d+\.(jpg|png)$/i.test(name)).sort()
    : []
  let index = 0

  return async (articleSlug: string, alt: string): Promise<number | string | null> => {
    if (files.length === 0) return null
    const file = files[index % files.length]
    index += 1

    const filename = `${slug}-article-${articleSlug}${path.extname(file)}`
    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs.length > 0) return existing.docs[0].id

    const full = path.join(dir, file)
    if (!fs.existsSync(full)) return null

    try {
      const created = await payload.create({
        collection: 'media',
        data: { alt, credit } as never,
        file: {
          data: fs.readFileSync(full),
          mimetype: file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          name: filename,
          size: fs.statSync(full).size,
        },
      })
      return created.id
    } catch {
      return null
    }
  }
}

async function run(): Promise<void> {
  if (!fs.existsSync(QUERY_DIR)) {
    console.log('No harvested queries. Run `node tools/fetch-search-queries.mjs` first.')
    process.exit(0)
  }

  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  const authors = await payload.find({ collection: 'authors', limit: 20, depth: 0 })
  const byline = (role: RegExp) =>
    authors.docs.find((author) => role.test(String(author.role ?? '')))?.id ?? authors.docs[0]?.id

  let articles = 0
  let backlog = 0

  for (const file of fs.readdirSync(QUERY_DIR).filter((name) => name.endsWith('.json'))) {
    const harvest: Harvest = JSON.parse(fs.readFileSync(path.join(QUERY_DIR, file), 'utf8'))

    const found = await payload.find({
      collection: 'games',
      where: { slug: { equals: harvest.slug } },
      limit: 1,
      depth: 0,
    })
    if (found.docs.length === 0) continue
    const game = found.docs[0]

    const rawFile = path.join(GAME_DIR, `${harvest.slug}.json`)
    const raw: RawGame | undefined = fs.existsSync(rawFile)
      ? JSON.parse(fs.readFileSync(rawFile, 'utf8'))
      : undefined

    const counts: Record<string, number> = {}
    for (const collection of GAME_SCOPED) {
      if (collection === 'guides') continue
      const result = await payload.count({ collection, where: { game: { equals: game.id } } })
      if (result.totalDocs > 0) counts[collection] = result.totalDocs
    }

    const facts: Facts = {
      name: (game.shortTitle as string) || (game.title as string),
      full: game.title as string,
      raw,
      counts,
      sources: raw
        ? [{ title: `${raw.title} — official store page`, url: raw.storeUrl, retrieved: raw.fetchedAt }]
        : [],
    }

    const pickImage = imagePicker(
      harvest.slug,
      payload,
      `${facts.full} © ${raw?.publishers?.[0] ?? 'its publisher'}. Used for identification and commentary.`,
    )

    let written = 0

    for (const topic of TOPICS) {
      const matched = harvest.queries.filter((entry) => topic.match.test(entry.query))
      if (matched.length === 0) continue

      const built = topic.build(facts, matched.map((entry) => entry.query))
      if (!built) continue

      const slug = slugify(built.title).slice(0, 70)
      const image = await pickImage(topic.id, `${facts.full} — ${built.title}`)

      await upsertGuide(payload, game.id, slug, {
        title: built.title,
        slug,
        // The most-searched phrasing in this bucket, verbatim.
        targetQuery: matched[0].query,
        summary: built.summary.slice(0, 320),
        body: rich(
          ...built.blocks,
          { h: 'Where this came from' },
          `Written from ${facts.raw ? "the publisher's own store listing and " : ''}this wiki's records, and rewritten when either changes. The questions it answers are the ones people actually search — taken from Google's own autocomplete on ${harvest.fetchedAt}, not guessed at.`,
        ),
        ...(image ? { image } : {}),
        author: byline(/Launch|Performance|Achievements/),
        sources: facts.sources,
        confidence: 'high',
      })

      written += 1
      articles += 1
    }

    // --- Demand we cannot meet, recorded rather than ignored ---------------
    for (const gap of UNANSWERABLE) {
      const matched = harvest.queries.filter((entry) => gap.match.test(entry.query))
      if (matched.length < 3) continue

      const summary = `${matched.length} searched questions about ${facts.name}: ${gap.id.replace(/-/g, ' ')}`
      const existing = await payload.find({
        collection: 'requests',
        where: { summary: { equals: summary } },
        limit: 1,
        depth: 0,
      })
      if (existing.docs.length > 0) continue

      await payload.create({
        collection: 'requests',
        data: {
          summary,
          detail:
            `People are searching for this and we have not written it. ${gap.why}\n\n` +
            `Examples, most-searched first:\n${matched.slice(0, 12).map((entry) => `  ${entry.query}`).join('\n')}`,
          status: 'new',
        } as never,
      })
      backlog += 1
    }

    console.log(`  ${facts.name.padEnd(24)} ${written} articles from ${harvest.queries.length} queries`)
  }

  console.log(`\n${articles} articles, ${backlog} unanswerable topics filed as requests`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
