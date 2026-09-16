import type {
  Build,
  Character,
  Court,
  CourtActivity,
  Ending,
  Enemy,
  Guide,
  Item,
  Mechanic,
  Perk,
  Quest,
  Region,
  SkillTree,
} from '@/payload-types'

/**
 * Meta titles and descriptions, composed from each record's own facts.
 *
 * Four hundred records cannot each carry a hand-written description that stays
 * true as the data changes — the first correction to a segment cost would make
 * a dozen of them wrong, silently, in the one place nobody looks. So these are
 * built at render time from the fields the page is already showing, and a
 * `seo.description` typed in the admin always wins.
 *
 * The game's name is an argument, not a module constant. It was pinned to
 * Dawnwalker for as long as there was one wiki, which meant every detail page
 * on the other seven described its subject as a thing "in The Blood of
 * Dawnwalker" - in the meta description, which is the sentence a search result
 * shows. Roughly twelve hundred pages said it, and nothing rendered wrong, so
 * nothing caught it.
 *
 * Two rules throughout. Lead with the thing being searched for, because the
 * first forty characters are what survives truncation on a phone. And never
 * assert a figure the record does not have: an item with no region says how it
 * is obtained instead, and a quest with no published cost says so rather than
 * implying one.
 */

/** Google truncates around 155; the field itself caps at 180. */
const LIMIT = 155

/**
 * Trim to the limit on a word boundary, and never mid-sentence if a sentence
 * end is close enough to the limit to be worth stopping at.
 */
export const clamp = (value: string, limit = LIMIT): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text

  // Leave room for the ellipsis, so the result is never one character over.
  const cut = text.slice(0, limit - 1)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  if (lastStop > limit * 0.6) return cut.slice(0, lastStop + 1)

  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : limit - 1).replace(/[,;:.\s]+$/, '')}…`
}

/** "a" or "an", so composed lines do not read as "a ultimate perk". */
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** Titles like "The Folk Hero" already carry their article. */
const withoutLeadingThe = (title: string) => title.replace(/^the\s+/i, '')

/** "1 segment", not "1 segments". */
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Join the parts that exist into one sentence-cased line. */
const sentence = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ')

const rel = <T extends { title?: string | null }>(value: unknown): T | null =>
  value && typeof value === 'object' ? (value as T) : null

const ACQUISITION: Record<string, string> = {
  world: 'found at a fixed location',
  'quest-reward': 'a quest reward',
  merchant: 'bought from a merchant',
  drop: 'an enemy drop',
  gathered: 'gathered across the map',
  crafted: 'crafted',
}

const PHASE: Record<string, string> = {
  day: 'Daytime only.',
  night: 'Night only.',
  either: 'Playable day or night.',
}

export const itemMeta = (doc: Item, game: string) => {
  const region = rel<Region>(doc.region)
  const where = region
    ? `Found in ${region.title}.`
    : doc.acquisition
      ? `It is ${ACQUISITION[doc.acquisition] ?? 'obtainable in-game'}.`
      : 'No source pins down where it comes from.'

  return {
    title: clamp(`${doc.title} — location and stats`, 60),
    description: clamp(
      sentence(
        `${doc.title} in ${game}:`,
        doc.rarity ? `a ${doc.rarity} ${doc.category}.` : `${doc.category}.`,
        where,
        doc.howToGet ?? '',
      ),
    ),
  }
}

export const questMeta = (doc: Quest, game: string) => {
  const region = rel<Region>(doc.region)
  const known = doc.time?.known
  const cost = known
    ? doc.time?.min === doc.time?.max
      ? `Costs ${plural(doc.time?.max ?? 0, 'segment')}.`
      : `Costs ${doc.time?.min}–${doc.time?.max} segments.`
    : 'No source publishes its segment cost.'

  return {
    title: clamp(`${doc.title} — walkthrough and time cost`, 60),
    description: clamp(
      sentence(
        `${doc.title}, a quest in ${game}${region ? ` in ${region.title}` : ''}.`,
        cost,
        doc.phase ? PHASE[doc.phase] : '',
        doc.summary ?? '',
      ),
    ),
  }
}

export const characterMeta = (doc: Character, game: string) => {
  const region = rel<Region>(doc.region)
  return {
    title: clamp(`${doc.title} — questline, role and romance`, 60),
    description: clamp(
      sentence(
        `${doc.title} in ${game}.`,
        doc.role ? `${doc.role.charAt(0).toUpperCase()}${doc.role.slice(1)}.` : '',
        doc.romanceable ? 'Romanceable.' : '',
        region ? `Found around ${region.title}.` : '',
        doc.summary ?? '',
      ),
    ),
  }
}

export const regionMeta = (
  doc: Region,
  game: string,
  counts: { quests: number; items: number },
) => ({
  title: clamp(`${doc.title} — quests, items and locations`, 60),
  description: clamp(
    sentence(
      `${doc.title}, a region in ${game}.`,
      counts.quests > 0 ? `${counts.quests} quests filed here.` : '',
      doc.summary ?? '',
    ),
  ),
})

export const enemyMeta = (doc: Enemy, game: string) => {
  const weak = doc.weaknesses?.map((w) => w.value).filter(Boolean).join(', ')
  return {
    title: clamp(`${doc.title} — weaknesses and how to beat it`, 60),
    description: clamp(
      sentence(
        `${doc.title} in ${game}.`,
        doc.isBoss ? 'A boss fight.' : '',
        weak ? `Weak to ${weak}.` : '',
        doc.summary ?? '',
      ),
    ),
  }
}

export const perkMeta = (doc: Perk, game: string) => {
  const tree = rel<SkillTree>(doc.tree)
  return {
    title: clamp(`${doc.title} — ${tree?.title ?? 'perk'} effect and cost`, 60),
    description: clamp(
      sentence(
        `${doc.title}, ${doc.isUltimate ? 'an ultimate perk' : `${article('perk')} perk`}${tree ? ` in the ${tree.title} tree` : ''} in ${game}.`,
        doc.effect ?? '',
        doc.isUltimate ? 'One ultimate per tree, so taking it closes two others.' : '',
      ),
    ),
  }
}

export const endingMeta = (doc: Ending, game: string) => ({
  title: clamp(`${doc.title} ending — how to get it`, 60),
  description: clamp(
    sentence(
      `The ${withoutLeadingThe(doc.title)} ending in ${game}.`,
      doc.gate === 'ally'
        ? 'Gated on an ally questline you must finish before the finale.'
        : doc.gate === 'clock'
          ? 'Decided by the thirty-day clock.'
          : 'Decided at the finale.',
      doc.summary ?? '',
    ),
  ),
})

export const courtMeta = (doc: Court, game: string) => ({
  title: clamp(`${doc.title}'s court — activities and the duel`, 60),
  description: clamp(
    sentence(
      `${doc.title}'s court in ${game}.`,
      doc.activityCount ? `${doc.activityCount} Court Activities,` : '',
      doc.activityCount && doc.angerThresholdPct
        ? `of which roughly ${Math.ceil((doc.activityCount * doc.angerThresholdPct) / 100)} unlock the duel.`
        : '',
      doc.summary ?? '',
    ),
  ),
})

export const activityMeta = (doc: CourtActivity, game: string) => {
  const court = rel<Court>(doc.court)
  const region = rel<Region>(doc.region)
  return {
    title: clamp(`${doc.title} — Court Activity walkthrough`, 60),
    description: clamp(
      sentence(
        `${doc.title}, a Court Activity in ${game}${court ? ` for ${court.title}` : ''}${region ? `, in ${region.title}` : ''}.`,
        doc.howToStart ?? doc.summary ?? '',
      ),
    ),
  }
}

export const treeMeta = (doc: SkillTree, game: string, perkCount: number) => ({
  title: clamp(`${doc.title} tree — perks and ultimates`, 60),
  description: clamp(
    sentence(
      `The ${doc.title} skill tree in ${game}.`,
      perkCount > 0 ? `${perkCount} perks.` : '',
      doc.summary ?? '',
    ),
  ),
})

export const buildMeta = (doc: Build, game: string) => ({
  title: clamp(`${doc.title} build — perks and gear`, 60),
  description: clamp(sentence(`The ${doc.title} build for ${game}.`, doc.summary ?? '')),
})

export const mechanicMeta = (doc: Mechanic, game: string) => ({
  title: clamp(`${doc.title} explained`, 60),
  description: clamp(sentence(`${doc.title} in ${game}, explained.`, doc.summary ?? '')),
})

/**
 * Keywords for a guide.
 *
 * Derived from the target query the article was written for plus the game's
 * own name, rather than a stuffed list. The meta keywords tag carries no
 * ranking weight anywhere that matters, so this exists to keep the target
 * query visible in the document for anything that does read it — and because
 * one honest phrase is worth more than twenty guessed ones.
 */
export const guideKeywords = (doc: Guide, game: string): string[] => {
  const words = new Set<string>()
  if (doc.targetQuery) words.add(doc.targetQuery.toLowerCase())
  const name = game.toLowerCase()
  words.add(name)
  words.add(`${name} guide`)
  return [...words]
}
