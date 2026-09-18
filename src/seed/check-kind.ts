import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { GAME_SCOPED } from '../lib/tenancy'
import { isAnEvent, isNotAnEntity, isNotAPlace } from '../lib/harvest'
import { DEFUNCT_NOT_THIS_COMPANY } from './companies'

/**
 * Is each record the kind of thing it is filed as?
 *
 *   pnpm check:kind
 *
 * Every other check here counts rows or renders pages. `pnpm verify` asks
 * whether a record belongs to a game, the build asks whether a page renders,
 * and both were green while the Gears of War *film* sat in `regions` with a
 * composed summary reading "Gears of War, a location in Gears E-Day". The page
 * rendered beautifully. The row had a real source URL, because the wiki page
 * it came from is real. Only the shelf was wrong, and nothing was looking at
 * the shelf.
 *
 * Two tiers, and the split is the point:
 *
 *   **Wrong.** The wiki's own URL says the page is a film, a soundtrack or a
 *   sequel; or its own conflict infobox says an `enemies` or `characters`
 *   record is a battle; or a company that this network already has a profile
 *   for is filed as a place; or one title appears twice for the same game.
 *   These are mechanical and exit non-zero.
 *
 *   **Worth a look.** A title that reads like a work or a studio but has
 *   nothing in the URL to confirm it; or a closure date that something else
 *   the same sources state argues with. These are printed and never fail the
 *   run, because the pattern that produced this tier once flagged
 *   `b1-series-battle-droid` - a real enemy - for containing "series", and an
 *   earlier version of the delete rule removed Antar 4, a real moon, for
 *   ending in a digit. A check that deletes on a guess is worse than the bug
 *   it is catching.
 *
 * A finding in the second tier is worth reading for what it is *comparing* as
 * well as for what it says. Twenty-two profiles were reported for a closure
 * date their catalogue contradicted, and sixteen of them were a comparison
 * that never held: a Steam row's year is the day the storefront put the title
 * on sale, so Beam Software's fifteen "later" titles are a studio's own 1980s
 * back catalogue re-listed in 2019. Two sourced facts that disagree are
 * sometimes two different kinds of fact.
 */

const LOOKS_LIKE_A_WORK =
  /\b(soundtrack|original score|comics?|books?|novels?|novella|manga|anthology|artbook|magazine|trading cards?|merchandise|board game|card game|documentary|timeline|wiki|category|template|gallery)\b/i

const LOOKS_LIKE_A_COMPANY =
  /\b(interactive|entertainment|studios?|software|productions?|publishing|technologies)\b\s*$/i

type Finding = { level: 'wrong' | 'review'; line: string }

/**
 * A four-digit year out of a field that may be a date, a range or neither.
 *
 * `defunct` is whatever the infobox printed - "1 October 2010", "2000 (2000)
 * (original), 2005 (2005)" - and a catalogue row's `year` is whatever the
 * store or the table gave. Nothing is inferred from a field with no year in
 * it: no year means no comparison, not a comparison against zero.
 */
const year = (value?: string | null): number | undefined => {
  const found = String(value ?? '').match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]
  return found ? Number(found) : undefined
}

/*
  The wiki's own categories and infobox, which the database does not keep.

  Two of the rules here are about what a page *is* rather than what it is
  called, and neither a title nor a source URL carries that. The raw harvest
  still does, so the guards get what they were given at import time instead of
  a thinner version of it - the same reason `prune-entities` re-reads it.
*/
const HERE = path.dirname(fileURLToPath(import.meta.url))
const HARVEST = path.join(HERE, 'raw', 'wiki-entities')

type RawEntity = { title?: string; categories?: string[]; facts?: Record<string, string> }

const readHarvest = (): Map<string, RawEntity> => {
  const index = new Map<string, RawEntity>()
  if (!fs.existsSync(HARVEST)) return index
  for (const file of fs.readdirSync(HARVEST)) {
    if (!file.endsWith('.json')) continue
    const slug = file.replace(/\.json$/, '')
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(HARVEST, file), 'utf8'))
      for (const entity of parsed.entities ?? []) {
        if (!entity?.title) continue
        index.set(`${slug}|${String(entity.title).trim().toLowerCase()}`, entity)
      }
    } catch {
      /* A harvest file that will not parse means fewer findings, never more. */
    }
  }
  return index
}

/*
  The company harvest, for the two things a stored catalogue row does not say.

  Same reasoning as `readHarvest` above: the rules here are about what a value
  *is* rather than what it reads like, and the provenance of a year is not on
  the record. Read lazily and cached, because most runs never reach the company
  rules at all.
*/
const COMPANY_HARVEST = path.join(HERE, 'raw', 'company-games.json')

type CompanyEntry = {
  history?: { formerNames?: string | null; parent?: string | null; defunct?: string | null } | null
  titles?: { title?: string; year?: string | null; source?: string }[]
}

let companyHarvest: Record<string, CompanyEntry> | null = null

const readCompanyHarvest = (): Record<string, CompanyEntry> => {
  if (companyHarvest) return companyHarvest
  companyHarvest = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(COMPANY_HARVEST, 'utf8'))
    companyHarvest = (parsed.companies ?? {}) as Record<string, CompanyEntry>
  } catch {
    /* No harvest means fewer findings, never more — and never a wrong one:
       every rule below treats an unknown row as a stated release year, which
       is the reading that reports rather than the one that hides. */
  }
  return companyHarvest
}

const companyHistory = (slug: string): CompanyEntry['history'] =>
  readCompanyHarvest()[slug]?.history ?? null

/**
 * The same normalisation `seed:company-games` stores a catalogue row under, so
 * a row on the record can be matched back to the harvest row it came from.
 */
const key = (title?: string | null): string => {
  const reduced = String(title ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
  return reduced || String(title ?? '').trim().toLowerCase()
}

/** Per company, the rows whose year is a shop's listing date and not a release. */
const storeListingYears = (): Map<string, Set<string>> => {
  const index = new Map<string, Set<string>>()
  for (const [slug, entry] of Object.entries(readCompanyHarvest())) {
    const steam = new Set(
      (entry.titles ?? []).filter((row) => row.source === 'steam').map((row) => key(row.title)),
    )
    if (steam.size > 0) index.set(slug, steam)
  }
  return index
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const findings: Finding[] = []
  const harvest = readHarvest()

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  const gameSlug = new Map<string | number, string>()
  const gameTitle = new Map<string | number, string>()
  for (const game of games.docs as unknown as {
    id: string | number
    slug: string
    title: string
  }[]) {
    gameSlug.set(game.id, game.slug)
    gameTitle.set(game.id, game.title)
  }

  // Companies the network already knows about, by name.
  const known = new Set<string>()
  try {
    const companies = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
    for (const company of companies.docs as unknown as { name: string }[]) {
      known.add(company.name.trim().toLowerCase())
    }
  } catch {
    // The collection may not exist yet on an older database.
  }

  for (const collection of GAME_SCOPED) {
    if (collection === 'guides') continue

    /*
      Nor factions, and for the same reason `seed:prune-entities` skips them.

      `REVIEWED_NOT_ENTITIES` lists thirty-five organisations *because* they
      belong here — the Galactic Republic, the Locust Horde, the Federal
      Bureau of Control. Asking that list about this collection reports every
      one of them as a record of the wrong kind, which is the exact inverse of
      the truth: they are the only records on the site that are filed right.
      Left in, it printed "35 wrong" and failed the run on a clean database.
    */
    if (collection === 'factions') continue

    const docs = await payload.find({ collection, limit: 10000, depth: 0 })
    const byTitle = new Map<string, string[]>()

    for (const doc of docs.docs as unknown as {
      slug?: string
      title?: string
      game?: unknown
      sources?: { url?: string | null }[] | null
    }[]) {
      const title = String(doc.title ?? '').trim()
      const where = `${collection}/${String(doc.slug)} [${gameSlug.get(doc.game as string | number) ?? '?'}]`
      const url = doc.sources?.[0]?.url

      const key = `${String(doc.game)}::${title.toLowerCase()}`
      if (!byTitle.has(key)) byTitle.set(key, [])
      byTitle.get(key)!.push(String(doc.slug))

      if (!url) continue

      const slug = gameSlug.get(doc.game as string | number) ?? '?'
      const raw = harvest.get(`${slug}|${title.toLowerCase()}`)
      const candidate = {
        title,
        url,
        categories: raw?.categories ?? null,
        facts: raw?.facts ?? null,
      }

      // --- wrong: the record is a place, and the page is an event ---------
      if (collection === 'regions' && isNotAPlace(candidate)) {
        findings.push({
          level: 'wrong',
          line: `${where} "${title}" is an event, not a place — ${(raw?.categories ?? []).join(', ')}`,
        })
        continue
      }

      // --- wrong: the record is a combatant, and the page is an event ------
      /*
        `Emergence Day` was in `enemies`, which meant the autolinker turned
        every mention of the phrase on the Gears wiki into a link to a page
        describing the day the Locust invaded as something you fight. The link
        was right for where the record was; the record was in the wrong place.

        Mechanical rather than worth-a-look, and read off the wiki's own
        conflict template rather than off the title — see `isAnEvent`. Only
        these two collections: an event in `quests` is the mission the game
        makes of it, and 26 of the 33 events on these wikis are exactly that.
      */
      if (
        (collection === 'enemies' || collection === 'characters') &&
        isAnEvent(candidate)
      ) {
        findings.push({
          level: 'wrong',
          line: `${where} "${title}" is an event, not a ${collection === 'enemies' ? 'creature' : 'person'} — its infobox is a conflict box (${Object.keys(
            raw?.facts ?? {},
          )
            .filter((key) => /^(conflict|side|commander|forces|casual|unit|ppl|outcome|participants|keyparties|event_)/i.test(key))
            .join(', ')})`,
        })
        continue
      }

      // --- wrong: the wiki's own URL says what it is ----------------------
      if (isNotAnEntity(candidate, gameTitle.get(doc.game as string | number) ?? '')) {
        findings.push({ level: 'wrong', line: `${where} "${title}" — ${url}` })
        continue
      }

      // --- wrong: we have a company profile for this exact name -----------
      if (known.has(title.toLowerCase())) {
        findings.push({
          level: 'wrong',
          line: `${where} "${title}" is a company with its own profile`,
        })
        continue
      }

      // --- review: reads like a work or a studio --------------------------
      if (LOOKS_LIKE_A_WORK.test(title) || LOOKS_LIKE_A_COMPANY.test(title)) {
        findings.push({ level: 'review', line: `${where} "${title}"` })
        continue
      }

      // --- review: the page looks like it is about somebody real -----------
      /*
        `isARealPerson` in `src/lib/harvest.ts` removes these, and it is
        looking for two things neither the Control wiki nor Wookieepedia
        happens to say. Its category test is anchored - `/^(the )?real[-
        ]world$/` - and Wookieepedia's category is "Real-world people", so
        eighteen voice actors are live as *characters* in Star Wars Zero
        Company. Its infobox test needs an occupation of actor *and* a
        `portrayed` field naming the part, and Control's cast infoboxes give
        `occupation: Actor` with `affiliation: Remedy Entertainment` and no
        `portrayed` at all, so Courtney Hope, James McCaffrey and Matthew
        Porretta are live as characters in Control Resonant - all three of
        whom also have a profile on the people host, which is where a
        performer belongs.

        Printed and never failing, and deliberately *not* wired into the
        delete rule. Widening that anchor is a one-character change and the
        records it would remove are twenty-one that a person should look at
        first: "Cast" is what this wiki calls its actors and could be what
        another one calls its characters, which is the shape of the rule that
        deleted Antar 4. So this tier says where to look and the decision
        stays with somebody who can open the pages.
      */
      const categories = raw?.categories ?? []
      const occupation = raw?.facts?.occupation ?? raw?.facts?.Occupation ?? ''
      const signals = [
        ...categories.filter((name) =>
          /real[- ]world|^actors who |voice actors?$|^cast$|^crew$/i.test(name.trim()),
        ),
        /^(actor|actress|voice actor|voice actress)$/i.test(occupation.trim())
          ? `occupation: ${occupation}`
          : '',
      ].filter(Boolean)
      if (signals.length > 0) {
        findings.push({
          level: 'review',
          line: `${where} "${title}" reads as a real person — ${signals.slice(0, 3).join('; ')}`,
        })
      }
    }

    for (const [key, slugs] of byTitle) {
      if (slugs.length < 2) continue
      findings.push({
        level: 'wrong',
        line: `${collection} "${key.split('::')[1]}" appears ${slugs.length} times: ${slugs.join(', ')}`,
      })
    }
  }

  // --- review: a closure date something else on the page argues with --------
  /*
    `/atlus` printed "No longer operating (1 October 2010)" over twenty-six
    titles dated 2019 to 2027, with a live Official site button between them.
    Twenty-two of the seventy defunct profiles read that way, and atari-inc has
    sixty later titles running to 2026.

    Two rules, and separating them is the whole point, because the twenty-two
    were two quite different things wearing one finding.

    Both stay worth-a-look and never a failure: a dead brand really does go on
    being re-released, and the answer on any one profile is a judgement about
    which of two sourced facts is about the entity the page presents. Deciding
    it mechanically would either delete real closure dates or strip real
    catalogues. `DEFUNCT_NOT_THIS_COMPANY` in `./companies` is where a decided
    one goes, and a slug on that list is not reported again.
  */
  try {
    const companies = await payload.find({ collection: 'companies', limit: 1000, depth: 0 })
    const listing = storeListingYears()
    for (const company of companies.docs as unknown as {
      slug: string
      defunct?: string | null
      titles?: { title?: string | null; year?: string | null }[] | null
    }[]) {
      if (DEFUNCT_NOT_THIS_COMPANY[company.slug]) continue
      const closed = year(company.defunct)
      if (!closed) continue

      // --- the company's own infobox contradicts the date it states -------
      /*
        A rename or an ownership range dated after the closure, which is a
        contradiction inside one source rather than between two: a company
        cannot be renamed, or acquire a parent, after it has ceased to exist.
        This is the rule that finds Atlus for the right reason - `formerNames`
        "Index Corporation (2013-2014)" and `parent` "Sega (2013-present)"
        beside a `defunct` of 1 October 2010 - and it finds it whatever the
        catalogue says, which the catalogue rule below does not.

        Two of the seventy match, and the second is the reason this is a
        reading rather than a deletion: Atari Games' parent runs to 2003 after
        a stated closure of 1999, and its `fate` says it was "reformed as
        Midway Games West; later closed by same company". Whether the page is
        about the brand that ended in 1999 or the entity that ended in 2003 is
        not something a rule can settle.
      */
      const history = companyHistory(company.slug)
      for (const [field, value] of [
        ['formerNames', history?.formerNames],
        ['parent', history?.parent],
      ] as const) {
        if (!value) continue
        const present = /\bpresent\b/i.test(value)
        const after = [...value.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)]
          .map((match) => Number(match[1]))
          .filter((found) => found > closed)
        if (!present && after.length === 0) continue
        findings.push({
          level: 'review',
          line:
            `companies/${company.slug} closed ${company.defunct} but its own infobox dates ` +
            `${field} ${present ? 'to the present' : `to ${Math.max(...after)}`} — ${value}`,
        })
      }

      // --- the catalogue lists a later release ----------------------------
      /*
        Only against a year a source states as a *release* year, which is what
        the first version of this rule got wrong and is why sixteen of the
        twenty-two findings were about nothing at all.

        A Steam row's year is the date the storefront put the title on sale.
        `fetch-company-games.mjs` says so in its own comment and keeps the raw
        value under `steamReleased` for exactly this reason - Max Payne came
        out in 2001 and reached Steam in 2008. So Beam Software, which closed
        in 2010, listed fifteen of fifteen titles "after" it: Radical Rex is a
        1994 Mega Drive game dated 2019 because 2019 is when it was re-listed.
        Atari, Inc. listed sixty. Comparing a closure year against a shop's
        listing date is comparing two different kinds of fact, which is the
        same defect as `changefreq` against `lastmod`.

        The harvest is re-read for the provenance because the stored row does
        not carry it - the same reason the entity rules above re-read
        `raw/wiki-entities`. A row the harvest does not know is a row somebody
        typed, and a hand-typed year is a release year, so it still counts.
      */
      const steam = listing.get(company.slug)
      const later = (company.titles ?? [])
        .filter((row) => !steam?.has(key(row.title)))
        .map((row) => year(row.year))
        .filter((value): value is number => value !== undefined && value > closed)
      if (later.length === 0) continue
      const latest = Math.max(...later)
      findings.push({
        level: 'review',
        line:
          `companies/${company.slug} closed ${company.defunct} but lists ` +
          `${later.length} of ${(company.titles ?? []).length} titles with a stated release year ` +
          `after ${closed}, latest ${latest}`,
      })
    }
  } catch {
    // The collection may not exist yet on an older database.
  }

  const wrong = findings.filter((f) => f.level === 'wrong')
  const review = findings.filter((f) => f.level === 'review')

  if (wrong.length > 0) {
    console.log(`\nwrong (${wrong.length})`)
    for (const f of wrong) console.log(`  ${f.line}`)
  }
  if (review.length > 0) {
    console.log(`\nworth a look (${review.length}) — read these, do not bulk-delete them`)
    for (const f of review) console.log(`  ${f.line}`)
  }
  if (findings.length === 0) {
    console.log('\nevery record looks like the kind of thing it is filed as.')
  }

  console.log(
    `\n${wrong.length} wrong, ${review.length} worth a look.` +
      (wrong.length > 0 ? ' Run `pnpm seed:prune-entities` for the mechanical ones.' : ''),
  )
  process.exit(wrong.length > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
