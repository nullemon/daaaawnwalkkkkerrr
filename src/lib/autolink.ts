/**
 * Finding the entities a sentence names, so composed prose can link to them.
 *
 * ## What this is for
 *
 * Almost every sentence on this network is composed from records, and almost
 * none of it links anywhere. "Olivier Deriviere scored Resonance: A Plague Tale
 * Legacy (2026)" names a game that has a whole wiki, on a host that is one hop
 * away, and prints it as plain text. So does every character summary that names
 * a region, every faction summary that names its game, every company profile
 * that names a person we already have a page for.
 *
 * ## The failure mode this is written against
 *
 * A wrong link is a claim that two things are the same thing, made silently, in
 * a place nobody proofreads. Nothing downstream catches it: `pnpm verify` asks
 * whether a record has a game, `pnpm check:kind` asks what kind of thing it is,
 * the build asks whether a page renders, and every one of them stays green
 * while the word "general" in a sentence points at a character called General.
 *
 * This repository has been here twice. `isNotAnEntity` deleted Antar 4, a real
 * moon, because a rule written to catch sequels rejected any Title Case name
 * ending in a digit. `check:kind` flagged a real enemy for containing the word
 * "series". Both were one clever regular expression too far, and the fix both
 * times was a reviewed list rather than a cleverer rule. So the refusals here
 * are a list somebody can read (`ORDINARY_WORDS`), `buildMatcher` reports
 * everything it threw away and why, and the tests pin both directions - the
 * words that must not link and the names that must.
 *
 * ## The rules, in the order they fire
 *
 * 1. **Whole words only.** The text is tokenised into runs of letters and
 *    digits, and a match must cover whole tokens, so "Sega" cannot match inside
 *    "Segafredo" and no rule about word boundaries has to be written twice.
 * 2. **Longest match first.** "Silent Hill: Townfall" is tried before "Silent
 *    Hill", because linking the shorter one first would point a reader at the
 *    wrong game and leave the rest of the title dangling.
 * 3. **Punctuation between words has to be the name's own.** "Capcom Co., Ltd."
 *    matches "Capcom Co. Ltd" - the text's punctuation is a subset of the
 *    name's. It does not match "Capcom Co. Ltd" spread across a sentence break,
 *    and "Silent Hill. Townfall is..." does not match "Silent Hill: Townfall",
 *    because a full stop is not a colon.
 * 4. **A capitalised name needs a capitalised mention.** The match is otherwise
 *    case-folded, which is what makes "DERIVIERE" and "Deriviere" the same
 *    word - and also what would make the ordinary word "general" point at a
 *    character called General. So an upper-case initial in the name requires
 *    one in the text. The rule is one-way on purpose: a name with a lower-case
 *    particle ("von Braun") still matches "Von Braun".
 * 5. **A minimum length, and a stop list.** A one-word name under five
 *    characters, a bare number, or an ordinary English word never links at all.
 * 6. **Ambiguity refuses, it does not choose.** Two records whose names fold
 *    together are a question the data cannot answer, which is the same rule
 *    `src/lib/entity-links.ts` follows for the same reason.
 *
 * Game-scoped targets carry their wiki and only match inside it: a character
 * called Jack on one wiki must never link to a different wiki's Jack, which is
 * the same filter every public read applies.
 *
 * Kept free of Payload types, of React and of `next/link` so it can be unit
 * tested without a database - the same reason `src/lib/reachability.ts` is.
 */

/** Which kind of page a target is, which decides the host its URL is on. */
export type LinkKind = 'person' | 'company' | 'game' | 'record'

export type LinkTarget = {
  /**
   * Identity, as `collection:id`.
   *
   * Two jobs: the page compares it against its own record so nothing links to
   * itself, and it is the key of the "already linked in this block" set. It is
   * not the slug, because a person and a character can share one.
   */
  key: string
  kind: LinkKind
  /** The name as its own page writes it. Used for the link's title attribute. */
  name: string
  href: string
  /**
   * True when `href` crosses an origin, so the call site renders a plain `<a>`.
   *
   * Every wiki, the people host and the companies host are separate origins;
   * `next/link` across one adds a prefetch that cannot work. See `lib/urls.ts`.
   */
  external: boolean
  /**
   * The wiki this belongs to: the record's game, or a game's own slug.
   *
   * It does two different jobs depending on `kind`, and conflating them is a
   * bug that only shows up off the wikis. On a `record` it is the scope - the
   * record matches inside that wiki and nowhere else. On a `game` it is the
   * identity of the wiki itself, used only to stop a wiki linking to its own
   * home page; a game still matches everywhere, which is the whole point of the
   * people and companies hosts naming one.
   *
   * Absent means network-wide - a person or a company, which matches anywhere.
   */
  game?: string
  /**
   * How strongly a bare mention of this name means *this* record. Lower wins.
   *
   * Set only where one subject is deliberately filed in several collections and
   * one of those filings is the subject itself - see `sameSubject` below, which
   * is the only thing that reads it. Absent on everything else, and absent is
   * not "last": a candidate with no facet makes the whole match refuse.
   */
  facet?: number
}

/** A target plus every spelling it answers to. A game has a title and a short title. */
export type NamedTarget = LinkTarget & { names: string[] }

/** One name in the index: whose it is, and what punctuation it holds. */
type Entry = {
  target: LinkTarget
  /**
   * The punctuation in each gap between the name's own words.
   *
   * `["", ".,"]` for "Capcom Co., Ltd.". A mention's punctuation has to be a
   * subset of this, which is what stops a sentence boundary being read as part
   * of a name.
   */
  gaps: string[]
  /** Which of the name's words begin with a capital, by index. */
  caps: boolean[]
}

export type Refusal = { name: string; key: string; reason: string }

export type Matcher = {
  byKey: Map<string, Entry[]>
  /** The longest n-gram worth trying at a position whose first word is this one. */
  reach: Map<string, number>
  /** Everything `buildMatcher` threw away, so it can be printed and reviewed. */
  refusals: Refusal[]
}

/**
 * The shortest a one-word name may be before it is allowed to link.
 *
 * Five, which costs real links - Coen is the player character of the flagship
 * wiki and is four letters - and buys the whole class of two- and three-letter
 * company names that are also ordinary fragments of English: 2K, NC, 8-4, Gust,
 * Atod, Sega, Sony, Xbox. Multi-word names are exempt, because two words in a
 * row are already a strong signal.
 */
export const MIN_SINGLE_WORD = 5

/**
 * One-word names under the minimum that link anyway. The appeal against it.
 *
 * A stop list with no allow list is a rule with no appeal, and the length rule
 * was costing two names that matter more than everything it saved: **Coen**,
 * the player character of the flagship wiki and the most-named record on it,
 * and **COG**, which is how the Gears wiki writes its own faction.
 *
 * The bar is the one the capitalisation rule leaves open. Case-folding is safe
 * because a capitalised name needs a capitalised mention, so the only real
 * exposure for a short name is an **ordinary English word at the start of a
 * sentence** - "Rat ate the grain", "Soul is what it costs", "Null on a field
 * nobody filled". Every name below was checked against that and none of them is
 * an English word at all.
 *
 * Deliberately still refused, and each for that reason: Paul, Duke, Lion, Rat,
 * Soul, Null, Tee, Oha, Dug, Lea, Clog, Clev, NC, 2K, 8-4.
 *
 * This is an appeal against the *length* rule only. A name on this list still
 * has to clear `ORDINARY_WORDS` and the bare-number rule, because those are
 * about what the word is, not how long it is.
 */
export const SHORT_NAMES_ALLOWED = new Set<string>(
  (
    /*
      Dawnwalker: the player character, and three of the valley's named cast.
      Gears: the Coalition, as its own wiki abbreviates it.
      Star Wars: species and worlds, none of them an English word.
      Onimusha and the rest: given names from the harvested cast.
      Network-wide: three companies whose names are theirs and nobody else's.
    */
    `coen cog anca ahti ifuu krex kuat pyke duro hutt jedi sith gioh volk mert
     alin atod esme ezra leni milo remi sera theo vera kaia sara sega sony xbox`
  )
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * One-word names that are ordinary English and must never link.
 *
 * Read off the single-word titles actually in the database - there are about
 * five hundred - plus the ordinary words a future harvest would plausibly
 * produce. It is a list rather than a rule for the reason `check:kind` keeps
 * fifty-six reviewed titles instead of a cleverer regex: every rule anybody
 * wrote here was wrong in one direction or the other, and a list is at least
 * wrong visibly.
 *
 * The bar is "a word a reader would write in a sentence without meaning the
 * record". Invented nouns stay out of it: squig, reaver, vrakhir, wookiee,
 * padawan and stormtrooper are linkable, because nobody writes them by
 * accident. Words that are also a record somewhere are in it anyway - there is
 * a character called Forge and a company called Ancient, and "they forge a
 * blade" and "an ancient circle" are sentences this site writes.
 *
 * `darth` is in it for a third reason worth naming: it is a title that always
 * precedes a name. The Star Wars wiki has an article about the honorific, so
 * "Darth Vader" - a name with no record of its own - linked its first word to a
 * page about what the word means. The ranks above it are here for exactly the
 * same shape.
 */
export const ORDINARY_WORDS = new Set<string>(
  (
    `a an and are as at be been but by for from had has have he her his if in into is it its
     no nor not of on or our she so than that the their them then there these they this to
     was we were what when where which who why will with you your

     admiral baron bishop captain chief colonel commander corporal count darth deacon doctor
     duchess duke emperor general judge king knight lady lieutenant lord major marshal officer
     president priest prince princess professor queen sergeant senator

     animal bandit bear beast bird boy brother builder cat child creature daughter demon dog
     driver enemies enemy family father flayer friend ghost giant girl guard human humans hunter
     lion maker man mind monster mother people person pirate player rat reader rebel scout
     sister slave sniper soldier son spider spirit thief warrior wolf woman worker

     area battlefield border camp cathedral cave centre center church city colonies colony desert door
     farm field fields forest frontier garden gate harbor harbour hideout home hospital house
     island lake library manor market mine moon mountain museum nebula north ocean palace place
     planet port prison region river road room sanctuary school sea south square star station
     street sun temple town tower university valley village wall water west wood woods world zone

     air arrow axe bag blood body bomb bone book books bow box candle chapter chart coin coins
     collectible collectibles costume costumes crown earth eye eyes face film fire flesh glass
     gold gun guns hammer hand head heart image iron key keys knife lamp list lock map maps
     mirror movie music page pages photo picture pipe pistol radio rifle ring revolver rope
     shield shovel silver skin song sound spear staff steel stone story stories sword table
     timeline torch video voice weapon weapons

     achievement achievements army attack beginning blasphemy blessing blight boomer boomers
     block build builds charge class classes clog combat commando corruption council counterattack
     court courts craft crafting curse damage defence defense dodge drone drop drops edition
     editions ending endings epilogue event events guide guides horde hotline item items legion
     level levels loophole loot meditation mission missions navy offshoot order outlaw outsiders
     partisans patch perk perks plague prologue quest quests rank ranking reward rewards scourge
     score senate skill skills spectres squad stage stats swarm threshold trade unit update upgrade
     upgrades

     autumn birthday day death evening future history life moment month morning night past
     present season spring summer time week winter year

     ancient another bad best better big black blue bright broken closed common cursed dark dead
     deep disturbed each easy empty every false fast few final finish first former found free
     full good gray green grey grind grinder hard held hidden high holy large last less light
     little long lost loud low many missing modern more most new next none old open ordinary
     other quake quiet rare real red remaining safe sacred secret several short shake shakes
     slow small some start stranded strong trick true uninvited unique unknown various void
     weak white wide wild worse worst yellow young

     acquire birthday centaur company companies developer dozen drone forge games game gunship
     minotaur network null phoenix publisher search site speeder studio ticker various voodoo
     wiki wretch`
  )
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * Company names that a wiki uses to mean hardware, not a corporation.
 *
 * `Xbox` and `Nintendo` are both company records on this network, and both are
 * also what a wiki calls a machine. The Dawnwalker guide to perfect blocking
 * says the input "is LB on Xbox, L1 on PlayStation and left mouse button on
 * PC", and a Silent Hill comparison lists "platforms: Nintendo Wii, PlayStation
 * 2" - linking either of those to a corporate profile is a category error, and
 * it looks worse for being asymmetric, since PlayStation has no record and stays
 * plain beside it.
 *
 * They are not refused outright, because "Xbox's own article names them as EVP
 * & CEO" on an executive's profile is exactly the link this mechanism is for.
 * `src/lib/link-index.ts` keeps these out of a wiki's index and leaves them in
 * on the people and companies hosts, which is where the corporation is the
 * subject. That split is the rule; this is only the list.
 *
 * The test for adding a name: does this corpus use the word to mean hardware
 * more often than to mean the company? Only these two do today. `PlayStation
 * Studios` and `PlayStation Productions` are not here - they are the companies'
 * full names and no wiki writes them about a console.
 */
export const PLATFORM_NAMES = new Set(['xbox', 'nintendo'])

/*
  Quote and dash characters folded to their plain form before punctuation is
  compared.

  The generators write curly apostrophes - "Asobo Studio's prequel" is stored
  with U+2019 - while a record title is stored with a straight one. Without
  this, "Boar's Back" in prose would not match the region record "Boar's Back",
  and the failure would be invisible: a link that simply never appears.
*/
const PUNCT_ALIAS: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '.',
}

/**
 * The widest gap between two words that can still be inside one name.
 *
 * Four characters covers every real one - "Capcom Co., Ltd." is the worst at
 * three - and refuses a match that would have to jump a parenthetical or a
 * clause to find its second half.
 */
const MAX_GAP = 4

const WORD = /[\p{L}\p{N}]+/gu

type Token = { start: number; end: number; folded: string; capital: boolean }

/**
 * Case, accents and punctuation folded away; nothing else.
 *
 * Symmetric by construction, because the name and the text go through the same
 * function. That is what makes it safe where a similarity score would not be:
 * two strings that fold together are the same string once an editor has been
 * through them, and two that do not are reported as no match rather than
 * guessed at.
 */
const foldWord = (word: string): string =>
  word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export const tokenize = (text: string): Token[] => {
  const tokens: Token[] = []
  for (const match of text.matchAll(WORD)) {
    const raw = match[0]
    tokens.push({
      start: match.index,
      end: match.index + raw.length,
      folded: foldWord(raw),
      // `toLowerCase` rather than a range test, so Cyrillic and Greek count too
      // and a digit-initial word ("8-4") is simply not capitalised.
      capital: raw[0] !== raw[0].toLowerCase(),
    })
  }
  return tokens
}

/**
 * A name reduced to the key `buildMatcher` files it under.
 *
 * Exported so a caller comparing a name against a reviewed list compares the
 * same thing the index does; two folds that drift apart is a list that silently
 * stops matching.
 */
export const nameKey = (name: string): string =>
  tokenize(name.normalize('NFC'))
    .map((token) => token.folded)
    .join(' ')

/** The punctuation in a gap, folded and sorted, with whitespace dropped. */
const gapSignature = (gap: string): string => {
  const chars = new Set<string>()
  for (const char of gap) {
    const mapped = PUNCT_ALIAS[char] ?? char
    if (/\s/.test(mapped)) continue
    chars.add(mapped)
  }
  return [...chars].sort().join('')
}

/** Is every mark in the text's gap one the name's own gap has? */
const gapFits = (textGap: string, nameGap: string): boolean => {
  if (textGap.length > MAX_GAP || textGap.includes('\n')) return false
  for (const char of gapSignature(textGap)) if (!nameGap.includes(char)) return false
  return true
}

/**
 * Why this name will never be offered as a link, or null if it may be.
 *
 * Returns the reason rather than a boolean so `buildMatcher` can report what it
 * threw away. A filter written to stop bad records is still a filter, and one
 * whose losses nobody can see is the one that quietly throws away the good
 * ones - which is exactly how Antar 4 went missing.
 */
export const refuseName = (name: string, tokens: Token[]): string | null => {
  if (tokens.length === 0) return 'no letters or digits in the name'
  /*
    A leading mark is dropped by the tokeniser, which means the name matched is
    not the name written.

    There is a company called `.Gears` — a Wikipedia category artefact — and it
    folds to the single word "gears", so the phrase "the Gears of War series" on
    the Gears wiki linked to a studio nobody has heard of. Trailing marks are
    fine and must stay fine: "Capcom Co., Ltd." ends in a full stop and is a
    real name spelled that way.
  */
  if (!/^[\p{L}\p{N}]/u.test(name)) return 'starts with punctuation'
  if (tokens.length > 1) return null
  const word = tokens[0]!.folded
  // Digits first: a company called 2015 is refused for being a year, which is
  // the reason somebody reading this list needs, not for being four characters.
  if (/^\d+$/.test(word)) return 'one word, and a bare number'
  if (word.length < MIN_SINGLE_WORD && !SHORT_NAMES_ALLOWED.has(word))
    return `one word, under ${MIN_SINGLE_WORD} characters`
  if (ORDINARY_WORDS.has(word)) return 'one word, and an ordinary English word'
  return null
}

/**
 * The longest name worth trying at any one position.
 *
 * Twelve is well past the longest real title and keeps the inner loop bounded
 * whatever a future harvest produces; without a cap, one absurd record would
 * make every position in every paragraph do its length in lookups.
 */
const MAX_WORDS = 12

export const buildMatcher = (targets: NamedTarget[]): Matcher => {
  const byKey = new Map<string, Entry[]>()
  const reach = new Map<string, number>()
  const refusals: Refusal[] = []
  const seenRefusal = new Set<string>()

  for (const target of targets) {
    for (const name of target.names) {
      if (!name || !name.trim()) continue
      const normalised = name.normalize('NFC')
      const tokens = tokenize(normalised)

      const reason = refuseName(normalised, tokens)
      if (reason) {
        // One line per (name, reason), not per record: three companies called
        // the same ordinary word are one finding, not three.
        const dedupe = `${normalised}|${reason}`
        if (!seenRefusal.has(dedupe)) {
          seenRefusal.add(dedupe)
          refusals.push({ name: normalised, key: target.key, reason })
        }
        continue
      }
      if (tokens.length > MAX_WORDS) {
        refusals.push({ name: normalised, key: target.key, reason: `over ${MAX_WORDS} words` })
        continue
      }

      const key = tokens.map((token) => token.folded).join(' ')
      const gaps = tokens
        .slice(0, -1)
        .map((token, index) => gapSignature(normalised.slice(token.end, tokens[index + 1]!.start)))

      const entry: Entry = { target, gaps, caps: tokens.map((token) => token.capital) }
      const existing = byKey.get(key)
      if (existing) existing.push(entry)
      else byKey.set(key, [entry])

      const first = tokens[0]!.folded
      reach.set(first, Math.max(reach.get(first) ?? 0, tokens.length))
    }
  }

  return { byKey, reach, refusals }
}

/**
 * The one case where two candidates are not a conflict.
 *
 * Ambiguity normally refuses, and rule 6 in the header says why: two records
 * whose names fold together are a question the data cannot answer. That rule
 * was written for a *collision* - two unrelated things that happen to share a
 * name, where picking one is a coin flip.
 *
 * Some of this network's records are not a collision. Ambrus is three rows on
 * one wiki by design: `characters` (who he is), `enemies` (the fight against
 * him) and `courts` (his court). They are three facets of one subject, and the
 * asymmetry between them is readable rather than arbitrary - the boss is called
 * Ambrus *because the fight is against him*, and the court is his. A bare
 * "Ambrus" in prose means the man. That is a derivation, not a coin flip, and
 * refusing it costs the flagship wiki its four most-named links.
 *
 * So: where every candidate carries a facet and exactly one of them ranks
 * strictly highest, that one wins. Everything else still refuses, and that
 * includes cases that look similar:
 *
 * - **Naboo**, a character and a region on the Star Wars wiki, is one subject
 *   filed twice with one of the filings simply *wrong* - a planet in
 *   `characters`. Precedence would confidently pick the error. It is a
 *   `pnpm check:kind` finding, not a link to make.
 * - **The Hiss**, an enemy and a faction on the Control wiki, genuinely is two
 *   facets - but the ordering is not one that generalises. A faction whose foot
 *   soldiers carry its name would want the opposite answer, and nothing in the
 *   data says which shape this is.
 * - **Under Watchful Eyes** and the other two quest/court-activity pairs are
 *   one activity filed in both lists, with no derivation either way: neither
 *   record is named *after* the other. The Ambrus test does not apply, so
 *   neither does the rule.
 *
 * A candidate with no facet is not ranked last, it refuses the whole match.
 * That is what keeps a person and a character who share a name apart, and it is
 * what stops this quietly becoming a total order over every collection.
 */
const sameSubject = (candidates: LinkTarget[]): LinkTarget | null => {
  if (candidates.some((target) => target.facet === undefined)) return null
  const ranked = [...candidates].sort((a, b) => a.facet! - b.facet!)
  // Strictly highest, not merely first: two records at the same rank is the
  // ambiguity this function exists to leave alone.
  return ranked[0]!.facet! < ranked[1]!.facet! ? ranked[0]! : null
}

/** A run of prose: plain when `target` is absent, a link when it is not. */
export type Segment = { text: string; target?: LinkTarget }

export type MatchOptions = {
  /**
   * The wiki being rendered, when the page is on one.
   *
   * Game-scoped targets match only here, and the wiki's own game is treated as
   * self: every faction summary on the Gears wiki names Gears E-Day, and
   * linking all 1,900 of them to the home page a reader is already inside is
   * noise rather than navigation.
   */
  game?: string
  /** The page's own record, as `collection:id`. Never linked to itself. */
  self?: string
  /**
   * Targets already linked in this block of prose. Mutated as matches are made.
   *
   * Scope is the caller's choice and is deliberately one block rather than one
   * page - see the note on `Linked` in `src/components/Linked.tsx`.
   */
  seen: Set<string>
}

/**
 * Split text into plain runs and linked runs.
 *
 * Linear in the text: a position whose first word begins no name at all costs
 * one map lookup, and one that does costs at most the length of the longest
 * name starting with that word.
 */
export const matchText = (text: string, matcher: Matcher, options: MatchOptions): Segment[] => {
  /*
    Composed once, in NFC, and every offset below indexes into it. The segments
    handed back are slices of this string rather than of the caller's, so a
    decomposed accent cannot split a token and cannot shift an offset.
  */
  const source = text.normalize('NFC')
  const tokens = tokenize(source)
  if (tokens.length === 0 || matcher.byKey.size === 0) return [{ text: source }]

  const segments: Segment[] = []
  let cut = 0
  let index = 0

  while (index < tokens.length) {
    const start = tokens[index]!
    const longest = matcher.reach.get(start.folded)
    if (longest === undefined) {
      index += 1
      continue
    }

    let consumed = 0
    let hit: LinkTarget | null = null

    for (let span = Math.min(longest, tokens.length - index); span >= 1; span -= 1) {
      const window = tokens.slice(index, index + span)
      const entries = matcher.byKey.get(window.map((token) => token.folded).join(' '))
      if (!entries) continue

      const fits = entries.filter((entry) => {
        for (let step = 0; step < span - 1; step += 1) {
          const gap = source.slice(window[step]!.end, window[step + 1]!.start)
          if (!gapFits(gap, entry.gaps[step] ?? '')) return false
        }
        // A capitalised name needs a capitalised mention; a lower-case one
        // takes either. Without this the fold that makes "DERIVIERE" match
        // also makes the word "general" point at a character called General.
        for (let step = 0; step < span; step += 1) {
          if (entry.caps[step] && !window[step]!.capital) return false
        }
        return true
      })
      if (fits.length === 0) continue

      const unique = [...new Map(fits.map((entry) => [entry.target.key, entry.target])).values()]
      // Only a `record` is scoped by its wiki. A game and a person are
      // network-wide and match wherever they are named.
      const scoped = unique.filter(
        (target) => target.kind !== 'record' || target.game === options.game,
      )

      /*
        Nothing in scope is not a match; it is this wiki not having the record,
        which is the ordinary case for most of the index on most pages.
      */
      if (scoped.length === 0) continue

      /*
        Two records whose names fold together is a question the data cannot
        answer, and CLAUDE.md's rule is to record a conflict rather than
        resolve it - unless they are facets of one subject, which `sameSubject`
        is the only thing allowed to decide. Either way the span is consumed
        rather than retried shorter, so an unresolved "The Hiss" cannot fall
        through and link a fragment of itself.
      */
      consumed = span
      const resolved = scoped.length === 1 ? scoped[0]! : sameSubject(scoped)
      if (!resolved) break

      const target = resolved
      const isSelf =
        target.key === options.self ||
        (target.kind === 'game' && options.game !== undefined && target.game === options.game)
      if (isSelf || options.seen.has(target.key)) break

      hit = target
      break
    }

    if (consumed === 0) {
      index += 1
      continue
    }

    const from = tokens[index]!.start
    const to = tokens[index + consumed - 1]!.end
    if (hit) {
      if (from > cut) segments.push({ text: source.slice(cut, from) })
      segments.push({ text: source.slice(from, to), target: hit })
      options.seen.add(hit.key)
      cut = to
    }
    index += consumed
  }

  if (cut < source.length) segments.push({ text: source.slice(cut) })
  return segments
}

/*
  Node types a match must never be made inside.

  `link` and `autolink` because an anchor inside an anchor is invalid HTML and
  the browser silently un-nests it, leaving a link whose destination depends on
  where the reader clicked. `heading` because a heading labels the section under
  it and a link in one competes with the section's own navigation. `code`
  because the whole point of code is that it is quoted verbatim.

  Here rather than beside the renderer so it can be tested without React, and
  because which contexts refuse a link is a matching rule rather than a
  rendering detail.
*/
export const NO_LINKS_INSIDE = new Set(['link', 'autolink', 'heading', 'code'])

/** A serialised node, with the parent chain the JSX converter hands down. */
export type NodeWithParent = { type?: string; parent?: NodeWithParent }

/**
 * Walk the ancestors, not just the immediate parent.
 *
 * A text node inside a bold span inside a link is two hops from the anchor, and
 * a check that looked only at the parent would nest an anchor inside it — which
 * does not throw, does not warn, and produces a link whose href depends on
 * where in the word the reader clicked.
 */
export const insideProtectedNode = (node: NodeWithParent | undefined): boolean => {
  for (let current = node; current; current = current.parent) {
    if (current.type && NO_LINKS_INSIDE.has(current.type)) return true
  }
  return false
}
