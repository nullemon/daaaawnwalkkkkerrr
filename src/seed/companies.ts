import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { CollectionSlug, Payload } from 'payload'
import { slugify } from '../fields/shared'
import { withoutLegalSuffix } from '../lib/rightsholders'

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

const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December)'

/**
 * A founding date, or nothing.
 *
 * The infobox field is not always a date. Four of them open with a *place*,
 * because the article wrote "[[Grenoble]] (Meylan), [[France]] (2005)" into
 * the founding field — and the profile printed "AGEod is a games company
 * founded Grenoble", with `Founded / Grenoble (Meylan), France (2005)` in the
 * panel beside it. The sentence was composed by cutting the value at its first
 * bracket, which on a value shaped like that cuts off everything except the
 * place.
 *
 * So: a value that opens with a date is kept whole, because the rest of it is
 * usually the useful part ("2009 (as Tecmo Koei Holdings)"). A value that does
 * not is reduced to the year it carries, which is the only part of it that is
 * a founding date. One that carries no year at all is refused — a blank row is
 * honest and a place in a date field is not.
 */
export const foundedValue = (value?: string | null): string | undefined => {
  const text = String(value ?? '')
    /*
      "September 1, 2006; 16 years ago" — the second half was true in 2022 and
      is recomputed by the template on every page view *there*, while here it
      is frozen on the day it was read. A relative age in stored text is a
      figure that goes wrong by itself.
    */
    .replace(/[;,]?\s*\d+\s+years?\s+ago\b/i, '')
    .trim()
  if (!text) return undefined

  const leadsWithDate = new RegExp(
    `^\\s*(c\\.|circa|est\\.?)?\\s*(${MONTH},?\\s+(\\d{1,2},?\\s+)?)?(\\d{1,2}\\s+${MONTH}\\s+)?(1[5-9]\\d{2}|20\\d{2})\\b`,
    'i',
  ).test(text)
  if (leadsWithDate) return text

  /* Not a date. Whatever year it carries is the only part of it that is one. */
  const year = text.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1]
  return year ?? undefined
}

/**
 * The year a company closed, out of whatever its `defunct` field says.
 *
 * One reader for the two sentences that state the closure - this file's lede
 * and the body paragraph in `company-games.ts` - because they sit on the same
 * page and a page that dates the same event twice must date it the same way.
 * 989 Studios' field reads "2000 (2000) (original), 2005 (2005)"; both
 * sentences take 2000 from it or neither does.
 *
 * `undefined` where no year survives. The field still means the company is
 * gone; it is only the date that is missing, and a close this cannot date is
 * written without one rather than with a guess.
 */
export const closureYear = (value?: string | null): string | undefined =>
  usable(closureText(value))?.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]

/**
 * A `defunct` value the infobox says is not about this company.
 *
 * Reviewed one at a time, with the words that decided it, because two facts
 * that each came from a source can still contradict each other and only a
 * person can say which one is about the entity the page presents. What is *not*
 * evidence is the catalogue: sixteen of the twenty-two profiles `check:kind`
 * reported were reported for a comparison that never held — see the note on
 * the catalogue rule there.
 *
 * Both of these are the same shape, and the evidence is inside the one
 * infobox that states the closure:
 *
 *   atlus            `defunct` is 1 October 2010, and the same box gives
 *                    `formerNames` "Sega Dream Corporation (2013), Index
 *                    Corporation (2013–2014)" and `parent` "… Sega
 *                    (2013–present)". A company cannot be renamed twice and
 *                    owned "to present" three years after it ceased to exist.
 *                    The date is the predecessor entity's.
 *
 *   argonaut-games   `defunct` is 1 October 2004, and the same box says
 *                    `fate` "Liquidated (original incarnation)" and gives
 *                    `headquarters` as "Edgware, London, UK (original), Frisco,
 *                    TX, USA (relaunch)". The source itself scopes the date to
 *                    an incarnation and then names the one that followed it.
 *
 * Cleared rather than corrected, because nothing here states a closure date
 * for the company as its page presents it, and there is no date to put in its
 * place that a source gives. A gap is fine; a wrong figure is not — it was
 * rendering as a red "No longer operating" banner over a catalogue running to
 * 2027, which is this site telling a reader something false in its loudest
 * voice.
 *
 * Refused here rather than fixed in the database, because
 * `seed:company-games` fills `defunct` wherever the field is empty: a row
 * corrected by hand comes back wrong on the next `pnpm db:reset`. Same
 * relationship `seed:prune` has with the guide generators.
 */
export const DEFUNCT_NOT_THIS_COMPANY: Record<string, string> = {
  atlus: 'renamed in 2013 and owned by Sega "to present" — the 2010 date is the predecessor entity',
  'argonaut-games':
    'the infobox scopes it itself: "Liquidated (original incarnation)", with a relaunch headquarters beside it',
}

/**
 * The closure value with the date template's own duplicate removed.
 *
 * 989 Studios' field reads `2000 (2000) (original), 2005 (2005)` — Wikipedia's
 * `{{Start date}}` family prints the date and then prints it again in a
 * machine-readable span, and the harvester's "N years ago" strip did not cover
 * this shape of it. What reached the profile was a red banner reading "No
 * longer operating (2000 (2000) (original), 2005 (2005))".
 *
 * Only an exact repeat of the year immediately before it is dropped, so this
 * cannot change what the field says: `2000 (2000)` becomes `2000`, and
 * `2000 (original)` is left completely alone. It does **not** decide which of
 * the two dates 989 Studios' field carries is the one about the company as the
 * page presents it — the source labels the first "(original)" and settles
 * nothing else, so that stays a `check:kind` finding for somebody to read.
 */
export const closureText = (value?: string | null): string | undefined => {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const tidied = text.replace(/\b(1[89]\d{2}|20\d{2})\s*\(\1\)/g, '$1').replace(/\s{2,}/g, ' ').trim()
  return tidied || undefined
}

/**
 * Any mark that says which money a figure is in.
 *
 * Kept in step with `CURRENCY_MARK` in `tools/fetch-companies.mjs`, which
 * prints a currency-less revenue as a finding at the end of a harvest. This is
 * the other half: the harvest can be wrong, and a figure that reaches this
 * point without a unit does not reach the page.
 */
const CURRENCY_MARK =
  /(US\$|A\$|C\$|NZ\$|HK\$|NT\$|R\$|CN¥|[$€£¥₹₩₽₺])|\b(USD|EUR|GBP|JPY|CNY|RMB|KRW|INR|AUD|CAD|CHF|SEK|NOK|DKK|PLN|RUB|TRY|BRL|TWD|HKD|SGD|NZD|dollars?|euros?|yen|yuan|renminbi|won|pounds?|rupees?|kronor|krona|z(ł|l)oty|reais)\b/i

/**
 * A revenue figure, or nothing.
 *
 * Twenty-four of fifty harvested revenues carried no currency, because the
 * money template's *name* is the unit and the parser kept only its arguments:
 * Sega's read "247.7 billion", which is yen, and which an English reader reads
 * as dollars — wrong by a factor of about a hundred and fifty. One read
 * "billion (2023)" with no number in it at all.
 *
 * The harvester puts the unit back now. This refuses whatever still arrives
 * without one, because there is no way to tell from "8.0 billion" which
 * currency was lost, and guessing is the fabricated figure this project exists
 * to avoid. A missing row says nothing; a unitless one says something false.
 */
export const revenueValue = (value?: string | null): string | undefined => {
  const text = usable(value)
  if (!text) return undefined
  if (!/\d/.test(text)) return undefined
  return CURRENCY_MARK.test(text) ? text : undefined
}

/**
 * Does this company's own article call it a games company?
 *
 * The profile said "X is a games company" for anything with a harvested
 * article, which put "Paramount Pictures is a games company founded 1912" on
 * the network with `Industry / Film` in the panel next to it. At least
 * eighteen are not games companies — Tencent is a conglomerate, Microsoft is
 * information technology, Asatsu-DK is an advertising agency, EQT AB is
 * investment management. The field was there the whole time.
 */
const GAMES_INDUSTRY =
  /\b(video ?games?|computer (and )?video games?|computer games?|browser games?|mobile gam(e|ing)|social gaming|interactive entertainment|video game (industry|develop(er|ment)|publish(er|ing)))\b/i

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
/**
 * The credit line on a company's logo.
 *
 * **The company, not the uploader.** Commons records an `Artist` for a logo
 * file and it is usually whoever drew the SVG or pushed the button, not whoever
 * owns the mark — the same field that once made `src/seed/posters.ts` publish
 * "Steam" and "Eurogamer" as the copyright holders of two cover arts. A logo's
 * owner is the company it belongs to, in every case, with no lookup required.
 *
 * The word is **trademark**, deliberately, and it is not interchangeable with
 * copyright. Around half of these files are public domain — a logo made of
 * type and flat shapes falls below the threshold of originality, which is why
 * this network may host them at all — and printing `©` over one would assert a
 * copyright the file does not carry. The trademark is a separate right, it is
 * held by the company whatever the copyright status, and saying so is true of
 * a public-domain wordmark and a non-free one alike.
 *
 * The licence still prints, because it is the thing that says why this file is
 * here. `creditBasis` reads it before it looks for a `©`, so a public-domain
 * logo is filed as licensed rather than as all-rights-reserved.
 */
const logoCredit = (company: string, licence?: string | null): string =>
  [`${company} logo`, `— a trademark of ${company}`, licence ? `(${licence})` : '']
    .filter(Boolean)
    .join(' ')

const fetchLogo = async (
  payload: Payload,
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
  if (existing.docs[0]) {
    /*
      Reused, but re-credited. These rows were written with the Commons
      uploader's name in them, and a change to the wording would otherwise
      reach a fresh database and no existing one — the split that
      `correctConfidenceCopy` had to close for copy and `attachImage` for alt
      text. Only the credit is touched; the file is not re-fetched.
    */
    const row = existing.docs[0] as { id: string | number; credit?: string | null }
    const wanted = logoCredit(company, logo.licence)
    if (row.credit !== wanted) {
      await payload.update({
        collection: 'media',
        id: row.id,
        data: { credit: wanted } as never,
        depth: 0,
      })
    }
    return row.id
  }

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

    const credit = logoCredit(company, logo.licence)

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

/**
 * `null` where a harvested value was read and refused, `undefined` where there
 * was nothing to read.
 *
 * Payload treats `undefined` as "leave this field alone", which is right for a
 * field the harvest never carried — an editor may have typed one — and wrong
 * for one this pass has just decided is not publishable. Without the
 * difference, re-running the seeder would fix the sentence and leave
 * `Founded / Grenoble (Meylan), France (2005)` sitting in the panel below it.
 */
const refused = (raw: string | null | undefined, kept: string | undefined): string | null | undefined =>
  kept ?? (String(raw ?? '').trim() ? null : undefined)

const splitHolders = (value?: string | null): string[] =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

/**
 * The owners a company's infobox still claims, out of everyone it lists.
 *
 * Wikipedia's `parent` field is a history, in order: Sega's names Gulf and
 * Western, Paramount Pictures, SCSK and Sega Sammy Holdings, and only the last
 * of those owns it. Where the article dates an entry — "Viacom (1952–2005)" —
 * that entry's ownership has demonstrably ended and it is dropped, which is
 * reading the source rather than guessing at it. A range with no end
 * ("2014–present") is current and stays.
 *
 * What is left may still be more than one, and then the caller writes nothing.
 * Taking the first was how "Sega is owned by Paramount Pictures" reached the
 * network; taking the last would be the same coin flip with better odds.
 */
export const currentOwners = (names: string[]): string[] =>
  names
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => !/\(\s*(c\.|circa)?\s*\d{4}\s*[–-]\s*\d{4}\s*\)/.test(name))

/** "A and B" / "A, B and C". */
const listSentence = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * The sentence a company with a harvested article but no game of ours gets.
 *
 * Exported shape rather than an inline expression because two passes compose
 * it: the main loop, from today's harvest, and the migration below, from the
 * fields a previous harvest already stored on a record this one no longer
 * names. One composer, so the two cannot disagree about what a company is.
 */
export const fromFacts = (
  name: string,
  facts: {
    industry?: string | null
    founded?: string | null
    headquarters?: string | null
    defunct?: string | null
  },
): string => {
  const industry = usable(facts.industry)
  const founded = foundedValue(facts.founded)
  const where = usable(facts.headquarters)
  /*
    A closed company is spoken about in the past, and the closure is in this
    sentence rather than only in the banner above it.

    `/38-studios` read "38 Studios is a games company, founded 2006 ... and
    based in Providence, Rhode Island" over a red closure banner and a body
    saying "The company closed in 2012" - and because the summary is also the
    `<meta description>`, the one place the closure was stated was the one
    place a search result cannot reach. Seventy records were worded that way.
    A sentence that survives on its own has to carry the fact on its own.
  */
  const gone = Boolean(usable(facts.defunct))
  const closed = closureYear(facts.defunct)

  /*
    What it is comes from the `industry` field rather than from the fact that
    a games project harvested it. "Paramount Pictures is a games company
    founded 1912" was live, with `Industry / Film` in the panel beside it; so
    was the same sentence about a conglomerate, an advertising agency and an
    investment manager.
  */
  const was = gone ? 'was' : 'is'
  const lead = !industry
    ? `${name} ${was} a company`
    : GAMES_INDUSTRY.test(industry)
      ? `${name} ${was} a games company`
      : /* The article still gives it, whatever became of the company, so this
           half stays in the present. */
        `${name} ${was} a company whose own article gives its industry as ${industry}`

  const tail = [founded ? `founded ${founded}` : '', where ? `based in ${where}` : ''].filter(Boolean)
  const opening = tail.length > 0 ? `${lead}, ${listSentence(tail)}.` : `${lead}.`
  /*
    Dated where a year survives, undated where one does not - the same rule the
    body composer in `company-games.ts` follows, and the same reason: "The
    company closed in 8 May 2015" is a missing preposition, and a close nobody
    can date is still a close.
  */
  const closure = closed ? `It closed in ${closed}.` : gone ? 'It is no longer operating.' : ''
  /*
    A claim about this record rather than about the article: the field can be
    empty because nobody wrote an industry or because nothing here could read
    what was written, and only the first would justify "states no industry".
  */
  return [opening, closure, industry ? '' : 'Its industry is not recorded here.']
    .filter(Boolean)
    .join(' ')
}

async function run(): Promise<void> {
  /*
    Imported here rather than at the top of the file so that
    `companies.test.ts` can pin the refusal rules without booting Payload,
    sharp and a database connection to do it — the same guard
    `company-officers.ts` carries, for the same reason.
  */
  await import('dotenv/config')
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'title' })
  const drafts = new Map<string, Draft>()

  /*
    One company is one draft however its name was written down.

    A store page says "Valve" and Wikipedia titles the article "Valve
    Corporation". Treated as two names those are two drafts, two slugs and two
    profiles — one carrying the games, the other carrying the logo — which is
    why eleven of the twenty-three studios behind these games looked as though
    no logo existed for them.

    **The test is not "same once both are stripped".** That was the first rule
    here and it merged `Atari, Inc.` into `Atari SA`, which are two genuinely
    different companies that happen to share a stem — the Antar 4 mistake in a
    new place, and this time it would have put one company's games and logo on
    the other's page rather than deleting a moon.

    So one name has to be *exactly* the other plus a legal suffix: strip one
    and it must equal the other as written. "Valve Corporation" stripped is
    "Valve", which is a name we hold, so they are one. "Atari, Inc." stripped
    is "Atari", which is not "Atari SA", and "Atari SA" stripped is "Atari",
    which is not "Atari, Inc." — so they stay two.

    The first spelling seen wins the display name, and the games are read
    first, so a profile is titled the way the game that names it does.
  */
  const aliased: string[] = []
  /** Stripped name -> the draft holding it, for the alias test only. */
  const byStem = new Map<string, Draft>()

  const draftFor = (name: string): Draft => {
    const exact = name.toLowerCase()
    const held = drafts.get(exact)
    if (held) return held

    const stem = withoutLegalSuffix(name).toLowerCase()
    const candidate = byStem.get(stem)
    if (candidate) {
      const candidateName = candidate.name.toLowerCase()
      const candidateStem = withoutLegalSuffix(candidate.name).toLowerCase()
      if (stem === candidateName || exact === candidateStem) {
        drafts.set(exact, candidate)
        aliased.push(`${name} -> ${candidate.name}`)
        return candidate
      }
    }

    const draft: Draft = {
      name,
      roles: new Set(),
      games: [],
      gameTitles: [],
      sources: [],
      foundOn: [],
    }
    drafts.set(exact, draft)
    if (!byStem.has(stem)) byStem.set(stem, draft)
    return draft
  }

  /*
    An aliased name puts the *same* draft object under a second key, so the map
    can yield one company twice. Every pass over the drafts below goes through
    this instead — writing a merged company twice would create the duplicate
    profile the merge exists to prevent.
  */
  const uniqueDrafts = (): Draft[] => [...new Set(drafts.values())]

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
  /*
    The second source: logos found by searching Commons directly, for the
    companies whose Wikipedia infobox names a non-free file or names none.

    Wikidata was tried first and is not it — `P154` produced zero correctly
    attributed logos for the eight studios that most needed one, and the single
    claim that existed carried an end-time qualifier because the company had
    been renamed. `tools/fetch-company-logos.mjs` carries that finding in full.

    Kept as its own manifest rather than merged into the harvest: one file is a
    record of what Wikipedia said and the other of what Commons said, and a
    pass that blurred them would make the provenance of a logo unanswerable.
  */
  const COMMONS_LOGOS = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'raw',
    'company-logos.json',
  )
  const commonsLogos: Record<
    string,
    { file: string; url: string; licence: string; artist?: string }
  > = fs.existsSync(COMMONS_LOGOS)
    ? (JSON.parse(fs.readFileSync(COMMONS_LOGOS, 'utf8')).logos ?? {})
    : {}
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

  for (const draft of uniqueDrafts()) {
    const slug = slugify(draft.name)
    if (!slug) continue

    /*
      Read before the sentence is composed, not after it is written.

      `defunct` is not in this harvest - `seed:company-games` puts it there
      from the company's own infobox - so the only place this pass can learn
      that a company has closed is the record it is about to overwrite. Fetched
      here rather than at the update below, which is where it used to happen
      and which is why the lede could not know.
    */
    const existing = await payload.find({
      collection: 'companies',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })
    const stored = existing.docs[0] as { id: string | number; defunct?: string | null } | undefined

    /*
      Empty where nothing states one, which is most of them.

      The field defaulted to `['developer']`, so two hundred and ninety-four
      companies were badged Developer because that is what a schema default
      does — not because a source said so. Paramount Pictures, Vivendi and
      Activision Blizzard all read `Role / Developer`, and the word was in the
      fact panel, on the index card and in the `<title>` tag. Only a game
      record naming them as developer or publisher puts a role here now; the
      renderers drop the row rather than printing a placeholder.
    */
    const roles: Role[] = [...draft.roles]

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
      /* A company with a harvested article but no game of ours: the sentence
         is built from its own infobox and says nothing this network cannot
         show a source for. See `fromFacts`. */
      summary = fromFacts(draft.name, { ...facts, defunct: stored?.defunct })
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

    /*
      The infobox's logo first, then Commons. The order is deliberate: a file
      the company's own article uses is better evidence that it is the current
      mark than a search hit is, and the search only ever runs for a company
      the first source could not serve.
    */
    const fromCommons = commonsLogos[slug]
    const logoId =
      (await fetchLogo(payload, draft.name, facts?.logo)) ??
      (fromCommons
        ? await fetchLogo(payload, draft.name, {
            file: fromCommons.file,
            free: true,
            url: fromCommons.url,
            licence: fromCommons.licence,
            artist: fromCommons.artist ?? null,
          })
        : null)
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
      founded: refused(facts?.founded, foundedValue(facts?.founded)),
      headquarters: usable(facts?.headquarters),
      industry: usable(facts?.industry),
      keyPeople: usable(facts?.keyPeople),
      employees: usable(facts?.employees),
      revenue: refused(facts?.revenue, revenueValue(facts?.revenue)),
      website: usable(facts?.website),
      basis: facts?.basis ?? (draft.gameTitles.length > 0 ? 'network-game' : 'related-company'),
      ...(logoId ? { logo: logoId } : {}),
    }

    if (stored) {
      await payload.update({ collection: 'companies', id: stored.id, data: data as never })
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

  /*
    --- 4b. Records this run did not write ---------------------------------

    A company harvested by an earlier run and not named by today's - the
    harvest is capped, and what falls inside the cap moves - is never touched
    by the loop above. Which meant the fixes above reached three hundred and
    two records and left seventeen sitting at exactly what was being
    fixed: `role: ['developer']` from the old schema default on Bandai, on
    Happinet, on a studio whose own summary says nothing is established about
    it; "is a games company" on a toy maker; a founding date holding a place.

    Their stored fields came from a real harvest, so the record is not wrong to
    exist and is not re-researched here. Only the three claims this pass is
    responsible for are re-decided, and the summary only where it is still the
    sentence this pass wrote — an editor's is theirs.
  */
  const written = new Set(uniqueDrafts().map((draft) => slugify(draft.name)))
  let realigned = 0
  for (const company of all.docs as unknown as {
    id: string | number
    slug: string
    name: string
    role?: string[] | null
    summary?: string | null
    industry?: string | null
    founded?: string | null
    headquarters?: string | null
    revenue?: string | null
    /* So the recomposed sentence below can put a closed company in the past
       tense, the same as the loop above. */
    defunct?: string | null
  }[]) {
    if (written.has(company.slug)) continue
    const data: Record<string, unknown> = {}

    if ((company.role ?? []).length > 0) data.role = []

    const founded = foundedValue(company.founded)
    if (company.founded && founded !== company.founded) data.founded = founded ?? null
    const revenue = revenueValue(company.revenue)
    if (company.revenue && revenue !== company.revenue) data.revenue = revenue ?? null

    /* Ours only: the sentence this pass composes, still worded as it wrote it.
       "is" *or* "was", because this pass now writes both and a rule that only
       recognises the present tense stops recognising its own work the moment a
       company closes. */
    if (new RegExp(`^${company.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (is|was) a games company\\b`).test(company.summary ?? '')) {
      const recomposed = fromFacts(company.name, company)
      if (recomposed !== company.summary) data.summary = recomposed
    }

    if (Object.keys(data).length === 0) continue
    await payload.update({ collection: 'companies', id: company.id, data: data as never })
    realigned += 1
    console.log(`  migrated ${company.slug}: ${Object.keys(data).join(', ')}`)
  }

  let linked = 0
  const ambiguous: string[] = []
  for (const draft of uniqueDrafts()) {
    const facts = draft.facts
    if (!facts) continue
    const id = idBySlug.get(slugify(draft.name))
    if (!id) continue

    const resolve = (names: string[]) =>
      names
        .map((name) => idBySlug.get(slugify(plainName(name))))
        .filter((value): value is string | number => value !== undefined)

    const owners = currentOwners(facts.parents)
    /*
      One owner or none. `parentIds[0]` took whichever name resolved first out
      of a field that lists them in the order they held the company, and the
      profile printed it in the present tense: Sega read "Owned by Paramount
      Pictures", who sold it in 1984; Activision Blizzard read "Owned by
      Vivendi"; Paramount Pictures itself read "Owned by Gulf and Western
      Industries", dissolved in 1989.

      Forty-three of three hundred name more than one, and where the article
      dates them this drops the ones whose ownership has demonstrably ended —
      reading the source rather than resolving it. Where more than one is still
      standing, nothing is written and the company is printed below. Picking
      the first was a coin flip; picking the last would be another one, and the
      rule here is to record a conflict rather than resolve it.
    */
    const parentIds = owners.length === 1 ? resolve(owners) : []
    if (owners.length > 1) ambiguous.push(`${draft.name} — ${owners.join(' / ')}`)
    const subsidiaryIds = resolve(facts.subsidiaries).filter((value) => value !== id)

    /*
      `null` rather than omitted, so a run that now refuses an owner clears the
      one a previous run asserted. Omitting the key leaves the wrong sentence
      on the page and nothing anywhere saying it is still there.
    */
    await payload.update({
      collection: 'companies',
      id,
      data: {
        parent: parentIds[0] ?? null,
        ...(subsidiaryIds.length > 0 ? { subsidiaries: subsidiaryIds } : {}),
      } as never,
    })
    if (parentIds.length > 0 || subsidiaryIds.length > 0) linked += 1
  }

  console.log(`\nmigrated out of game collections: ${migrated.length}`)
  for (const row of migrated) console.log(`  ${row}`)
  console.log(`\ncompanies: ${created} created, ${updated} updated`)
  console.log(`records the harvest no longer names, brought into line: ${realigned}`)
  console.log(`logos downloaded where the licence allowed it: ${logos}`)
  if (aliased.length > 0) {
    /*
      Printed rather than silent. A merge is the right answer and it is also
      the operation most able to be wrong in a way nothing else would catch —
      two studios folded into one would put one company's games on another's
      page, with both profiles still rendering perfectly.
    */
    console.log(`
${aliased.length} name${aliased.length === 1 ? '' : 's'} merged as the same company:`)
    for (const row of aliased) console.log(`  ${row}`)
    console.log('  Read these: only a legal suffix may differ. Anything else is two companies.')
  }
  console.log(`corporate links written on ${linked} of them${harvestedAt ? ` (facts read ${harvestedAt})` : ''}`)
  /*
    The finding, not the failure. Each of these names more than one owner that
    its own article does not date, so no page on this host says who owns them —
    which is the honest answer until somebody reads the article and decides.
  */
  if (ambiguous.length > 0) {
    console.log(`\n${ambiguous.length} name more than one current owner, so none is claimed:`)
    for (const row of ambiguous) console.log(`  ${row}`)
  }
  process.exit(0)
}

/*
  Only when this file is what was run.

  Without the guard, importing it to test `foundedValue` would seed the
  database as a side effect of the import.
*/
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
/* Case-insensitively, because Windows hands back the drive letter either way. */
if (invoked.toLowerCase() === import.meta.url.toLowerCase()) {
  run().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
