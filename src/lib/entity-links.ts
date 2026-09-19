/**
 * Edges from harvested infobox facts.
 *
 * ## What this is for
 *
 * Dawnwalker's 440 records were researched by hand, so a character names the
 * region they are found in, a quest names its prerequisites, an item names
 * where it drops. The other seven wikis are harvested, and
 * `tools/fetch-wiki-entities.mjs` writes *facts* and no edges — so every
 * relationship field on those seven is empty and the inline linking that makes
 * a wiki feel like a wiki is Dawnwalker-only.
 *
 * The facts to build those edges from were already on disk and unused. A
 * character's infobox says `homeland = "Kalona, Tyrus"` and there is a region
 * record called Kalona in the same game. That is an edge nobody had to invent.
 *
 * ## The failure mode this is written against
 *
 * A wrong edge is worse than a missing one, because a wrong edge reads as
 * researched. A reader who sees "Region: Ephyra" on a character page has no
 * way to tell it from Dawnwalker's hand-checked data, and nothing downstream
 * will ever flag it: `pnpm verify` asks whether a record has a game, the build
 * asks whether a page renders, and both stay green while the edge says
 * something no source does. This is the same shape as the harvester filing the
 * Gears of War film as a Region — real source URL, green build, wrong fact.
 *
 * So the matching is deliberately exact. Folding case, accents and punctuation
 * is safe because it is symmetric — both the fact value and the record title go
 * through the same fold, and two records that fold together are marked
 * ambiguous and never match anything. Everything past that is a guess, and the
 * Antar 4 note in CLAUDE.md is the standard: the first version of
 * `isNotAnEntity` deleted a real moon because a rule written to catch bad
 * records was a shade too clever. A fact value that names two things, or
 * nothing, writes no edge and is counted instead.
 *
 * Kept free of Payload types so it can be unit-tested without a database.
 */

/** A record an edge can point at: what the field would store, and its name. */
export type LinkTarget = { id: string | number; title: string }

/**
 * Folded title -> the single record with that title, or AMBIGUOUS.
 *
 * Two records folding to one key is not a match to pick between, it is a
 * question the data cannot answer, so the key is poisoned rather than resolved.
 */
export const AMBIGUOUS = Symbol('ambiguous')
export type TitleIndex = Map<string, (string | number) | typeof AMBIGUOUS>

/**
 * One relationship field, and the infobox keys that reliably name its target.
 *
 * `keys` are only the keys observed in `src/seed/raw/wiki-entities/*.json` that
 * name a *place or a mission* — the two kinds of thing the schema has fields
 * for. Keys that name a faction, a relative, an ally, a job or another game are
 * deliberately absent: there is no field for any of them, and a key with
 * nowhere to go is a finding for the report, not a field to invent.
 */
export type EdgeRule = {
  /** Collection whose records carry the field. */
  from: string
  /** The relationship field on that collection. */
  field: string
  /** Collection the field points at. Fact values are matched against its titles. */
  to: string
  hasMany: boolean
  /**
   * Infobox keys, already lowercased, narrowest first.
   *
   * Tried in order, and a key that names nothing falls through to the next.
   * The Ashtray Maze's infobox states both `sector = "Research Sector"` and
   * `location = "Oldest House"` — two true statements, not a conflict — and
   * the narrower one is the more useful and still sourced. A key that names
   * *too many* things does not fall through: that is a conflict, and CLAUDE.md's
   * rule is to record a conflict rather than resolve it, so the field stays
   * empty instead of quietly trying a different key until one answers.
   */
  keys: string[]
  /**
   * Refuse an edge that would close a loop in this field's own graph.
   *
   * Only meaningful when `from` and `to` are the same collection. "A is inside
   * B" and "B is inside A" are each a perfectly valid single edge, so a
   * pairwise check does not see it — the loop only exists in the chain, and
   * the thing that finds it is a renderer walking parents for a breadcrumb
   * until the stack runs out, or `src/lib/reachability.ts` walking `prereqs`
   * transitively and never terminating. Neither errors at write time, which is
   * why the guard has to be here.
   */
  acyclic?: boolean
}

/**
 * Every edge the schema already has a home for.
 *
 * Read `src/collections/` before adding a line here. Payload drops an unknown
 * key on update silently — the same way two hundred character portraits were
 * written to an `image` field that characters do not have — so a rule naming a
 * field that does not exist produces a clean run, a cheerful count, and no
 * edges at all.
 */
export const EDGE_RULES: EdgeRule[] = [
  /*
    Characters.region: "Where they are usually found." Residence and homeland
    are the wikis' words for exactly that. `birth`/`born` are deliberately out:
    they carry a date about half the time and a birthplace the other half, and
    a birthplace is not where somebody is found.
  */
  {
    from: 'characters',
    field: 'region',
    to: 'regions',
    hasMany: false,
    keys: ['residence', 'resides', 'homeland', 'hometown', 'homeworld', 'home', 'location'],
  },
  /*
    Enemies.region. `origin` and `habitat` join residence here because for a
    creature they mean the same thing the wiki means by homeland. They also
    carry non-places often enough ("Unidentified alternate dimension") — which
    costs nothing, because a value that is not the title of a region in this
    game matches nothing and is counted as unmatched.
  */
  {
    from: 'enemies',
    field: 'region',
    to: 'regions',
    hasMany: false,
    keys: ['homeland', 'residence', 'homeworld', 'origin', 'habitat', 'location'],
  },
  /*
    Items.region. Thin — two wikis use `location` and Control uses
    `containment_location` — and that thinness is the finding. Most item
    infoboxes on these wikis are statistics, not provenance.
  */
  {
    from: 'items',
    field: 'region',
    to: 'regions',
    hasMany: false,
    keys: ['location', 'containment_location'],
  },
  /*
    Who they fight for.

    `affiliation` is the commonest fact on two of these wikis — 229 values on
    Wookieepedia, 69 on the Gears wiki — and **no rule read it at all**, so
    every one of them sat in the harvest matching nothing while `factions`
    records existed in the same games with those exact titles. Three
    collections carry a `faction` relationship and all three were empty
    everywhere. Nothing errored: a pass that writes no edges reports a clean
    run and a cheerful count, which is the failure this file's own header
    warns about.

    It was found the way the header says to find it — by surveying the keys
    actually present across every harvested file rather than the keys the
    schema expected. The same survey is what turned up Onimusha's cast sitting
    under `Voice Actors` in a collection nobody was reading.

    `hasMany`, because the field is: "a rifle fielded by the COG and by its
    Army is one rifle with two users", and a character serving two orders in
    sequence is the ordinary case on both wikis. The values arrive
    comma-separated and `fold` splits them.

    Safe by construction, like every rule here: a value that is not the title
    of a faction in the same game matches nothing and is counted as unmatched.
    "Infinite Empire, Galactic Republic, Jedi Order, Galactic Empire" on a
    Wookieepedia planet produces edges only for the ones this network actually
    holds a record of.
  */
  {
    from: 'characters',
    field: 'faction',
    to: 'factions',
    hasMany: true,
    keys: ['affiliation', 'affiliations', 'allegiance', 'organization', 'organisation'],
  },
  {
    from: 'enemies',
    field: 'faction',
    to: 'factions',
    hasMany: true,
    keys: ['affiliation', 'affiliations', 'allegiance', 'organization', 'organisation'],
  },
  {
    from: 'items',
    field: 'faction',
    to: 'factions',
    hasMany: true,
    /*
      No `allegiance` here. On a weapon infobox it is the faction that issued
      it, which is what we want — but `manufacturer` is the commoner key for
      that and means a company rather than a faction, and the two are not the
      same claim. Only the unambiguous ones.
    */
    keys: ['affiliation', 'affiliations'],
  },
  /*
    Items.region, widened for a wiki that files by map rather than by region.

    The Resident Evil wiki puts an item's `map` — "Rhodes Hill Chronic Care
    Center", "East Raccoon City" — and its `room`, which is narrower: "Pantry
    - Care Center 1F". The map is the region; the room is a place inside one
    and matches no record, so only `map` is read.
  */
  {
    from: 'items',
    field: 'region',
    to: 'regions',
    hasMany: false,
    keys: ['map'],
  },
  /*
    Regions.parent — "Inside".

    Dawnwalker's ten regions are a flat list, which is why this field did not
    exist and why seventy-two `sector` and `location` values sat in the harvest
    matching nothing. Every other wiki's world is a hierarchy and its infoboxes
    say so: the Ashtray Maze is in the Research Sector, which is in the Oldest
    House, which is at 34 Thomas Street, New York City.

    `sector` before `location` because it is the narrower containment where a
    wiki gives both. `region` last: on the Star Wars wiki it is the galactic
    region ("Outer Rim Territories"), which is containment too, just the
    coarsest kind.
  */
  {
    from: 'regions',
    field: 'parent',
    to: 'regions',
    hasMany: false,
    acyclic: true,
    keys: ['sector', 'location', 'region', 'state', 'country'],
  },
  /* Quests.region: `place` on the battle infoboxes, `location` on mission ones. */
  {
    from: 'quests',
    field: 'region',
    to: 'regions',
    hasMany: false,
    keys: ['place', 'location'],
  },
  /*
    The mission chain. Control writes `previous_mission`/`next_mission`, the
    Gears battle infobox writes `previous`/`next`/`prev`. These are the only
    quest-to-quest edges on offer: `conc` (concurrent) has no field, and the
    checker's `excludes` is a claim about mutual exclusivity that no infobox
    makes.
  */
  {
    from: 'quests',
    field: 'prereqs',
    to: 'quests',
    hasMany: true,
    acyclic: true,
    keys: ['previous_mission', 'previous', 'prev'],
  },
  {
    from: 'quests',
    field: 'unlocks',
    to: 'quests',
    hasMany: true,
    acyclic: true,
    keys: ['next_mission', 'next'],
  },
]

/**
 * Values that are a wiki saying "no answer", not a name.
 *
 * Worth listing rather than trusting the match to fail: "Unknown" is a real
 * title on more than one wiki, so left alone it would link every character
 * whose residence nobody recorded to the same page.
 */
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
])

/**
 * Case, accent and punctuation folded away; nothing else.
 *
 * Symmetric by construction — the record title and the fact value go through
 * this same function — which is why it is safe where a similarity score would
 * not be. "Château d'Ombrage" and "Chateau d Ombrage" are the same string once
 * a wiki has been through two editors; "Hollow" and "The Hollow" are not, and
 * stripping the article to make them match would also merge "The Board" into
 * "Board". Those near-misses are reported unmatched on purpose.
 */
export const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** One piece of a fact value, with whatever the wiki put in brackets after it. */
export type Fragment = {
  /** The name, qualifier removed. */
  text: string
  /** "formerly", "deceased", "presumed" — empty when there was none. */
  qualifier: string
}

/**
 * Split a fact value into the names it lists.
 *
 * `"Ordinary, Maine (formerly), Cheyenne, Wyoming (formerly), Oldest House"`
 * is five fragments, two of them qualified. The split is lossy — "Ordinary,
 * Maine" was one place and comes apart into two — which is exactly why the
 * ambiguity rule below refuses a value whose fragments resolve to more than one
 * record for a single-valued field.
 *
 * Runs of a wiki's own list markup are separators too. `and` is not: it is a
 * word inside titles far more often than it is a separator here.
 */
export const splitFactValue = (value: string): Fragment[] =>
  value
    .split(/[,;•·\n]|\s\/\s|\s–\s|\s—\s/)
    .map((piece) => {
      const trimmed = piece.trim().replace(/[.\s]+$/, '')
      const bracketed = /^(.*?)\s*[([]([^)\]]*)[)\]]\s*$/.exec(trimmed)
      return bracketed
        ? { text: bracketed[1].trim(), qualifier: bracketed[2].trim() }
        : { text: trimmed, qualifier: '' }
    })
    .filter((fragment) => fragment.text.length > 0)

/**
 * Build the lookup a game's records are matched against.
 *
 * Scoped to one game by the caller, always — a fact on the Silent Hill wiki
 * naming a place must never reach a record on the Gears wiki, and every public
 * read on this site filters on game for the same reason.
 */
export const buildIndex = (targets: LinkTarget[]): TitleIndex => {
  const index: TitleIndex = new Map()
  for (const target of targets) {
    const key = fold(target.title)
    if (!key) continue
    index.set(key, index.has(key) ? AMBIGUOUS : target.id)
  }
  return index
}

export type Resolution = {
  /** Records to write. Empty whenever the value could not be resolved safely. */
  ids: (string | number)[]
  /** Fragments that named a record. */
  matched: string[]
  /** Fragments that named nothing in this game. The finding, not the failure. */
  unmatched: string[]
  /**
   * Fragments dropped because they carried a qualifier the field cannot hold.
   *
   * `region` says "where they are usually found" and has nowhere to write
   * "formerly", so a fragment qualified that way is dropped rather than written
   * plain. Writing it plain would turn "used to live in Ordinary" into "lives
   * in Ordinary", which is a fact no source states. Counted so the loss is
   * reported rather than silent.
   */
  droppedQualified: string[]
  /**
   * Set when a single-valued field's value named more than one record.
   *
   * "Kalona, Tyrus" is a town inside a country and both are region records:
   * picking one is a coin flip, and CLAUDE.md's rule is that a conflict gets
   * recorded, not resolved.
   */
  ambiguous: boolean
}

export type ResolveOptions = {
  hasMany: boolean
  /** The record being written, so a quest cannot become its own prerequisite. */
  self?: string | number
}

/** Resolve one fact value against one game's titles. */
export const resolveFact = (
  value: string,
  index: TitleIndex,
  options: ResolveOptions,
): Resolution => {
  const matched: string[] = []
  const unmatched: string[] = []
  const droppedQualified: string[] = []
  const ids: (string | number)[] = []

  for (const fragment of splitFactValue(value)) {
    const key = fold(fragment.text)
    if (!key || NON_ANSWERS.has(key) || /^[0-9 ]+$/.test(key)) continue

    const hit = index.get(key)
    if (hit === undefined) {
      unmatched.push(fragment.text)
      continue
    }
    // Two records share this name. That is a question, not a match.
    if (hit === AMBIGUOUS) {
      unmatched.push(fragment.text)
      continue
    }
    if (options.self !== undefined && hit === options.self) continue
    if (fragment.qualifier) {
      droppedQualified.push(`${fragment.text} (${fragment.qualifier})`)
      continue
    }
    matched.push(fragment.text)
    if (!ids.includes(hit)) ids.push(hit)
  }

  // A single-valued field given two names has no honest answer. Take neither.
  const ambiguous = !options.hasMany && ids.length > 1
  return { ids: ambiguous ? [] : ids, matched, unmatched, droppedQualified, ambiguous }
}

/** Every key this rule knows about that the entity actually carries, in rule order. */
export const factsForRule = (
  facts: Record<string, string>,
  rule: EdgeRule,
): { key: string; value: string }[] => {
  const lowered = new Map(
    Object.entries(facts).map(([key, value]) => [key.trim().toLowerCase(), value]),
  )
  const found: { key: string; value: string }[] = []
  for (const key of rule.keys) {
    const value = lowered.get(key)
    if (typeof value === 'string' && value.trim().length > 0) found.push({ key, value })
  }
  return found
}

export type RuleResolution = Resolution & { key: string; value: string }

/**
 * Resolve a rule against one entity's facts.
 *
 * Tries the rule's keys narrowest first and stops at the first that names
 * something. A key that names nothing falls through — an infobox with
 * `sector = "N/A"` and a real `location` should use the location. A key that
 * names more than one record stops the search: that is a conflict to record,
 * not a reason to go looking for a key that gives a tidier answer.
 */
export const resolveRule = (
  facts: Record<string, string>,
  rule: EdgeRule,
  index: TitleIndex,
  self?: string | number,
): RuleResolution | null => {
  let last: RuleResolution | null = null
  for (const fact of factsForRule(facts, rule)) {
    const resolved = resolveFact(fact.value, index, {
      hasMany: rule.hasMany,
      self: rule.from === rule.to ? self : undefined,
    })
    last = { ...resolved, key: fact.key, value: fact.value }
    if (resolved.ids.length > 0 || resolved.ambiguous) return last
  }
  return last
}

/**
 * Would pointing `child` at `candidate` close a loop?
 *
 * Walks the chain rather than comparing one pair, because "A inside B" and
 * "B inside A" are two individually valid edges and only the walk sees the
 * loop. The visited set is not an optimisation: `edges` may already contain a
 * cycle written before this guard existed, and without it the guard would be
 * the first thing to hang.
 */
export const wouldCycle = (
  child: string | number,
  candidate: string | number,
  edges: Map<string | number, (string | number)[]>,
): boolean => {
  const seen = new Set<string | number>()
  const stack = [candidate]
  while (stack.length > 0) {
    const current = stack.pop() as string | number
    if (current === child) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(edges.get(current) ?? []))
  }
  return false
}

/**
 * Is this relationship field empty?
 *
 * The one rule that protects Dawnwalker's hand-researched edges even if a raw
 * file for it ever appears: a generator may fill a gap, never overwrite an
 * answer somebody arrived at by reading a source.
 */
export const isEmptyEdge = (current: unknown): boolean =>
  current === null ||
  current === undefined ||
  current === '' ||
  (Array.isArray(current) && current.length === 0)
