import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { slugify } from '../fields/shared'
import { rich, type Block } from './lexical'

/**
 * Profiles for `people.<network domain>`, from `src/seed/raw/people.json`.
 *
 *   node tools/fetch-people.mjs   # the facts
 *   pnpm seed:people              # the records
 *
 * Upserts on slug and is idempotent, so it can be re-run in any order with the
 * other passes. It writes nothing it cannot cite.
 *
 * ## What this composes and what it refuses to
 *
 * Every sentence below is built from fields the harvester captured, in this
 * file's own words. The Wikipedia lead extract is deliberately **not** used:
 * it is in the raw file so a human can check the record against it, and
 * putting it on a page would be pasting somebody else's prose, which is the
 * one thing `docs/` says outright not to do. Facts are free to compile;
 * sentences are not.
 *
 * Where a fact is missing the sentence does not mention it. There is no "date
 * of birth unknown" line and no placeholder, because a gap is honest and a
 * filled-in guess about a living person is the failure the whole collection
 * was designed around.
 *
 * ## Confidence means something specific here
 *
 *   high    an article confirmed the person *and* something in it ties them to
 *           the credit — the game, the studio, or the kind of work credited
 *   low     no article, or an article this record refused to use. The person is
 *           here because a sourced infobox named them, and that is all the
 *           record claims
 *
 * There is no middle tier, because there is nowhere for a middle tier to put
 * its facts. An article about *a* person of this name, with nothing in it
 * tying them to this credit, is as likely to be a stranger as the right
 * person — the first harvest matched a Control Resonant producer to a Finnish
 * lyricist who died in 1990 — so its facts are not used at all and its URL
 * goes to the review list instead of onto the page.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RAW = path.resolve(HERE, 'raw', 'people.json')

// ---------------------------------------------------------------------------
// The shape `tools/fetch-people.mjs` writes
// ---------------------------------------------------------------------------

type Credit = {
  game: string
  gameTitle: string
  role: string
  note: string | null
  stated: string
  uncertain: boolean
  source: string
  sourceTitle: string
  retrieved: string | null
}

type CharacterCredit = {
  game: string
  gameTitle: string
  character: string
  /* Which collection the part is filed in on its own wiki - see `linkable`. */
  collection?: string
  field: string
  note: string | null
  source: string
  sourceTitle: string
  retrieved: string | null
}

type Profile = {
  title: string
  url: string
  wiki: string
  /* Set by the harvested wikis; the Dawnwalker cast pages carry neither. */
  game?: string
  gameTitle?: string
  profession: string | null
  crewRole: string | null
  /* Where they are from, which is not where they were born. See the prose. */
  hometown?: string | null
  born: string | null
  birthPlace: string | null
  nationality: string | null
  activeSince: string | null
  /* The source calls these films outright; `otherWorks` it does not classify. */
  films?: string[]
  otherWorks?: string[]
  roles?: Role[]
  /*
    Does the wiki itself put this person on the game this network covers?

    False for Christophe Gans, who is on the Silent Hill wiki because he
    directed the films. A page on a franchise wiki is not a credit on our game,
    and the record must not read as though it were.
  */
  onOurGame?: boolean
  sortName: string
  retrieved: string | null
}

type Article = {
  title: string
  url: string
  extract: string
  categories: string[]
  facts: Record<string, string>
  sortName: string
  person: boolean
  why: string
}

type Harvested = {
  name: string
  alsoKnownAs: string[]
  credits: Credit[]
  characters: CharacterCredit[]
  profile: Profile | null
  article: Article | null
  unresolvedReason: string | null
}

type RawFile = {
  fetchedAt: string
  complete: boolean
  games: Record<string, { title: string; url: string; released: string | null; developer: string | null; publisher: string | null }>
  people: Harvested[]
  dropped: { fragment: string; reason: string }[]
}

type Role =
  | 'director'
  | 'designer'
  | 'artist'
  | 'writer'
  | 'composer'
  | 'producer'
  | 'programmer'
  | 'developer'
  | 'actor'
  | 'voice-actor'
  | 'motion-capture'
  | 'executive'

const ROLE_LABEL: Record<Role, string> = {
  director: 'Director',
  designer: 'Designer',
  artist: 'Artist',
  writer: 'Writer',
  composer: 'Composer',
  producer: 'Producer',
  programmer: 'Programmer',
  developer: 'Developer',
  actor: 'Actor',
  'voice-actor': 'Voice actor',
  'motion-capture': 'Motion capture performer',
  executive: 'Executive',
}

/** The roles that are a performance, and so are described by a part rather than a job. */
const PERFORMANCE_ROLES = new Set<Role>(['actor', 'voice-actor', 'motion-capture'])

const CREW_ROLES = new Set<Role>([
  'director',
  'designer',
  'artist',
  'writer',
  'composer',
  'producer',
  'programmer',
])

/**
 * What an article about the right person would plausibly say.
 *
 * Wider than the role's own label on purpose: an article about a voice actor
 * says "actress" or "voiceover" rather than "voice actor", and one about a
 * composer says "score" or "soundtrack". Too narrow here and a real match is
 * thrown away; too wide and a stranger's biography lands on the page. These
 * are the words that describe the *work*, not words that merely appear near
 * it.
 */
const ROLE_WORDS: Record<Role, RegExp> = {
  director: /\bdirect(or|ed|ing)\b/,
  designer: /\bdesign(er|ed|ing)?\b/,
  artist: /\b(artist|art director|illustrator|concept art|animator)\b/,
  writer: /\b(writer|wrote|screenwriter|novelist|playwright|script)\b/,
  composer: /\b(composer|composed|score|soundtrack|music)\b/,
  producer: /\bproduc(er|ed|ing|tion)\b/,
  programmer: /\b(programmer|software engineer|developer)\b/,
  developer: /\b(video game|game develop|game design)\b/,
  actor: /\b(actor|actress|performer|starred|plays)\b/,
  'voice-actor': /\b(voice|voiceover|voice-over|dub|actor|actress)\b/,
  'motion-capture': /\b(motion capture|performance capture|mo-cap|model|actor|actress)\b/,
  executive: /\b(executive|chief|founder|president)\b/,
}

/** The verb a credit takes in a sentence, so the prose is not all "credited on". */
const VERB: Partial<Record<Role, string>> = {
  director: 'directed',
  designer: 'designed',
  artist: 'was an artist on',
  writer: 'wrote for',
  composer: 'scored',
  producer: 'produced',
  programmer: 'programmed on',
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * Letters the shared `slugify` has no rule for.
 *
 * `slugify` replaces anything outside `[a-z0-9]` with a hyphen, which turns
 * "Bartłomiej Gaweł" into `bart-omiej-gawe` and "Émilie" into `milie` — a URL
 * that reads as a typo and, worse, one that collides: two different people
 * whose names differ only in their diacritics would land on the same slug and
 * the second would silently overwrite the first. Folding to the plain letter
 * first gives `bartlomiej-gawel`, which is both readable and distinct.
 *
 * NFD alone does not do it: `ł`, `ø`, `đ` and `ß` are separate letters in
 * Unicode rather than a base plus a combining mark, so they survive the
 * decomposition untouched.
 */
const FOLD: Record<string, string> = {
  ł: 'l',
  Ł: 'L',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ß: 'ss',
  æ: 'ae',
  Æ: 'Ae',
  œ: 'oe',
  Œ: 'Oe',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ı: 'i',
}

const personSlug = (name: string): string =>
  slugify(
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[łŁøØđĐßæÆœŒðÐþÞı]/g, (character) => FOLD[character] ?? character),
  )

/**
 * End a sentence without doubling its full stop.
 *
 * "born in Dallas, Texas, U.S." plus a period is "U.S..", which reads as a
 * typo on every American biography on the host.
 */
const sentence = (text: string): string =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`

/** "A and B" / "A, B and C". */
const listSentence = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** A four-digit year out of whatever shape the source wrote the date in. */
const yearOf = (value?: string | null): string | null => value?.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? null

/**
 * Is this a value, or the wreckage of one?
 *
 * Same rule as `seed/companies.ts`: a field that survived template-stripping as
 * "(2025)" looks like a fact and carries none, which is worse than empty.
 */
const usable = (value?: string | null): string | undefined => {
  /*
    Strip surviving wikitext before anything else.

    The harvester's template pass leaves the odd unmatched "}}" behind on a
    nested infobox, and one of them reached a published sentence reading "Their
    work is given as actress, voice actress, }}." Nothing errored and nothing
    failed a check - it was only visible by reading the page, which is the same
    way the draft guides were found.
  */
  const text = String(value ?? '')
    /* A pipe separated two values; a brace is wreckage. They are not the same. */
    .replace(/\s*[|]+\s*/g, ', ')
    .replace(/[{}[\]]+/g, ' ')
    .replace(/\s*,(?=\s*,|\s*$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim()
  if (!text) return undefined
  const outside = text.replace(/\([^)]*\)/g, '').replace(/[^A-Za-z0-9]/g, '')
  return outside.length > 0 ? text.slice(0, 220) : undefined
}

/** The first infobox key that is present, in order of preference. */
const pick = (facts: Record<string, string> | undefined, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = usable(facts?.[key])
    if (value) return value
  }
  return undefined
}

/**
 * The languages a dub credit names, which is a fact worth keeping.
 *
 * Onimusha's wiki writes "Yoshimasa Hosoya (Japanese), Kenichiro Thomson
 * (English), Cao Zhen (Mandarin Chinese)", and "who plays this in English" is
 * a question a reader actually brings to a character page. Dropping the
 * bracket would turn three distinct credits into three identical ones.
 */
const LANGUAGE =
  /\b(English|Japanese|Mandarin(?: Chinese)?|Cantonese|Chinese|Korean|French|German|Spanish|Italian|Portuguese|Russian|Polish|Brazilian Portuguese|Latin American Spanish)\b/i

const languageOf = (credit: CharacterCredit): string | null => {
  const found = (credit.note ?? '').match(LANGUAGE)
  if (!found) return null
  /* As the source writes it, minus the "dub" the wikis sometimes append. */
  return found[1].replace(/\s+dub$/i, '')
}

/**
 * Which kind of performance a credit is.
 *
 * Two signals, and the key is the stronger one. `Voice Actors`,
 * `mo-capped by` and `Face Models` say outright what kind of credit they
 * hold, so they are read first; `actor` and `portrayed by` say nothing, and
 * for those the bracket decides - "(voice)", "(model)", "(likeness)",
 * "(Japanese dub)". Flattening all of them to `actor` would claim a likeness
 * model performed the part.
 *
 * A face model is filed as `motion-capture` because that is the nearest thing
 * the schema has. It is not the same credit, so the prose says "face model"
 * rather than letting the role label speak for it - Onimusha's Musashi
 * Miyamoto is modelled on Toshiro Mifune, who died in 1997 and performed
 * nothing.
 */
const performanceRole = (credit: CharacterCredit): Role => {
  if (credit.field === 'Voice Actors') return 'voice-actor'
  if (credit.field === 'mo-capped by' || credit.field === 'Face Models') return 'motion-capture'
  const note = `${credit.note ?? ''} ${credit.field}`.toLowerCase()
  if (/model|likeness|mo-?cap|motion|face/.test(note)) return 'motion-capture'
  if (/voice|dub|voiced/.test(note)) return 'voice-actor'
  return 'actor'
}

/** How a credit reads mid-sentence, after the person's name. */
const performancePhrase = (credit: CharacterCredit, character: string, game: string): string => {
  const role = performanceRole(credit)
  const language = languageOf(credit)
  if (credit.field === 'Face Models') return `is the face model for **${character}** in **${game}**`
  if (role === 'motion-capture') return `performs motion capture for **${character}** in **${game}**`
  if (role === 'voice-actor' && language) {
    return `is the ${language} voice of **${character}** in **${game}**`
  }
  if (role === 'voice-actor') return `voices **${character}** in **${game}**`
  return `plays **${character}** in **${game}**`
}

/** …and how the same credit reads as a line in the credits list. */
const performanceCredit = (credit: CharacterCredit, character: string): string => {
  const role = performanceRole(credit)
  const language = languageOf(credit)
  if (credit.field === 'Face Models') return `Face model for ${character}`
  if (role === 'motion-capture') return `Motion capture for ${character}`
  if (role === 'voice-actor') return `${language ? `${language} voice` : 'Voice'} of ${character}`
  return `As ${character}`
}

/**
 * Is there a `characters` record this credit can point at?
 *
 * Control files Helen Marshall under `enemies`, so the credit is real and the
 * relationship has nowhere to go - `People` relates to `characters` and
 * nothing else. The credit keeps its line in the credits list and its sentence
 * in the prose; the relationship stays empty rather than pointing at an id in
 * another collection, which would render perfectly and link to the wrong
 * thing.
 */
/**
 * One part, once, however many pages named it.
 *
 * The same credit now arrives from both directions: Richard's page on the
 * Silent Hill wiki says Terry O'Quinn plays him, and Terry O'Quinn's own page
 * says he portrayed Richard. Both are true and both are worth having as
 * sources, but without this the record listed the part twice and the prose
 * read "plays Richard in Silent Hill: Townfall and plays Richard in Silent
 * Hill: Townfall".
 *
 * Keyed on the part *and* the kind of performance, so somebody credited in two
 * languages, or as both voice and likeness, keeps both lines - those are
 * different credits, not a duplicate.
 */
const oncePerPart = (credits: CharacterCredit[]): CharacterCredit[] => {
  const seen = new Map<string, CharacterCredit>()
  for (const credit of credits) {
    const key = [
      credit.game,
      credit.character.toLowerCase(),
      performanceRole(credit),
      languageOf(credit) ?? '',
    ].join('::')
    const held = seen.get(key)
    /*
      Where two pages describe one credit, keep the one filed in `characters`:
      it is the one that can carry a relationship.
    */
    if (!held || (!linkable(held) && linkable(credit))) seen.set(key, credit)
  }
  return [...seen.values()]
}

const linkable = (credit: CharacterCredit): boolean =>
  (credit.collection ?? 'characters') === 'characters'

// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  if (!fs.existsSync(RAW)) {
    console.log('no src/seed/raw/people.json — run `node tools/fetch-people.mjs` first')
    process.exit(0)
  }

  const file = JSON.parse(fs.readFileSync(RAW, 'utf8')) as RawFile
  if (file.complete === false) {
    /*
      A partial harvest is still honest — every record in it carries its own
      source and the ones never looked up say so — but it is not the full
      picture, and a silent partial is how a run gets reported as finished.
    */
    console.log('WARNING: people.json is marked incomplete (the harvest hit a rate limit).')
    console.log('         Re-run `node tools/fetch-people.mjs`; it resumes from the cache.\n')
  }

  const payload = await getPayload({ config })

  // --- What we can point a relationship at --------------------------------
  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  const gameBySlug = new Map<string, { id: string | number; title: string }>()
  for (const game of games.docs as unknown as { id: string | number; slug: string; title: string }[]) {
    gameBySlug.set(game.slug, { id: game.id, title: game.title })
  }

  /*
    Characters are matched on their title within their own game, never across
    games: "Richard" is a person in one wiki and could be anybody in another,
    and a relationship pointing at the wrong game's record is invisible on the
    page — it renders perfectly and links somewhere else entirely.
  */
  const characters = await payload.find({ collection: 'characters', limit: 10000, depth: 0 })
  const characterByTitle = new Map<string, string | number>()
  for (const character of characters.docs as unknown as {
    id: string | number
    title: string
    game: string | number
  }[]) {
    characterByTitle.set(`${String(character.game)}::${character.title.toLowerCase()}`, character.id)
  }

  let created = 0
  let updated = 0
  let high = 0
  let low = 0
  let charactersLinked = 0
  let charactersMissed = 0
  let charactersElsewhere = 0
  let mentions = 0
  const usedSlugs = new Map<string, string>()
  const review: string[] = []

  for (const person of file.people) {
    /* One line per part, however many pages named it. See `oncePerPart`. */
    const parts = oncePerPart(person.characters)

    // --- Roles -----------------------------------------------------------
    const roles = new Set<Role>()
    for (const credit of person.credits) {
      if (CREW_ROLES.has(credit.role as Role)) roles.add(credit.role as Role)
      else if ((ROLE_LABEL as Record<string, string>)[credit.role]) roles.add(credit.role as Role)
    }
    for (const credit of parts) roles.add(performanceRole(credit))
    /*
      A person page can state a role without the wiki crediting them on our
      game. Christophe Gans is a director and a writer whatever else is true,
      and dropping that because there is no credit here would leave him filed
      as "role not stated".
    */
    for (const role of person.profile?.roles ?? []) roles.add(role)
    /*
      `developer` is the schema's "role not stated". It is the honest answer
      when a source named somebody without saying what they did, and better
      than picking the nearest-looking option.
    */
    if (roles.size === 0) roles.add('developer')
    const roleList = [...roles]

    // --- Slug, and a collision that must not silently overwrite ----------
    const slug = personSlug(person.name)
    if (!slug) {
      review.push(`${person.name}: produced no slug, skipped`)
      continue
    }
    const clash = usedSlugs.get(slug)
    if (clash && clash !== person.name) {
      /*
        Two different people on one slug is the second one erasing the first,
        with a page that looks fine. It is refused and printed rather than
        suffixed, because which of the two the URL should belong to is an
        editorial call and not this script's to make.
      */
      review.push(`${person.name}: slug "${slug}" already taken by ${clash} — not written`)
      continue
    }
    usedSlugs.set(slug, person.name)

    // --- The games and characters this record can actually point at ------
    const gameIds: (string | number)[] = []
    const gameTitles: string[] = []
    for (const credit of [...person.credits, ...parts]) {
      const game = gameBySlug.get(credit.game)
      if (!game || gameIds.includes(game.id)) continue
      gameIds.push(game.id)
      gameTitles.push(game.title)
    }

    const characterIds: (string | number)[] = []
    for (const credit of parts) {
      const game = gameBySlug.get(credit.game)
      if (!game) continue
      if (!linkable(credit)) {
        /*
          A real credit filed outside `characters` on its own wiki. It keeps
          its sentence and its line in the credits list; only the relationship
          is left empty. See `linkable`.
        */
        charactersElsewhere += 1
        continue
      }
      const id = characterByTitle.get(`${String(game.id)}::${credit.character.toLowerCase()}`)
      if (id === undefined) {
        /*
          A named part with no record to link to. That is a gap in the
          characters collection rather than a reason to drop the credit, so
          the credit stays in the prose and this is reported.
        */
        charactersMissed += 1
        continue
      }
      if (!characterIds.includes(id)) {
        characterIds.push(id)
        charactersLinked += 1
      }
    }

    // --- Does the article actually corroborate the credit? ----------------
    /*
      The gate, and the most important twenty lines in this file.

      The first harvest resolved "Mark Healy" to Mark Healy the Gaelic
      footballer and "Juha Vainio" to a Finnish lyricist who died in 1990, both
      with real articles about real people and neither of them the person on
      the credit. Generic names collide, and "an article of this name exists"
      is not "this is them".

      So an article is only used where something in it ties that person to this
      credit — the game, the studio that made it, or the kind of work they are
      credited for. Where nothing does, the article is **not used at all**: not
      for the date of birth, not for the nationality, and not as a citation,
      because citing it would itself be the claim that it is about this person.
      The record keeps the credit that named them, drops to low confidence, and
      the URL goes to the review list for somebody to decide.

      A gap is fine. Somebody else's date of birth is not.
    */
    const haystack = [
      person.article?.extract ?? '',
      person.article?.categories.join(' ') ?? '',
      Object.values(person.article?.facts ?? {}).join(' '),
    ]
      .join(' ')
      .toLowerCase()

    const studios = new Set<string>()
    for (const credit of [...person.credits, ...parts]) {
      const game = file.games[credit.game]
      for (const company of [game?.developer, game?.publisher]) {
        for (const part of String(company ?? '').split(',')) {
          const name = part.trim().toLowerCase()
          if (name.length > 3) studios.add(name)
        }
      }
    }

    const corroborated =
      person.article !== null &&
      (gameTitles.some((title) => haystack.includes(title.toLowerCase())) ||
        [...studios].some((studio) => haystack.includes(studio)) ||
        roleList.some((role) => ROLE_WORDS[role].test(haystack)))

    const article = corroborated ? person.article : null
    if (person.article && !corroborated) {
      review.push(
        `${person.name}: ${person.article.url} is about a person of that name, but nothing in it mentions ${gameTitles[0] ?? 'the game'}, the studio or ${ROLE_LABEL[roleList[0]!].toLowerCase()} work — not used`,
      )
    }

    const confidence: 'high' | 'low' = article ? 'high' : 'low'
    if (confidence === 'high') high += 1
    else low += 1

    // --- Who they are, only where a source says ---------------------------
    const facts = article?.facts
    const born = pick(facts, 'birth_date', 'born', 'birthdate') ?? usable(person.profile?.born)
    const birthPlace =
      pick(facts, 'birth_place', 'birthplace', 'origin') ?? usable(person.profile?.birthPlace)
    const nationality =
      pick(facts, 'nationality', 'citizenship') ?? usable(person.profile?.nationality)
    const activeSince =
      pick(facts, 'years_active', 'yearsactive', 'active') ?? usable(person.profile?.activeSince)
    const website = pick(facts, 'website', 'url', 'homepage')
    const occupation = pick(facts, 'occupation', 'occupations', 'profession')
    const notableWorks = pick(facts, 'notable_works', 'known_for', 'works')

    const aliases = [...person.alsoKnownAs]
    for (const key of ['other_names', 'othername', 'birth_name', 'alias']) {
      const value = usable(facts?.[key])
      if (value && value !== person.name && !aliases.includes(value)) aliases.push(value)
    }

    /*
      Wikipedia's own DEFAULTSORT, or the wiki's, or nothing. Never computed:
      "the last word is the surname" is wrong for Japanese names in their own
      order, Spanish double surnames and mononyms, and `sortName`'s own comment
      says a wrong guess about somebody's name is not worth making. Blank here
      means the directory sorts on the name as written, which is the documented
      fallback.
    */
    const sortName = article?.sortName || person.profile?.sortName || undefined

    // --- Prose, composed here ---------------------------------------------
    /*
      Everything that is not a performance.

      This used to be `CREW_ROLES` alone, which left out `developer` - the
      schema's "role not stated" - so Franck Besançon, who is credited as
      crew on Silent Hill: Townfall and nothing more specific, produced no
      sentence at all and fell through to the franchise-wiki disclaimer
      below. The page then told a reader that nothing credits him on the
      game he is credited on.
    */
    const crewCredits = person.credits.filter(
      (credit) => !PERFORMANCE_ROLES.has(credit.role as Role),
    )
    const crewPhrases = crewCredits.map((credit) => {
      const game = gameBySlug.get(credit.game)?.title ?? credit.gameTitle
      const year = yearOf(file.games[credit.game]?.released)
      const verb = VERB[credit.role as Role] ?? 'worked on'
      return `${verb} **${game}**${year ? ` (${year})` : ''}`
    })

    const playPhrases = parts.map((credit) => {
      const game = gameBySlug.get(credit.game)?.title ?? credit.gameTitle
      return performancePhrase(credit, credit.character, game)
    })

    const headline = listSentence(roleList.map((role) => ROLE_LABEL[role].toLowerCase()))
    const primaryGame = gameTitles[0] ?? ''

    const doing = listSentence([...crewPhrases, ...playPhrases]).replace(/\*\*/g, '')

    /*
      Somebody whose only appearance is a page on a franchise wiki.

      Christophe Gans directed the Silent Hill *films*; the Silent Hill wiki
      carries him for that and credits him on nothing this network covers. The
      fallback below him used to read "is credited as director and writer on a
      game covered by this network", which is a sentence nobody sourced and the
      exact shape of claim seed/companies.ts refuses to make about a studio
      named on a franchise wiki.

      So the sentence says where the name was found, and then says plainly what
      the wiki does not claim.
    */
    /*
      Only where the wiki itself does not put them on our game. `onOurGame`
      is the harvester's reading of the page's own `debut` field and
      categories; anything else with no sentence to show is a gap, not a
      disclaimer.
    */
    /*
      Somebody a franchise wiki names, with nothing on that wiki crediting
      them on the game this network covers.

      Read off the page's own `debut` field and categories rather than off
      the prose, so the two cannot drift apart: this decides both what the
      page says and which group the directory files it under. All three
      clauses matter - a credit or a part anywhere in this network means the
      record is not a mention, whatever one wiki's categories say.
    */
    const wikiMentionOnly =
      person.profile?.onOurGame === false && person.credits.length === 0 && parts.length === 0
    if (wikiMentionOnly) mentions += 1

    const franchiseOnly = wikiMentionOnly
    const foundOn = person.profile?.wiki ?? ''
    const aboutGame = person.profile?.gameTitle ?? ''

    const summary = (
      doing.length > 0
        ? `${ROLE_LABEL[roleList[0]!]}. ${person.name} ${doing}.`
        : franchiseOnly
          ? `${ROLE_LABEL[roleList[0]!]}. Named on ${foundOn} in the material compiled for ${aboutGame}; nothing there credits them on ${aboutGame} itself.`
          : `${ROLE_LABEL[roleList[0]!]} credited on ${primaryGame || 'a game covered by this network'}.`
    ).slice(0, 318)

    const knownFor = primaryGame
      ? `${ROLE_LABEL[roleList[0]!]}, ${primaryGame}`.slice(0, 90)
      : ROLE_LABEL[roleList[0]!]

    const body: Block[] = []
    body.push(
      doing.length > 0
        ? `**${person.name}** ${listSentence([...crewPhrases, ...playPhrases])}.`
        : franchiseOnly
          ? `**${person.name}** is named as ${headline} on ${foundOn}, the community wiki this network compiles **${aboutGame}** from. Nothing on that wiki credits them on **${aboutGame}** itself, and this page makes no such claim.`
          : `**${person.name}** is credited as ${headline} on ${primaryGame || 'a game covered by this network'}.`,
    )

    /*
      One sentence per kind of fact, and a fact that is absent produces no
      clause at all. There is no "unknown" here by design: a reader can see
      what the page does not say, and a filled-in placeholder about a living
      person is exactly what this collection refuses to publish.
    */
    const life: string[] = []
    if (born) life.push(`was born ${born}`)
    if (birthPlace) life.push(born ? `in ${birthPlace}` : `was born in ${birthPlace}`)
    if (life.length > 0) body.push(sentence(`${person.name} ${life.join(' ')}`))
    if (nationality) body.push(sentence(`Sources describe them as ${nationality}`))
    /*
      Its own sentence, never folded into `birthPlace`. "Where they are from"
      and "where they were born" are different claims and the schema has a
      field for one of them; writing a hometown into it would invent the other.
    */
    const hometown = usable(person.profile?.hometown)
    /* …unless it is the birthplace already in the sentence above, word for word. */
    if (hometown && hometown !== birthPlace) {
      body.push(sentence(`Their hometown is given as ${hometown}`))
    }

    if (occupation) body.push(sentence(`Their work is given as ${occupation.toLowerCase()}`))
    if (activeSince) body.push(sentence(`Sources put their active years at ${activeSince}`))
    if (notableWorks) body.push(sentence(`Credits listed elsewhere for them include ${notableWorks}`))

    if (person.credits.some((credit) => credit.uncertain)) {
      const stated = person.credits.find((credit) => credit.uncertain)?.stated ?? ''
      /*
        A conflict recorded rather than resolved, which is the house rule.
        Phantom Blade Zero's article credits "Soulframe Liang or Soulframe" and
        neither this file nor anybody else gets to pick one.
      */
      body.push(
        `The source is not settled on the spelling of this credit: it reads "${stated}". Both forms are recorded here rather than one being chosen.`,
      )
    }

    if (article) {
      body.push(
        `This profile is compiled from the English Wikipedia article on ${article.title} and from the credit that named them. Nothing here is inferred.`,
      )
    } else if (person.article) {
      /*
        The honest version of "we found something and did not trust it". A
        reader who knows the field can settle it in a second, and hiding the
        near-miss would leave the page looking like nobody had looked.
      */
      body.push(
        `An English Wikipedia article exists under this name, but nothing in it connects that person to this credit, so none of it is used here. This page carries the credit that named them and nothing else.`,
      )
    } else {
      body.push(
        `No English Wikipedia article was found under this name when the network was compiled, so this page carries the credit that named them and nothing else.${person.unresolvedReason ? ` The lookup reported: ${person.unresolvedReason}.` : ''}`,
      )
    }

    // --- Credits ----------------------------------------------------------
    const works: { title: string; year?: string; kind: string; role?: string }[] = []
    for (const credit of crewCredits) {
      const game = gameBySlug.get(credit.game)?.title ?? credit.gameTitle
      const year = yearOf(file.games[credit.game]?.released)
      works.push({
        title: game,
        ...(year ? { year } : {}),
        kind: 'game',
        role: ROLE_LABEL[credit.role as Role] ?? credit.role,
      })
    }
    for (const credit of parts) {
      const game = gameBySlug.get(credit.game)?.title ?? credit.gameTitle
      const year = yearOf(file.games[credit.game]?.released)
      works.push({
        title: game,
        ...(year ? { year } : {}),
        kind: 'game',
        role: performanceCredit(credit, credit.character),
      })
    }

    /*
      Credits the person's own page lists, kept apart by how well the source
      states what they are. `shmovies` says films outright, so those are
      filed as films with the role the page gives. `otherappearances` is a
      bare list — "Crash, Elden Ring, Observation" is a film, a game and a
      game, and there is no way to tell from the field — so they are filed as
      "other" with no role rather than guessed into shape.
    */
    for (const film of person.profile?.films ?? []) {
      works.push({
        title: film,
        kind: 'film',
        ...(person.profile?.crewRole ? { role: usable(person.profile.crewRole) } : {}),
      })
    }
    for (const work of person.profile?.otherWorks ?? []) {
      works.push({ title: work, kind: 'other' })
    }

    // --- Sources ----------------------------------------------------------
    const sources: { title: string; url: string; retrieved?: string | null }[] = []
    const cite = (title: string, url: string, retrieved?: string | null) => {
      if (!url || sources.some((source) => source.url === url)) return
      sources.push({ title, url, retrieved: retrieved ?? null })
    }
    for (const credit of person.credits) cite(credit.sourceTitle, credit.source, credit.retrieved)
    /*
      Every page, not the deduplicated list: where a performer's page and the
      character's page both name the credit, both are sources for it and both
      belong at the foot of the record. Only the *claim* is written once.
    */
    for (const credit of person.characters) cite(credit.sourceTitle, credit.source, credit.retrieved)
    if (person.profile) {
      cite(`${person.profile.title} — ${person.profile.wiki} (CC BY-SA)`, person.profile.url, person.profile.retrieved)
    }
    if (article) {
      cite(`${article.title} — Wikipedia (CC BY-SA 4.0)`, article.url, file.fetchedAt)
    }
    if (sources.length === 0) {
      /*
        Unreachable by construction — the harvester only ever writes a name a
        sourced page printed — and checked anyway, because `src/seed/import.ts`
        rejects a record with no source URL and this is the same rule applied
        at the other door.
      */
      review.push(`${person.name}: no source URL, not written`)
      continue
    }

    const data = {
      name: person.name,
      slug,
      ...(sortName ? { sortName } : {}),
      roles: roleList,
      knownFor,
      ...(born ? { born } : {}),
      ...(birthPlace ? { birthPlace } : {}),
      ...(nationality ? { nationality } : {}),
      ...(activeSince ? { activeSince } : {}),
      ...(aliases.length > 0 ? { alsoKnownAs: aliases.join(', ').slice(0, 220) } : {}),
      ...(website ? { website } : {}),
      works,
      games: gameIds,
      characters: characterIds,
      basis: wikiMentionOnly
        ? 'wiki-mention'
        : person.credits.length > 0
          ? 'game-credit'
          : 'character-credit',
      confidence,
      summary,
      body: rich(...body),
      sources,
    }

    const existing = await payload.find({
      collection: 'people',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })

    if (existing.docs[0]) {
      await payload.update({ collection: 'people', id: existing.docs[0].id, data: data as never })
      updated += 1
    } else {
      await payload.create({ collection: 'people', data: data as never })
      created += 1
    }
  }

  console.log(`people: ${created} created, ${updated} updated`)
  console.log(`confidence: ${high} high (article corroborates the credit), ${low} low (credit only)`)
  console.log(
    `character relationships: ${charactersLinked} linked, ${charactersMissed} with no record to point at, ` +
      `${charactersElsewhere} filed outside the characters collection on their own wiki`,
  )
  console.log(
    `filed as wiki-mention (named on a franchise wiki, credited on no game here): ${mentions}`,
  )
  console.log(`fragments the harvester refused to split: ${file.dropped.length}`)

  /*
    The second tier, in the same shape `pnpm check:kind` reports in: the first
    counts are mechanical, this is the list somebody has to read. Each line is
    a near-miss this file refused to act on, which is exactly the kind of call
    that should be made by a person rather than by a regular expression.
  */
  if (review.length > 0) {
    console.log(`\nfor review (${review.length}):`)
    for (const line of review) console.log(`  ${line}`)
  }

  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
