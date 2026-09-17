import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { slugify } from '../fields/shared'
import { rich, type Block } from './lexical'
/* One rule for what a founding date is, not two. `seed:companies` owns the
   field; this pass writes the sentence about it and has to refuse the same
   values, or the panel reads "2005" while the paragraph above it reads
   "founded on Grenoble (Meylan), France (2005)". */
import { foundedValue } from './companies'
import type { Company } from '../payload-types'

/**
 * The catalogue and the history on each company profile.
 *
 *   pnpm fetch:company-games   # writes src/seed/raw/company-games.json
 *   pnpm seed:company-games
 *
 * Runs after `seed:companies`, which creates the records; this one fills the
 * two things that make a profile worth opening - how the company started and
 * everything it has made. The titles are stored on the record rather than
 * related to anything, because they are not records on this network and are
 * not going to become any: the owner was explicit that a title here is
 * information on a company page, not a new wiki.
 *
 * ## What it will not overwrite
 *
 * This runs inside `pnpm db:reset`, which on a working machine means it runs
 * over records an editor has been correcting. So every field is filled only
 * where it is empty, and the catalogue is merged by title rather than
 * replaced: a row somebody typed by hand survives, a price they corrected
 * survives, and a row they deleted comes back - which is the one direction
 * that cannot be told from "never seen before" without a marker field, and is
 * the cheaper mistake of the two.
 *
 * ## The prose
 *
 * Composed from the captured fields and from nothing else. Wikipedia's own
 * history section is not paraphrased, here or anywhere - facts are free to
 * compile and sentences are not - so a company that yielded only a founding
 * year gets one true sentence rather than a padded paragraph, and one that
 * yielded nothing gets no body at all.
 */

type Row = NonNullable<Company['titles']>[number]
type Role = NonNullable<Row['role']>

type Harvested = {
  title: string
  year?: string | null
  role?: Role | null
  platforms?: string | null
  priceText?: string | null
  priceCents?: number | null
  isFree?: boolean | null
  reviews?: string | null
  genre?: string | null
  metacritic?: number | null
  storeUrl?: string | null
  appid?: string | null
  source: 'steam' | 'wikipedia' | 'both'
}

type Entry = {
  name: string
  wikipediaTitle: string
  readAt: string
  steam?: { query: string | null; developerResults: number | null; publisherResults: number | null; kept: number }
  wikipedia?: { article?: string; table?: string; rows?: number; skipped?: string }
  history?: {
    founded?: string | null
    founders?: string | null
    formerNames?: string | null
    defunct?: string | null
    fate?: string | null
    parent?: string | null
    acquired?: string | null
    franchises?: string | null
    headquarters?: string | null
  } | null
  found: number
  titles: Harvested[]
}

type Manifest = { fetchedAt: string; cap: number; companies: Record<string, Entry> }

const RAW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'raw', 'company-games.json')

/**
 * The same title from two sources, reduced to one key.
 *
 * Deliberately the same rule the harvester uses, so a row it matched against
 * Wikipedia is matched again here against our own games and against whatever
 * an editor has already typed into the array.
 */
const key = (title: string): string => {
  const reduced = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
  /*
    A title with no Latin letters in it reduces to nothing, and a row with no
    key is a row that never gets written. Artdink's ルナティックドーン 前途への道標
    is one of exactly one such title in four thousand, which is precisely how
    long it would have taken anyone to notice.
  */
  return reduced || title.trim().toLowerCase()
}

/**
 * A "title" that is really the Platform column.
 *
 * Every part of it names a platform, which no game is called: "Arcade, Amiga,
 * Amstrad CPC, Atari ST", "Nintendo Switch, PlayStation 5, Windows". These are
 * what the shifted parse wrote into the Title column of tables that put the
 * platforms last, and they are the one artefact that can be told apart from a
 * real row by looking at it.
 */
const PLATFORMS =
  /playstation|xbox|windows|mac ?os|linux|nintendo|switch|wii|game ?boy|gamecube|ms-?dos|amiga|amstrad|atari|sega|dreamcast|saturn|genesis|mega drive|android|ios|arcade|browser|steam|psp|vita|3ds|\bnds\b|n64|snes|nes|neo geo|msx|\bzx\b|spectrum|commodore|bbc micro|lynx|jaguar|32x|3do|game gear|dsiware|n-gage|apple ii|sam coupé|hyperscan|\bpc\b|and /i

const looksLikePlatforms = (title: string): boolean => {
  const parts = title
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length > 0 && parts.every((part) => PLATFORMS.test(part))
}

const filled = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined

/**
 * Is there anything in this rich text, or is it an empty editor?
 *
 * Payload stores a cleared field as a root with one empty paragraph, which is
 * truthy and has children, so `if (company.body)` is always true and the body
 * would never be written on any record that had ever been opened.
 */
const hasBody = (body: unknown): boolean => {
  const root = (body as { root?: { children?: { children?: { text?: string }[] }[] } } | null)?.root
  if (!root?.children?.length) return false
  return root.children.some((node) =>
    (node.children ?? []).some((child) => String(child?.text ?? '').trim().length > 0),
  )
}

/** The first line of text in a rich-text body, for asking who wrote it. */
const firstLine = (body: unknown): string => {
  const root = (body as { root?: { children?: { children?: { text?: string }[] }[] } } | null)?.root
  const paragraph = root?.children?.find((node) =>
    (node.children ?? []).some((child) => String(child?.text ?? '').trim().length > 0),
  )
  return (paragraph?.children ?? []).map((child) => String(child?.text ?? '')).join('').trim()
}

/** "A and B" / "A, B and C". */
const listSentence = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * A comma-separated field read as a list, without splitting inside brackets.
 *
 * miHoYo's founders are "Cai Haoyu, Liu Wei (President, Chairman of the
 * Board), Luo Yuhao (Vice President)" - a naive split makes five founders out
 * of three, two of them job titles.
 */
const asList = (value: string): string[] =>
  value
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim())
    .filter(Boolean)

/**
 * "Who bought them and when", out of whichever field carried it.
 *
 * The harvester takes the acquisition from a Fate field ("Acquired by
 * Microsoft") or from a Parent field that has a date on it ("Xbox Game Studios
 * (2014-present)"). Both say the same thing in different shapes, and the
 * record's own field asks for the shape "Tencent, 2024". Nothing is added:
 * where the source gave no year, none appears.
 */
const acquisition = (value: string): { who: string; when: string | null } => {
  const when = value.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1] ?? null
  const who = value
    .replace(/^\s*(acquired|purchased|bought|merged into|sold to)\s+(by\s+)?/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[,;]\s*$/, '')
    .trim()
  return { who, when }
}

const run = async (): Promise<void> => {
  if (!fs.existsSync(RAW)) {
    console.log('no src/seed/raw/company-games.json — run `pnpm fetch:company-games` first')
    process.exit(0)
  }
  const manifest = JSON.parse(fs.readFileSync(RAW, 'utf8')) as Manifest
  const payload = await getPayload({ config })

  /*
    The eight wikis, so a row that is one of ours links inward instead of out
    to a shop. Matched on the normalised title because the storefront writes
    "STAR WARS Zero Company(tm)" and the record does not.
  */
  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  const ours = new Map<string, number | string>()
  for (const game of games.docs as unknown as { id: number | string; title: string }[]) {
    ours.set(key(game.title), game.id)
  }

  /*
    Every company on the host, by the same normalised key the catalogue uses.

    This is the prune's whole guard. A publisher's name is not a game title,
    and rows for Ubisoft, THQ, Microsoft Studios, Disney Interactive Studios
    and HIP Interactive were sitting in Asobo Studio's catalogue marked
    "Developed" - the Publisher column of a Wikipedia table read as the Title
    column, because a `rowspan` on the Year cell made every row under it one
    cell short. The harvester reads rowspans now; this removes what the old
    reader already wrote, because the merge below fills gaps and never deletes.
  */
  const companies = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
  const companyNames = new Set(
    (companies.docs as unknown as { name: string }[]).map((company) => key(company.name)),
  )

  let updated = 0
  let missing = 0
  let pruned = 0
  const prunedRows: string[] = []
  let withCatalogue = 0
  let titlesWritten = 0
  let covered = 0
  let bodies = 0
  const empty: string[] = []

  for (const [slug, entry] of Object.entries(manifest.companies)) {
    const found = await payload.find({
      collection: 'companies',
      where: { slug: { equals: slugify(slug) } },
      limit: 1,
      depth: 0,
    })
    const company = found.docs[0] as Company | undefined
    if (!company) {
      missing += 1
      continue
    }

    const history = entry.history ?? {}

    // --- the catalogue -----------------------------------------------------
    const stored = (company.titles ?? []) as Row[]
    const harvested = new Set(entry.titles.map((row) => key(row.title)))

    /*
      Rows the shifted-column bug wrote, which the merge below would otherwise
      keep for ever: it fills gaps and never deletes, so tightening the parser
      does nothing to what the loose one already wrote.

      Two things have to be true of every row this removes, and then one of
      three shapes:

        - the fresh harvest for this company does not list it, and there *is* a
          fresh harvest for it to be absent from. A company we failed to read is
          not a company whose catalogue is wrong.
        - nothing on it that a person fills: no price, no store link, no score,
          no genre, no reviews, no wiki link. Those are an editor's work and
          this pass does not own them.

      Then the row is one of:

        - a title that is nothing but platform names — "PlayStation 4, Xbox
          One", "Arcade, Amiga, Amstrad CPC". No game is called that, whatever
          year sits next to it.
        - another company on this host, with no year. Asobo Studio's THQ,
          Disney Interactive Studios and HIP Interactive; Argonaut Games'
          "Xbox", whose platform column reads "Global Star Software". The year
          is what keeps "Perfect World (2006)", a real game that shares its name
          with a company here.
        - nothing but a title: no year, no platforms — and only where the
          harvest was not capped. Sixty titles is where a catalogue stops being
          a catalogue, so a company with more than sixty has rows on the record
          that today's sixty do not include; an earlier run of this prune took
          Glover, Chicken Run and Frogger 2 off Blitz Games Studios that way.
    */
    const existing = stored.filter((row) => {
      const id = key(row.title ?? '')
      if (harvested.has(id) || entry.titles.length === 0) return true

      const edited =
        filled(row.priceText) ||
        filled(row.storeUrl) ||
        filled(row.metacritic) ||
        filled(row.genre) ||
        filled(row.reviews) ||
        filled(row.coveredBy)
      if (edited) return true

      const capped = (entry.found ?? 0) > entry.titles.length
      const bare = !filled(row.year) && !filled(row.platforms)
      const wrong =
        looksLikePlatforms(row.title ?? '') ||
        (companyNames.has(id) && !filled(row.year)) ||
        (bare && !capped)
      if (!wrong) return true

      prunedRows.push(`${slug}: ${row.title}`)
      pruned += 1
      return false
    })

    const byKey = new Map<string, Row>()
    for (const row of existing) byKey.set(key(row.title ?? ''), { ...row })

    const roleFallback: Role | null =
      (company.role ?? []).length === 2 ? 'both' : ((company.role ?? [])[0] as Role | undefined) ?? null

    const order: string[] = existing.map((row) => key(row.title ?? ''))
    for (const harvested of entry.titles) {
      const id = key(harvested.title)
      if (!id) continue
      const current = byKey.get(id)
      const coveredBy = ours.get(id) ?? null

      if (current) {
        // Only the gaps. An editor who corrected a price or a year keeps it.
        if (!filled(current.year) && harvested.year) current.year = harvested.year
        if (!filled(current.role)) current.role = harvested.role ?? roleFallback ?? null
        if (!filled(current.platforms) && harvested.platforms) current.platforms = harvested.platforms
        if (!filled(current.priceText) && harvested.priceText) current.priceText = harvested.priceText
        if (!filled(current.reviews) && harvested.reviews) current.reviews = harvested.reviews
        if (!filled(current.genre) && harvested.genre) current.genre = harvested.genre
        if (!filled(current.metacritic) && harvested.metacritic) current.metacritic = harvested.metacritic
        if (!filled(current.storeUrl) && harvested.storeUrl) current.storeUrl = harvested.storeUrl
        if (!filled(current.coveredBy) && coveredBy) current.coveredBy = coveredBy as never
        if (harvested.isFree && !current.isFree) current.isFree = true
        continue
      }

      byKey.set(id, {
        title: harvested.title,
        year: harvested.year ?? null,
        /*
          Null where nothing states one. `?? 'developer'` was the same
          unsourced assertion the company's own `role` field used to make by
          default — "Developed" printed against a row nobody said they
          developed. The catalogue drops the credit line rather than filling
          it.
        */
        role: harvested.role ?? roleFallback ?? null,
        priceText: harvested.priceText ?? null,
        isFree: harvested.isFree ?? false,
        metacritic: harvested.metacritic ?? null,
        reviews: harvested.reviews ?? null,
        genre: harvested.genre ?? null,
        platforms: harvested.platforms ?? null,
        storeUrl: harvested.storeUrl ?? null,
        coveredBy: (coveredBy ?? null) as never,
      })
      order.push(id)
    }

    const titles = order
      .filter((id, index) => order.indexOf(id) === index)
      .map((id) => byKey.get(id))
      .filter((row): row is Row => row !== undefined)

    if (titles.length > 0) withCatalogue += 1
    else {
      // Both halves, because "no catalogue" has two quite different causes and
      // the difference is the whole finding: a company with nothing on Steam
      // and no games table on its article is thin because the sources are
      // thin, not because anything failed.
      const steam = entry.steam?.query ? `steam: nothing under "${entry.steam.query}"` : 'steam: no name matched'
      const wiki = entry.wikipedia?.skipped ?? `wikipedia: ${entry.wikipedia?.rows ?? 0} rows`
      empty.push(`${slug} — ${steam}; ${wiki}`)
    }
    titlesWritten += titles.length
    covered += titles.filter((row) => row.coveredBy).length

    // --- the note ----------------------------------------------------------
    /*
      A price is true on a date, so the date is on the page. Rewritten only
      when it is still ours: an editor who replaced it with their own wording
      has said something this cannot say better.
    */
    const sources: string[] = []
    if ((entry.steam?.kept ?? 0) > 0) sources.push(`the Steam store, read ${entry.readAt}, prices in US dollars on that date`)
    if (entry.wikipedia?.article) {
      sources.push(`the games table on ${entry.wikipedia.article} at Wikipedia (CC BY-SA), read ${entry.readAt}`)
    }
    const capped = entry.found > titles.length ? ` Showing ${titles.length} of ${entry.found} found.` : ''
    const note = sources.length > 0 ? `Compiled from ${listSentence(sources)}.${capped}` : null
    const noteIsOurs = !filled(company.catalogueNote) || company.catalogueNote?.startsWith('Compiled from ')

    // --- the body ----------------------------------------------------------
    const blocks: Block[] = []
    const founded = foundedValue(company.founded ?? history.founded) ?? null
    const where = company.headquarters ?? history.headquarters ?? null

    const opening: string[] = []
    // The field stores the list as the article prints it; the sentence reads
    // it as a sentence. "founded by Piotr Babieno, Piotr Bielatowicz" is a
    // field pasted into prose, not prose.
    const founders = history.founders ? listSentence(asList(history.founders)) : null
    if (founded) {
      // "founded in June 11, 1983" is what a single preposition produces, and
      // an infobox states the founding date either way round. A value that
      // opens with the year takes "in" however much follows it: "founded on
      // 2009 (as Tecmo Koei Holdings)" is the same missing preposition again.
      const when = /^\s*(c\.|circa)?\s*\d{4}\b/.test(founded) ? `in ${founded}` : `on ${founded}`
      opening.push(
        founders
          ? `${company.name} was founded ${when} by ${founders}.`
          : `${company.name} was founded ${when}.`,
      )
    } else if (founders) {
      opening.push(`${company.name} was founded by ${founders}.`)
    }
    if (where) opening.push(`It is based in ${where}.`)
    if (history.formerNames) opening.push(`It has also traded as ${history.formerNames}.`)
    if (opening.length > 0) blocks.push(opening.join(' '))

    const now: string[] = []
    if (history.acquired) {
      const { who, when } = acquisition(history.acquired)
      /*
        Two shapes, and the sentence says which one the source gave. A Fate
        field reading "Acquired by Microsoft" states the event; a Parent field
        reading "Xbox Game Studios (2014-present)" states who owns them and
        since when, which is not quite the same claim and should not be
        written as though it were.
      */
      const fromFate = Boolean(history.fate && /\b(acquired|purchased|bought|merged into|sold to)\b/i.test(history.fate))
      if (who && fromFate) now.push(when ? `It was acquired by ${who} in ${when}.` : `It was acquired by ${who}.`)
      else if (who && when) now.push(`It has been owned by ${who} since ${when}.`)
      else if (who) now.push(`It is owned by ${who}.`)
    }
    // Only where a year survives. "The company closed in 8 May 2015" is the
    // same missing preposition again, and a close with no date is a claim
    // this cannot date.
    const closed = history.defunct?.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]
    if (closed) now.push(`The company closed in ${closed}.`)
    if (history.franchises) now.push(`It is known for ${history.franchises}.`)
    if (now.length > 0) blocks.push(now.join(' '))

    if (titles.length > 0) {
      const years = titles.map((row) => Number(row.year)).filter((year) => Number.isFinite(year) && year > 1900)
      const span =
        years.length > 1 && Math.min(...years) !== Math.max(...years)
          ? `, from ${Math.min(...years)} to ${Math.max(...years)}`
          : ''
      const mine = titles.filter((row) => row.coveredBy).length
      const here =
        mine > 0
          ? ` ${mine === 1 ? 'One of them has' : `${mine} of them have`} a wiki on this network.`
          : ''
      blocks.push(
        `The catalogue below lists **${titles.length}** ${titles.length === 1 ? 'title' : 'titles'}${span}.${here}`,
      )
    }

    /*
      A body this pass wrote is a body this pass owns, and it opens with one of
      the three sentences this pass composes — "<name> was founded…", "It is
      based in…", "It has also traded as…".

      Without this, correcting a fact fixes the panel and leaves the paragraph
      above it stating the old one — AGEod's `founded` field became "2005"
      while its first line went on reading "AGEod was founded on Grenoble
      (Meylan), France (2005)". It is the trap `seed:prune` exists for, one
      field further in: tightening a rule does nothing to what the loose rule
      already wrote.

      An editor's paragraph does not open that way by accident, and the check
      is on the opening rather than the whole body so a run that adds a
      sentence still recognises its own work.
    */
    const openings = [`${company.name} was founded`, 'It is based in', 'It has also traded as']
    const bodyIsOurs = openings.some((opening) => firstLine(company.body).startsWith(opening))
    const writeBody = blocks.length > 0 && (!hasBody(company.body) || bodyIsOurs)
    if (writeBody) bodies += 1

    await payload.update({
      collection: 'companies',
      id: company.id,
      data: {
        // Every one of these only where the record has nothing. `seed:companies`
        // runs first and owns `founded`, `headquarters` and the corporate graph.
        ...(filled(company.founders) || !history.founders ? {} : { founders: history.founders }),
        ...(filled(company.formerNames) || !history.formerNames ? {} : { formerNames: history.formerNames }),
        ...(filled(company.defunct) || !history.defunct ? {} : { defunct: history.defunct }),
        ...(filled(company.franchises) || !history.franchises ? {} : { franchises: history.franchises }),
        ...(filled(company.acquired) || !history.acquired
          ? {}
          : {
              acquired: (() => {
                const { who, when } = acquisition(history.acquired)
                return who ? (when ? `${who}, ${when}` : who) : history.acquired
              })(),
            }),
        /* Also when the prune emptied it: skipping the write there would leave
           the rows this pass has just decided are not titles. */
        ...(titles.length > 0 || stored.length !== existing.length ? { titles } : {}),
        ...(note && noteIsOurs ? { catalogueNote: note } : {}),
        ...(writeBody ? { body: rich(...blocks) } : {}),
      } as never,
    })
    updated += 1
  }

  console.log(`\ncompanies in the harvest:   ${Object.keys(manifest.companies).length} (read ${manifest.fetchedAt})`)
  console.log(`  updated:                  ${updated}`)
  console.log(`  no such company record:   ${missing}`)
  console.log(`  with a catalogue:         ${withCatalogue}`)
  console.log(`  with nothing found:       ${empty.length}`)
  console.log(`titles written:             ${titlesWritten}`)
  if (pruned > 0) {
    console.log(`rows removed as not titles: ${pruned}`)
    for (const row of prunedRows) console.log(`  ${row}`)
  }
  console.log(`rows linked to a wiki here: ${covered}`)
  console.log(`bodies composed:            ${bodies}`)
  if (empty.length > 0) {
    console.log('\nnothing found, and why:')
    for (const line of empty) console.log(`  ${line}`)
  }
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
