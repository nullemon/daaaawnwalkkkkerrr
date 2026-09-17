import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { CollectionSlug, Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'
import { slugify } from '../fields/shared'
import { fold, splitFactValue } from '../lib/entity-links'

/**
 * Factions, from the affiliation values the harvest already held.
 *
 *   pnpm seed:factions
 *
 * ## What was sitting unused
 *
 * Every harvested wiki states affiliation in its infoboxes — `affiliation`,
 * `allegiance`, `faction` — and across the seven of them a few hundred of
 * those values name an organisation: the Coalition of Ordered Governments,
 * the Federal Bureau of Control, the Hiss. `pnpm seed:entity-links`
 * deliberately left every one of them alone, and its own comment says why:
 * there was no field for a faction, and matching them against `regions`
 * instead would have written ninety characters into a *place* that is an
 * organisation. The answer was never a looser match. It was this collection.
 *
 * ## Two kinds of record, and they are not the same claim
 *
 * **Matched** — the organisation has its own page on the wiki, harvested
 * under some other collection because nothing here was checking kind. Its
 * page is the source, its infobox is the body, and the confidence is medium:
 * one mutable source, unverified against the game, which is what medium means
 * everywhere else on this site.
 *
 * **Compiled** — nothing but twenty infoboxes naming the same string. The
 * source is then one of *those* pages and the summary says exactly that: this
 * many pages on this wiki state it. It is a claim about the wiki rather than
 * about the game, so it is phrased as one and carries low confidence. That is
 * the line `src/seed/import.ts` draws — a record with no source URL is not a
 * record — and it is the reason none of these are invented.
 *
 * Not a sentence of anybody's prose is copied. Facts are free to compile;
 * sentences are not.
 *
 * ## The refusals are the interesting part
 *
 * An affiliation value is free text a stranger typed into a template, and a
 * filter written to stop bad records is still a filter: the first version of
 * `isNotAnEntity` deleted Antar 4, a real moon, for ending in a digit. So
 * every rule below is either mechanical against the harvest itself — this
 * string is a truncation of that one, this string is the game's own developer
 * — or it is in `REVIEWED`, an explicit list with a reason per line. There is
 * no cleverer regex to reach for here; `pnpm check:kind` came to the same
 * conclusion about its fifty-six undecidable titles.
 *
 * Idempotent on (game, slug). Re-running updates the records and, because an
 * edge is only ever written into an empty field, cannot overwrite a
 * correction somebody made by hand.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const RAW_DIR = path.join(dirname, 'raw', 'wiki-entities')

type Entity = {
  title: string
  wikiTitle: string
  collection: string
  facts: Record<string, string>
  categories?: string[]
  url: string
}

type Harvest = { slug: string; host: string; fetchedAt: string; entities: Entity[] }

/**
 * The infobox keys that name an organisation, lowercased.
 *
 * Only these. `allies`, `relatives` and `enemies` name individuals as often
 * as groups, and a key that is right half the time is a key that writes wrong
 * records half the time.
 */
const FACTION_KEYS = new Set([
  'affiliation',
  'affiliations',
  'faction',
  'factions',
  'allegiance',
  'allegiances',
])

/**
 * The three collections that can carry the edge, and therefore the three the
 * values are read from.
 *
 * Places and systems state affiliation too — a hundred Star Wars location
 * infoboxes do — but `regions` has no `faction` field and inventing one would
 * mean "this planet belongs to the Empire", a claim about control at some
 * unstated point in a timeline that no infobox is actually making. Those
 * values are counted and reported rather than written, which is the same
 * shape as `seed:entity-links` reporting what it could not match.
 */
const MEMBER_COLLECTIONS = ['characters', 'enemies', 'items'] as const
type MemberCollection = (typeof MEMBER_COLLECTIONS)[number]

/** A wiki saying "no answer". Folded, so compared against `fold(name)`. */
const NON_ANSWERS = new Set([
  'n a',
  'na',
  'none',
  'unknown',
  'various',
  'varies',
  'multiple',
  'tbd',
  'tba',
  'unnamed',
  'unspecified',
  'nil',
  'null',
  'not applicable',
  'undisclosed',
  'formerly',
  'neutral',
  'unallied',
  'independent',
  'hostile',
  'friendly',
])

/**
 * A word no organisation's name ends on.
 *
 * A value ending here is an infobox cut off mid-phrase — "Hunters of" — not a
 * name somebody chose. Mechanical, and it costs nothing if a wiki ever proves
 * the exception, because the value is reported rather than deleted.
 */
const DANGLING = new Set(['of', 'the', 'and', 'a', 'an', 'to', 'for', 'in', 'on', 'at', 'with', 'from', 'by'])

/**
 * The reviewed list.
 *
 * Keyed on `<game slug>|<folded name>`, with the reason on the line, because
 * these are the ones no mechanical rule decides and a rule invented to catch
 * them would catch something real as well. CLAUDE.md's standard: a reviewed
 * list beats a cleverer regex, and the fifty-six titles `check:kind` cannot
 * decide are kept the same way.
 */
const REVIEWED: Record<string, string> = {
  'control-resonant|neutrally hostile':
    'a disposition towards the player, not an organisation — the Control wiki uses the affiliation row for both',
  'onimusha-way-of-the-sword|yoshitsune':
    'Yoshitsune Minamoto is a character on this wiki; the Allegiances row there names the lord somebody serves, not a faction',
}

/**
 * Infobox keys that only a person has.
 *
 * Used in one place: when a candidate name turns out to have its own page on
 * the wiki, this decides whether that page is about an organisation or about
 * somebody. "Allegiances: Ganryu Sasaki" matches a page whose infobox carries
 * Japanese Name, Aliases and Voice Actors — a swordsman, and a faction record
 * for him would be the Gears-of-War-film error with a different costume.
 *
 * Deliberately not the inverse test. Checking that the page *looks like* an
 * organisation would have refused the Locust Horde, whose page is categorised
 * under Creatures throughout, and the Hiss, which is filed as an enemy and is
 * an organisation all the same.
 */
const PERSON_KEYS =
  /^(voice ?actors?|actors?|birth|born|died|death|species|gender|height|weight|hair|eyes?|relatives|spouse|children|parents|siblings)$/i

/**
 * What kind of organisation, read off its own page and nowhere else.
 *
 * Order is the rule: a clone *company* is a military unit and a banking clan
 * is not, so military is asked before corporation. Anything that matches
 * nothing leaves `kind` empty, which is the honest answer — the field has no
 * default for the same reason `perks.timeCostSegments` has none.
 */
const KIND_RULES: { kind: string; test: RegExp }[] = [
  { kind: 'criminal', test: /crimin|syndicate|cartel|pirate|smuggl|slaver|gang\b/i },
  {
    kind: 'military',
    test: /militar|\barmy\b|armies|\bnavy\b|naval|\bcorps\b|battalion|legion|squadron|\bsquad\b|regiment|militia|armed forces|fleet|companies|\bguard\b|air force/i,
  },
  { kind: 'government', test: /government|legislature|senate|parliament|ministry|bureau|agency|\bcouncil\b|monarchy|empire\b/i },
  { kind: 'corporation', test: /corporat|\bcompany\b|banking|\bguild\b|trading|enterprise|industr|manufactur/i },
  { kind: 'cult', test: /\bcult\b|religio|church|\bsect\b|priest|monastic|\border of\b/i },
]

/** One name somebody's infobox stated, and every page that stated it. */
type Candidate = {
  /** First spelling seen. Stable, because the harvest file has a fixed order. */
  name: string
  /** Every mention, including the qualified ones — evidence that it exists. */
  mentions: { entity: Entity; qualified: boolean }[]
}

/** Refusal reasons, so the report can say how many and why rather than a total. */
type Refusal = { name: string; reason: string }

/**
 * Everything decidable from the string itself.
 *
 * `siblings` is every other candidate name in the same game, which is what
 * makes the truncation and run-together rules mechanical rather than clever:
 * the evidence that "Droid Go" is a truncation is that "Droid Gotra" is
 * sitting next to it in the same harvest.
 */
const refuse = (
  name: string,
  game: string,
  siblings: string[],
  credits: string[],
): string | null => {
  const key = fold(name)
  if (!key) return 'empty once punctuation is folded away'
  if (REVIEWED[`${game}|${key}`]) return REVIEWED[`${game}|${key}`]
  if (NON_ANSWERS.has(key)) return 'a wiki saying "no answer"'
  if (!/[a-z]/i.test(name)) return 'no letters in it — a figure, not a name'
  if (name.length > 90) return 'longer than any organisation is named — a run-on infobox row'

  // Template markup that survived the parse. Half a name and half a citation.
  if (/\[\[|\]\]/.test(name)) return 'carries wiki markup — the parse, not the name'

  // A name, not a description. "A private military outfit" and "A fishing
  // crew" are how a wiki describes an unnamed group it has no article for.
  if (/^(a|an)\s/i.test(name)) return 'begins with an article — a description, not a name'
  if (/^[a-z]/.test(name)) return 'begins lower case — a fragment of a sentence'

  const words = name.split(/\s+/)
  const last = words[words.length - 1]
  if (DANGLING.has(last.toLowerCase())) return 'ends on a joining word — the row was cut off'
  // "Wilhuff Tarkin's hunting te". A one- or two-letter lower-case tail in a
  // name that is otherwise capitalised is a truncation, not a word.
  if (words.length > 1 && /^[a-z]{1,2}$/.test(last)) return 'ends mid-word — the row was cut off'

  for (const sibling of siblings) {
    if (sibling === name) continue
    /*
      "Droid Go" against "Droid Gotra": the same harvest holds the whole name,
      so the short one is where the infobox ran out of room.

      Lower case is the whole test, and it has to be. A space after the prefix
      means a real shorter name — "COG" beside "COG Army" — and a *capital*
      means the longer string is two values a template ran together, which is
      the rule below. Accepting any letter here refused "Federal Bureau of
      Control" as a truncation of "Federal Bureau of ControlBureau Book
      Bunch": the most-named organisation on that wiki, deleted by the rule
      meant to catch the garbled row next to it. That is the Antar 4 failure
      exactly, and it is why this ran before it was believed.
    */
    if (sibling.startsWith(name) && /[a-z]/.test(sibling[name.length] ?? '')) {
      return `a truncation of "${sibling}", which the same wiki also states`
    }
    // "Federal Bureau of ControlBureau Book Bunch": two rows a template ran
    // together, recognisable because the first of them is a name we already
    // have and the next character starts a new one.
    if (name.startsWith(sibling) && /[A-Z]/.test(name[sibling.length] ?? '')) {
      return `two values run together — starts with "${sibling}"`
    }
  }

  /*
    The studio, not a faction.

    "Remedy Entertainment" is the affiliation on three Control character
    infoboxes because the wiki files its own developer under Organizations.
    Writing it here would say Remedy is a faction in Control, which is the
    same invented fact `seed:companies` refuses when a studio turns up filed
    as a place. Companies have a host of their own.
  */
  if (credits.some((credit) => fold(credit) === key)) {
    return 'the game’s own developer or publisher — that belongs on the companies host'
  }

  return null
}

/** The kind of organisation, where its own page supports one. */
const kindFor = (page: Entity): string | undefined => {
  const evidence = [...(page.categories ?? []), ...Object.values(page.facts ?? {})].join(' · ')
  return KIND_RULES.find((rule) => rule.test.test(evidence))?.kind
}

/** Sentence case an infobox key: "headofstate" stays, "rate of fire" gains a cap. */
const label = (key: string) =>
  key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (character) => character.toUpperCase())

const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`

/**
 * Join sentences while they fit.
 *
 * `summary` is capped at 320 characters and a slice through the middle of a
 * clause reads as a bug. Dropping a whole trailing sentence reads as brevity.
 */
const fit = (parts: string[], limit = 320): string => {
  let out = ''
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part
    if (next.length > limit) break
    out = next
  }
  return out || parts[0].slice(0, limit)
}

async function upsert(
  payload: Payload,
  collection: CollectionSlug,
  gameId: number | string,
  slug: string,
  data: Record<string, unknown>,
): Promise<{ id: number | string; created: boolean }> {
  const existing = await payload.find({
    collection,
    where: { and: [{ slug: { equals: slug } }, { game: { equals: gameId } }] },
    limit: 1,
    depth: 0,
  })

  if (existing.docs.length > 0) {
    const updated = await payload.update({
      collection,
      id: existing.docs[0].id,
      data: { ...data, game: gameId } as never,
      depth: 0,
    })
    return { id: updated.id, created: false }
  }
  const created = await payload.create({
    collection,
    data: { ...data, game: gameId } as never,
    depth: 0,
  })
  return { id: created.id, created: true }
}

async function run(): Promise<void> {
  if (!fs.existsSync(RAW_DIR)) {
    console.log(`No ${RAW_DIR}. Run \`pnpm fetch:entities\` first.`)
    process.exit(0)
  }

  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  let totalFactions = 0
  let totalMatched = 0
  let totalEdges = 0

  for (const file of fs.readdirSync(RAW_DIR).filter((name) => name.endsWith('.json'))) {
    const harvest: Harvest = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8'))
    if (harvest.entities.length === 0) continue

    // Dawnwalker is hand-researched and has no harvest file; the guard is here
    // for the day one appears, so a generator cannot reach its 440 records.
    if (harvest.slug === 'dawnwalker') {
      console.log('dawnwalker: hand-researched, skipped')
      continue
    }

    const games = await payload.find({
      collection: 'games',
      where: { slug: { equals: harvest.slug } },
      limit: 1,
      depth: 0,
    })
    if (games.docs.length === 0) {
      console.log(`  ${harvest.slug}: no such game, skipped`)
      continue
    }
    const game = games.docs[0]
    const gameTitle = (game.shortTitle as string) || (game.title as string)
    const credits = [game.publisher, game.developer].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )

    /*
      Collect. Qualified fragments — "COG (Formerly)" — count as evidence that
      the organisation exists but never as a membership: writing a former
      allegiance as a current one is a fact no source states, which is the
      same reason `seed:entity-links` drops a qualified residence.
    */
    const candidates = new Map<string, Candidate>()
    let placeValues = 0

    for (const entity of harvest.entities) {
      const rows = Object.entries(entity.facts ?? {}).filter(([key]) =>
        FACTION_KEYS.has(key.trim().toLowerCase()),
      )
      if (rows.length === 0) continue

      if (!(MEMBER_COLLECTIONS as readonly string[]).includes(entity.collection)) {
        placeValues += rows.length
        continue
      }

      for (const [, value] of rows) {
        for (const fragment of splitFactValue(String(value))) {
          const key = fold(fragment.text)
          if (!key) continue
          const held = candidates.get(key) ?? { name: fragment.text, mentions: [] }
          held.mentions.push({ entity, qualified: Boolean(fragment.qualifier) })
          candidates.set(key, held)
        }
      }
    }

    // Every page on this wiki, by folded title, so a candidate can be matched
    // to the article about it whatever collection the harvester filed it under.
    const pages = new Map<string, Entity | null>()
    for (const entity of harvest.entities) {
      const key = fold(entity.title)
      if (!key) continue
      // Two pages with one name is a question, not a match.
      pages.set(key, pages.has(key) ? null : entity)
    }

    const siblings = [...candidates.values()].map((candidate) => candidate.name)
    const refusals: Refusal[] = []
    const kept = new Map<string, Candidate & { page: Entity | null }>()

    for (const [key, candidate] of candidates) {
      const reason = refuse(candidate.name, harvest.slug, siblings, credits)
      if (reason) {
        refusals.push({ name: candidate.name, reason })
        continue
      }

      const page = pages.get(key) ?? null
      /*
        The page exists and is about a person. "Allegiances: Ganryu Sasaki" is
        loyalty to a swordsman, and a faction page for him would be a record
        of the wrong kind with a real source URL behind it — exactly what
        `pnpm check:kind` exists to catch after the fact.
      */
      if (page && Object.keys(page.facts ?? {}).some((factKey) => PERSON_KEYS.test(factKey.trim()))) {
        refusals.push({ name: candidate.name, reason: 'its own page on this wiki is about a person' })
        continue
      }

      kept.set(key, { ...candidate, page })
    }

    /* Write the records. */
    const ids = new Map<string, number | string>()
    let created = 0
    let updated = 0
    let matched = 0
    let failed = 0
    const slugs = new Set<string>()

    for (const [key, candidate] of kept) {
      let slug = slugify(candidate.name)
      if (!slug) continue
      if (slugs.has(slug)) {
        let suffix = 2
        while (slugs.has(`${slug}-${suffix}`)) suffix += 1
        slug = `${slug}-${suffix}`
      }
      slugs.add(slug)

      const page = candidate.page
      const naming = new Set(candidate.mentions.map((mention) => mention.entity.title))
      const count = naming.size
      const examples = [...naming].slice(0, 3)

      const summary = page
        ? fit([
            `${candidate.name}, an organisation in ${gameTitle}.`,
            `${plural(count, 'record')} on this wiki name it as an affiliation.`,
            'Compiled from a community wiki and not yet checked against the game.',
          ])
        : fit([
            `${candidate.name} is named as an affiliation by ${plural(count, 'page')} on the ${harvest.host} wiki for ${gameTitle}.`,
            'That is all this page claims: the wiki has no article of its own for it here, so nothing beyond the name is asserted.',
          ])

      const body: Block[] = []
      if (page) {
        const facts = Object.entries(page.facts ?? {}).slice(0, 12)
        body.push(
          `What ${harvest.host} records about ${candidate.name}. Every line below is restated from the page cited at the foot of this one, and none of it has been checked against ${gameTitle} by us.`,
        )
        if (facts.length > 0) {
          body.push({ ul: facts.map(([factKey, value]) => `${label(factKey)}: ${value}`) })
        }
      } else {
        body.push(
          `No article for ${candidate.name} was harvested from ${harvest.host}. What is recorded here is narrower and it is worth being exact about: ${plural(count, 'page')} on that wiki state it in an infobox as an affiliation${examples.length > 0 ? `, among them ${examples.join(', ')}` : ''}.`,
        )
        body.push(
          'That is a compiled claim about those pages rather than a description of the organisation, which is why this record carries low confidence and why nothing here says what it does, when it formed or who leads it.',
        )
      }

      // Not "Members": the page already has an <h2> by that name over the
      // list itself, and two identical headings on one page is the kind of
      // small wrongness nobody reports and everybody notices.
      body.push({ h: 'Who belongs to it' })
      body.push(
        'The records below are the ones whose own infobox names this organisation, and each of them cites the page that says so. They are read from those records rather than listed here, so correcting a member corrects this page too.',
      )

      body.push({ h: 'What is missing' })
      body.push(
        'What this organisation actually does in the game, and how a player meets it. That needs somebody who has played it, and is left empty rather than inferred from a name.',
      )

      const sources = page
        ? [{ title: `${page.wikiTitle} — ${harvest.host}`, url: page.url, retrieved: harvest.fetchedAt }]
        : candidate.mentions
            .filter(
              (mention, index, all) =>
                all.findIndex((other) => other.entity.url === mention.entity.url) === index,
            )
            .slice(0, 3)
            .map((mention) => ({
              title: `${mention.entity.wikiTitle} — ${harvest.host}`,
              url: mention.entity.url,
              retrieved: harvest.fetchedAt,
            }))

      // Should never be empty — a candidate exists because a page named it —
      // but `src/seed/import.ts` rejects a record with no source URL for a
      // reason, and a generator may not be the exception to it.
      if (sources.length === 0) {
        refusals.push({ name: candidate.name, reason: 'no source URL behind it' })
        continue
      }

      try {
        const result = await upsert(payload, 'factions' as CollectionSlug, game.id, slug, {
          title: candidate.name,
          slug,
          summary,
          body: rich(...body),
          ...(page ? { kind: kindFor(page) } : {}),
          // One mutable source for the matched ones; for the rest, a count of
          // infoboxes, which is weaker than a source and says so.
          confidence: page ? 'medium' : 'low',
          sources,
        })
        ids.set(key, result.id)
        if (result.created) created += 1
        else updated += 1
        if (page) matched += 1
      } catch (error) {
        // One record that will not validate must not take the rest with it.
        failed += 1
        if (failed <= 3) console.log(`    skipped ${slug}: ${(error as Error).message}`)
      }
    }

    /*
      The edges.

      Written onto the member, never as a list here, and only into an empty
      field: a generator may fill a gap and never overwrite an answer somebody
      arrived at by reading a source.
    */
    const records = new Map<MemberCollection, Map<string, { id: number | string; faction: unknown } | null>>()
    for (const collection of MEMBER_COLLECTIONS) {
      const found = await payload.find({
        collection: collection as CollectionSlug,
        where: { game: { equals: game.id } },
        limit: 0,
        pagination: false,
        depth: 0,
      })
      const index = new Map<string, { id: number | string; faction: unknown } | null>()
      for (const doc of found.docs as unknown as { id: number | string; title?: string; faction?: unknown }[]) {
        const key = fold(String(doc.title ?? ''))
        if (!key) continue
        // Two records sharing a title is a question, not a match — the same
        // rule `seed:entity-links` uses to find the record an entity became.
        index.set(key, index.has(key) ? null : { id: doc.id, faction: doc.faction })
      }
      records.set(collection, index)
    }

    const edges: Record<string, number> = {}
    // Reported rather than refused now the field is hasMany. Still worth
    // printing: it says how much of the graph arrives as multi-valued rows.
    let severalNamed = 0
    let alreadySet = 0
    let noRecord = 0
    let edgeFailed = 0

    for (const entity of harvest.entities) {
      if (!(MEMBER_COLLECTIONS as readonly string[]).includes(entity.collection)) continue
      const rows = Object.entries(entity.facts ?? {}).filter(([key]) =>
        FACTION_KEYS.has(key.trim().toLowerCase()),
      )
      if (rows.length === 0) continue

      const wanted = new Set<number | string>()
      for (const [, value] of rows) {
        for (const fragment of splitFactValue(String(value))) {
          if (fragment.qualifier) continue
          const id = ids.get(fold(fragment.text))
          if (id !== undefined) wanted.add(id)
        }
      }
      if (wanted.size === 0) continue
      if (wanted.size > 1) severalNamed += 1

      const doc = records.get(entity.collection as MemberCollection)?.get(fold(entity.title))
      if (!doc) {
        noRecord += 1
        continue
      }
      /*
        Only into an empty field. A generator may fill a gap and never
        overwrite an answer somebody arrived at by reading a source — which
        for a hasMany field means an array with something in it, not merely a
        non-null one.
      */
      if (Array.isArray(doc.faction) ? doc.faction.length > 0 : Boolean(doc.faction)) {
        alreadySet += 1
        continue
      }

      // Not `ids`: that name is the faction lookup a few lines above, in this
      // same scope, and shadowing it made the read of it a TDZ error.
      const members = [...wanted]
      try {
        await payload.update({
          collection: entity.collection as CollectionSlug,
          id: doc.id,
          data: { faction: members } as never,
          depth: 0,
        })
        // Counted as relationships rather than records: one character in three
        // organisations is three edges, and the number that matters is how
        // many links a reader can actually follow.
        edges[entity.collection] = (edges[entity.collection] ?? 0) + members.length
        doc.faction = members
      } catch (error) {
        edgeFailed += 1
        if (edgeFailed <= 3) {
          console.log(`    ${entity.collection}/${entity.title}: ${(error as Error).message}`)
        }
      }
    }

    const edgeTotal = Object.values(edges).reduce((sum, count) => sum + count, 0)
    totalFactions += created + updated
    totalMatched += matched
    totalEdges += edgeTotal

    console.log(game.title)
    console.log(
      `  ${created} created, ${updated} updated — ${matched} matched an article of their own` +
        (failed > 0 ? `, ${failed} failed to write` : ''),
    )
    console.log(
      `  ${edgeTotal} member edges` +
        (edgeTotal > 0 ? ` (${Object.entries(edges).map(([key, value]) => `${value} ${key}`).join(', ')})` : '') +
        (severalNamed > 0 ? `, from ${severalNamed} infoboxes naming several` : '') +
        (alreadySet > 0 ? `, ${alreadySet} already set` : '') +
        (noRecord > 0 ? `, ${noRecord} have no record` : ''),
    )
    if (refusals.length > 0) {
      const byReason = new Map<string, string[]>()
      for (const refusal of refusals) {
        const held = byReason.get(refusal.reason) ?? []
        held.push(refusal.name)
        byReason.set(refusal.reason, held)
      }
      console.log(`  ${plural(refusals.length, 'value')} refused:`)
      for (const [reason, names] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
        console.log(`    ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` +${names.length - 4}` : ''} — ${reason}`)
      }
    }
    if (placeValues > 0) {
      console.log(
        `  ${placeValues} affiliation values on places and systems have no field to hang on — reported, not written`,
      )
    }
  }

  console.log(
    `\n${totalFactions} factions, ${totalMatched} of them with an article of their own, ${totalEdges} member edges`,
  )
  console.log(
    'A value naming several organisations writes an edge to each: those\n' +
      'memberships are true at once, which is why this field is hasMany where\n' +
      '`region` is not. A qualified one — "COG (Formerly)" — is still refused.',
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
