import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
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

type Harvested = {
  wikipediaTitle: string
  name: string
  founded?: string | null
  headquarters?: string | null
  industry?: string | null
  keyPeople?: string | null
  employees?: string | null
  revenue?: string | null
  website?: string | null
  parents: string[]
  subsidiaries: string[]
  url: string
  licence: string
  fetchedAt: string
  basis: string
  logo?: {
    file?: string
    free?: boolean
    url?: string | null
    licence?: string | null
    artist?: string | null
  } | null
}

type Draft = {
  name: string
  roles: Set<Role>
  games: (string | number)[]
  gameTitles: string[]
  sources: { title: string; url: string; retrieved?: string | null }[]
  foundOn: string[]
  facts?: Harvested
}

/**
 * Wikipedia disambiguates article titles and we do not want the brackets.
 * "The Coalition (company)" is "The Coalition" here, which is also what the
 * game records call it, so the two halves of this seeder meet on one slug.
 */
const plainName = (title: string): string =>
  title.replace(/\s*\((company|division|video game company|developer|publisher)\)\s*$/i, '').trim()

/**
 * Is this actually a value, or what is left of one after the templates were
 * stripped out of it?
 *
 * A revenue that reads "(2025)" is worse than an empty field: it looks like a
 * figure and carries none. Anything with no letter or digit outside brackets
 * is treated as absent, which is the same rule the rest of the site follows -
 * a gap is honest, a broken value is not.
 */
const usable = (value?: string | null): string | undefined => {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const outside = text.replace(/\([^)]*\)/g, '').replace(/[^A-Za-z0-9]/g, '')
  return outside.length > 0 ? text : undefined
}

/**
 * Download a company's logo, but only where its licence actually allows it.
 *
 * The first pass here downloaded nothing, assuming every company logo is
 * non-free. That is true of the ones uploaded locally to en.wikipedia under a
 * fair-use rationale, and false of most of the ones on Commons: a logo made of
 * type and flat shapes is usually below the threshold of originality and so
 * public domain. Electronic Arts and Capcom both are.
 *
 * `fetch:companies` asks Commons for the licence of each one and records it,
 * so this only has to honour the answer. The licence and the uploader are
 * written into the credit, which is what CC BY-SA asks for on the ones that
 * carry it.
 */
const fetchLogo = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  company: string,
  logo: { file?: string; free?: boolean; url?: string | null; licence?: string | null; artist?: string | null } | null | undefined,
): Promise<string | number | null> => {
  if (!logo?.free || !logo.url) return null

  const extension = (logo.url.match(/\.(svg|png|jpg|jpeg|gif|webp)$/i)?.[1] ?? 'png').toLowerCase()
  const filename = `company-${slugify(company)}.${extension}`

  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs[0]) return existing.docs[0].id

  try {
    const response = await fetch(logo.url, {
      headers: { 'User-Agent': 'VellumWikiNetwork/1.0 (game wiki network; non-commercial)' },
    })
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())

    const mimetype =
      extension === 'svg'
        ? 'image/svg+xml'
        : extension === 'png'
          ? 'image/png'
          : extension === 'gif'
            ? 'image/gif'
            : extension === 'webp'
              ? 'image/webp'
              : 'image/jpeg'

    const credit = [
      `${company} logo`,
      logo.licence ? `(${logo.licence})` : '',
      logo.artist ? `— ${logo.artist}` : '',
    ]
      .filter(Boolean)
      .join(' ')

    const created = await payload.create({
      collection: 'media',
      data: { alt: `${company} logo`, credit } as never,
      file: { data: buffer, mimetype, name: filename, size: buffer.length },
    })
    return created.id
  } catch {
    // A logo is decoration. Failing to get one is not a reason to fail the run.
    return null
  }
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

  // --- 3. The harvest ------------------------------------------------------
  /*
    `pnpm fetch:companies` writes this from Wikipedia: the fifty largest by
    revenue, the makers of our own games, and everything those two name as a
    parent or a subsidiary. Selection is editorial and the page says so; every
    figure on it comes from that company's own article with the date read.
  */
  const RAW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'raw', 'companies.json')
  let harvestedAt = ''
  if (fs.existsSync(RAW)) {
    const file = JSON.parse(fs.readFileSync(RAW, 'utf8')) as {
      fetchedAt: string
      companies: Harvested[]
    }
    harvestedAt = file.fetchedAt
    for (const entry of file.companies) {
      const name = plainName(entry.wikipediaTitle)
      const draft = draftFor(name)
      draft.facts = entry
      if (!draft.sources.some((source) => source.url === entry.url)) {
        draft.sources.push({
          title: `${entry.wikipediaTitle} — Wikipedia (${entry.licence})`,
          url: entry.url,
          retrieved: entry.fetchedAt,
        })
      }
    }
    console.log(`harvested facts: ${file.companies.length} companies, read ${file.fetchedAt}`)
  } else {
    console.log('no src/seed/raw/companies.json — run `pnpm fetch:companies` for the facts')
  }

  // --- 4. Write them ------------------------------------------------------
  let created = 0
  let updated = 0
  let logos = 0

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
    const facts = draft.facts
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
    } else if (facts) {
      /*
        A company with a harvested article but no game of ours. The sentence
        is built from its own infobox and says nothing this network cannot
        show a source for.
      */
      const founded = usable(facts.founded)
      const where = usable(facts.headquarters)
      summary = [
        `${draft.name} is a games company`,
        founded ? ` founded ${founded.replace(/\s*\(.*$/, '')}` : '',
        where ? `, based in ${where}` : '',
        '.',
      ].join('')
      confidence = 'medium'
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

    const logoId = await fetchLogo(payload, draft.name, facts?.logo)
    if (logoId) logos += 1

    const data = {
      name: draft.name,
      slug,
      role: roles,
      summary,
      confidence,
      games: draft.games,
      sources: draft.sources.length > 0 ? sources : undefined,
      // Every one of these is dropped rather than shown when what survived
      // the wikitext is not actually a value. See `usable`.
      founded: usable(facts?.founded),
      headquarters: usable(facts?.headquarters),
      industry: usable(facts?.industry),
      keyPeople: usable(facts?.keyPeople),
      employees: usable(facts?.employees),
      revenue: usable(facts?.revenue),
      website: usable(facts?.website),
      basis: facts?.basis ?? (draft.gameTitles.length > 0 ? 'network-game' : 'related-company'),
      ...(logoId ? { logo: logoId } : {}),
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

  // --- 5. Wire the corporate graph ----------------------------------------
  /*
    A second pass, because a parent cannot be linked to a subsidiary that has
    not been written yet. Both directions are stored: a studio page says who
    owns it, a parent page lists what it owns, and each link exists only
    because one of the two articles named the other.
  */
  const all = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
  const idBySlug = new Map<string, string | number>()
  for (const company of all.docs as unknown as { id: string | number; slug: string }[]) {
    idBySlug.set(company.slug, company.id)
  }

  let linked = 0
  for (const draft of drafts.values()) {
    const facts = draft.facts
    if (!facts) continue
    const id = idBySlug.get(slugify(draft.name))
    if (!id) continue

    const resolve = (names: string[]) =>
      names
        .map((name) => idBySlug.get(slugify(plainName(name))))
        .filter((value): value is string | number => value !== undefined)

    const parentIds = resolve(facts.parents)
    const subsidiaryIds = resolve(facts.subsidiaries).filter((value) => value !== id)
    if (parentIds.length === 0 && subsidiaryIds.length === 0) continue

    await payload.update({
      collection: 'companies',
      id,
      data: {
        ...(parentIds[0] !== undefined ? { parent: parentIds[0] } : {}),
        ...(subsidiaryIds.length > 0 ? { subsidiaries: subsidiaryIds } : {}),
      } as never,
    })
    linked += 1
  }

  console.log(`\nmigrated out of game collections: ${migrated.length}`)
  for (const row of migrated) console.log(`  ${row}`)
  console.log(`\ncompanies: ${created} created, ${updated} updated`)
  console.log(`logos downloaded where the licence allowed it: ${logos}`)
  console.log(`corporate links written on ${linked} of them${harvestedAt ? ` (facts read ${harvestedAt})` : ''}`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
