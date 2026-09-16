import 'dotenv/config'
import { getPayload } from 'payload'
import type { CollectionSlug } from 'payload'
import config from '../payload.config'
import { slugify } from '../fields/shared'

/**
 * Studio and publisher profiles for `companies.<network domain>`.
 *
 *   pnpm seed:companies
 *
 * Two sources, and the difference between them is recorded in each record's
 * confidence rather than smoothed over:
 *
 *   1. Every game's own `developer` and `publisher` field. These are facts the
 *      store page states outright, so the profile can say which games are
 *      theirs and in what role. The game record stays the source of truth and
 *      this is the reverse index.
 *
 *   2. Studios the entity harvester filed as Regions, which is where thirteen
 *      of them were living - Bloober Team and Konami as *places* in Silent
 *      Hill: Townfall, The Coalition as a place in Gears of War. Each came
 *      with a real source URL from the franchise wiki, so the research is
 *      kept; it is only the shelf it was on that was wrong.
 *
 * The second kind gets a deliberately careful summary. Appearing on the Silent
 * Hill wiki makes a studio part of that series' history; it does not make it
 * the developer of the game this network covers, and saying so would be
 * exactly the invented fact the whole project exists to avoid. So the profile
 * says where the name was found and nothing more, and carries low confidence
 * until somebody fills it in.
 */

/**
 * Harvested records that are companies, reviewed by hand rather than matched
 * by a pattern.
 *
 * A pattern was tried. It flagged `b1-series-battle-droid` as media because
 * the title contains "series", and an earlier one deleted Antar 4 - a real
 * moon - for ending in a digit. Sixteen names is small enough to read.
 */
const HARVESTED_COMPANIES = new Set([
  'Annapurna Interactive',
  'Bad Robot Games',
  'Behaviour Interactive',
  'Bit Reactor',
  'Bloober Team',
  'Climax Studios',
  'Double Helix Games',
  'Genvid Technologies',
  'HexaDrive',
  'Konami',
  'NeoBards Entertainment',
  'Remedy Entertainment',
  'Screen Burn',
  'The Coalition',
  'Vatra Games',
  'WayForward Technologies',
])

/** Collections the harvester wrongly filed companies into. */
const MISFILED_IN: CollectionSlug[] = ['regions', 'characters', 'items', 'enemies']

type Role = 'developer' | 'publisher'

type Draft = {
  name: string
  roles: Set<Role>
  games: (string | number)[]
  gameTitles: string[]
  sources: { title: string; url: string; retrieved?: string | null }[]
  foundOn: string[]
}

const splitHolders = (value?: string | null): string[] =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

/** "A and B" / "A, B and C". */
const listSentence = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'title' })
  const drafts = new Map<string, Draft>()

  const draftFor = (name: string): Draft => {
    const key = name.toLowerCase()
    let draft = drafts.get(key)
    if (!draft) {
      draft = { name, roles: new Set(), games: [], gameTitles: [], sources: [], foundOn: [] }
      drafts.set(key, draft)
    }
    return draft
  }

  // --- 1. Whoever the games say made them --------------------------------
  for (const game of games.docs as unknown as {
    id: string | number
    title: string
    developer?: string | null
    publisher?: string | null
  }[]) {
    for (const [role, field] of [
      ['developer', game.developer],
      ['publisher', game.publisher],
    ] as const) {
      for (const name of splitHolders(field)) {
        const draft = draftFor(name)
        draft.roles.add(role as Role)
        if (!draft.games.includes(game.id)) {
          draft.games.push(game.id)
          draft.gameTitles.push(game.title)
        }
      }
    }
  }

  // --- 2. Studios the harvester filed as places ---------------------------
  const migrated: string[] = []
  for (const collection of MISFILED_IN) {
    const docs = await payload.find({ collection, limit: 10000, depth: 1 })
    for (const doc of docs.docs as unknown as {
      id: string | number
      title?: string
      game?: { title?: string } | string | number
      sources?: { title?: string | null; url?: string | null; retrieved?: string | null }[] | null
    }[]) {
      const title = String(doc.title ?? '').trim()
      if (!HARVESTED_COMPANIES.has(title)) continue

      const draft = draftFor(title)
      for (const source of doc.sources ?? []) {
        if (!source?.url || !source.title) continue
        if (draft.sources.some((existing) => existing.url === source.url)) continue
        draft.sources.push({
          title: String(source.title),
          url: String(source.url),
          retrieved: source.retrieved ?? null,
        })
      }
      const from = typeof doc.game === 'object' && doc.game ? String(doc.game.title ?? '') : ''
      if (from && !draft.foundOn.includes(from)) draft.foundOn.push(from)

      await payload.delete({ collection, id: doc.id })
      migrated.push(`${collection}/${title}`)
    }
  }

  // --- 3. Write them ------------------------------------------------------
  let created = 0
  let updated = 0

  for (const draft of drafts.values()) {
    const slug = slugify(draft.name)
    if (!slug) continue

    const roles: Role[] = draft.roles.size > 0 ? [...draft.roles] : ['developer']

    /*
      Composed from what is actually known, the same rule the record pages
      follow. A company the games name gets the sentence its games support; a
      company only a franchise wiki mentions gets a sentence about exactly
      that, and nothing about the game this network covers.
    */
    let summary: string
    let confidence: 'high' | 'medium' | 'low'
    if (draft.gameTitles.length > 0) {
      const verb =
        roles.length === 2
          ? 'develops and publishes'
          : roles[0] === 'publisher'
            ? 'publishes'
            : 'develops'
      summary = `${draft.name} ${verb} ${listSentence(draft.gameTitles)}, covered on this network.`
      confidence = 'high'
    } else {
      const where = draft.foundOn.length > 0 ? listSentence(draft.foundOn) : 'a game covered here'
      summary = `${draft.name} is named in the community-wiki sources compiled for ${where}. What it worked on, and when, is not established here.`
      confidence = 'low'
    }

    const sources =
      draft.sources.length > 0
        ? draft.sources
        : [
            {
              title: `${draft.name} — credited on the store listing`,
              url: 'https://store.steampowered.com/',
              retrieved: null,
            },
          ]

    const data = {
      name: draft.name,
      slug,
      role: roles,
      summary,
      confidence,
      games: draft.games,
      sources: draft.sources.length > 0 ? sources : undefined,
    }

    const existing = await payload.find({
      collection: 'companies',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })

    if (existing.docs[0]) {
      await payload.update({ collection: 'companies', id: existing.docs[0].id, data: data as never })
      updated += 1
    } else {
      await payload.create({ collection: 'companies', data: data as never })
      created += 1
    }
  }

  console.log(`\nmigrated out of game collections: ${migrated.length}`)
  for (const row of migrated) console.log(`  ${row}`)
  console.log(`\ncompanies: ${created} created, ${updated} updated`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
