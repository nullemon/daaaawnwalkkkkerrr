import { describe, expect, it } from 'vitest'
import {
  buildMatcher,
  matchText,
  MIN_SINGLE_WORD,
  nameKey,
  ORDINARY_WORDS,
  PLATFORM_NAMES,
  SHORT_NAMES_ALLOWED,
  insideProtectedNode,
  refuseName,
  tokenize,
  type NamedTarget,
  type NodeWithParent,
  type Segment,
} from './autolink'

/**
 * Both directions, always.
 *
 * The two filters this repository got wrong - `isNotAnEntity` deleting Antar 4,
 * `check:kind` flagging a real enemy for the word "series" - were each wrong in
 * only one direction, and each had a test proving the other. So every rule here
 * is pinned twice: the thing that must link, and the thing that must not.
 */

/** `refuseName` takes the written name and its tokens; the tests only vary the name. */
const refuseName2 = (name: string) => refuseName(name, tokenize(name))

const person = (id: number, name: string): NamedTarget => ({
  key: `people:${id}`,
  kind: 'person',
  name,
  names: [name],
  href: `http://people.example.com/${id}`,
  external: true,
})

const game = (slug: string, title: string, short?: string): NamedTarget => ({
  key: `games:${slug}`,
  kind: 'game',
  name: title,
  names: short ? [title, short] : [title],
  href: `http://${slug}.example.com`,
  external: true,
  game: slug,
})

const record = (
  collection: string,
  id: number,
  title: string,
  gameSlug: string,
  facet?: number,
): NamedTarget => ({
  key: `${collection}:${id}`,
  kind: 'record',
  name: title,
  names: [title],
  href: `/${collection}/${id}`,
  external: false,
  game: gameSlug,
  facet,
})

/* The live ranking, from `FACET_ORDER` in `src/lib/link-index.ts`. */
const CHARACTER = 0
const ENEMY = 1
const COURT = 2

/** What a caller renders: the text, with the linked runs marked. */
const render = (segments: Segment[]): string =>
  segments.map((part) => (part.target ? `[${part.text}]` : part.text)).join('')

const run = (
  text: string,
  targets: NamedTarget[],
  options: { game?: string; self?: string } = {},
): string => {
  const matcher = buildMatcher(targets)
  return render(matchText(text, matcher, { ...options, seen: new Set() }))
}

describe('tokenize', () => {
  it('splits on everything that is not a letter or a digit', () => {
    expect(tokenize("Capcom Co., Ltd.").map((t) => t.folded)).toEqual(['capcom', 'co', 'ltd'])
  })

  it('folds accents so a mention spelled either way is the same word', () => {
    expect(tokenize('Derivière').map((t) => t.folded)).toEqual(['deriviere'])
  })

  it('records whether each word is capitalised', () => {
    expect(tokenize('von Braun').map((t) => t.capital)).toEqual([false, true])
  })
})

describe('refuseName', () => {
  it('refuses a one-word name shorter than the minimum', () => {
    // Both are real company records. Neither is on the allow list below.
    expect(refuseName2('Gust')).toMatch(/under 5 characters/)
    expect(refuseName2('2K')).toMatch(/under 5 characters/)
  })

  it('refuses a one-word name that is a bare number', () => {
    // A company really is called 2015. Left alone it would link every year.
    expect(refuseName2(('2015'))).toMatch(/bare number/)
  })

  it('refuses a one-word name that is an ordinary English word', () => {
    expect(refuseName2(('Ancient'))).toMatch(/ordinary English word/)
    expect(refuseName2(('Timeline'))).toMatch(/ordinary English word/)
    expect(refuseName2(('Books'))).toMatch(/ordinary English word/)
  })

  it('allows a one-word name that is nobody else in English', () => {
    // The Antar 4 direction: a filter that stops bad records must not take the
    // good ones with it. None of these is a word anybody writes by accident.
    expect(refuseName2(('Brencis'))).toBeNull()
    expect(refuseName2(('Tatooine'))).toBeNull()
    expect(refuseName2(('Wookiee'))).toBeNull()
    expect(refuseName2(('Konami'))).toBeNull()
  })

  it('refuses a name whose first character the tokeniser would drop', () => {
    // A company really is called `.Gears`, and folded it is the word "gears" —
    // which is how "the Gears of War series" came to link to a studio.
    expect(refuseName2('.Gears')).toMatch(/starts with punctuation/)
    // The other end is not the same problem: this is a real name, spelled so.
    expect(refuseName2('Capcom Co., Ltd.')).toBeNull()
  })

  it('lets a reviewed short name appeal the length rule', () => {
    // Coen is the player character of the flagship wiki and four letters long;
    // COG is how the Gears wiki writes its own faction.
    expect(refuseName2('Coen')).toBeNull()
    expect(refuseName2('COG')).toBeNull()
  })

  it('does not let the allow list overrule what a word is', () => {
    // The appeal is against length only. Nothing on the allow list is an
    // English word, and if one ever were, the stop list still wins.
    for (const word of SHORT_NAMES_ALLOWED) expect(ORDINARY_WORDS.has(word)).toBe(false)
    expect(refuseName2('Rat')).toMatch(/under 5 characters/)
    expect(refuseName2('Soul')).toMatch(/under 5 characters/)
  })

  it('keeps the platform brands in the same fold the index uses', () => {
    // These are compared against company names by `link-index.ts`, and a list
    // folded differently from the index is a list that silently stops matching.
    for (const word of PLATFORM_NAMES) expect(nameKey(word)).toBe(word)
    expect(nameKey('Xbox')).toBe('xbox')
    expect(nameKey('Capcom Co., Ltd.')).toBe('capcom co ltd')
  })

  it('allows a short word once it is part of a longer name', () => {
    expect(refuseName2(('Vale Sangora'))).toBeNull()
    expect(refuseName2(('Gears of War: E-Day'))).toBeNull()
  })

  it('keeps invented nouns out of the stop list', () => {
    for (const word of ['vrakhir', 'squig', 'brumak', 'padawan', 'tatooine']) {
      expect(ORDINARY_WORDS.has(word)).toBe(false)
    }
  })

  it('agrees with the exported minimum', () => {
    expect(MIN_SINGLE_WORD).toBe(5)
  })
})

describe('matchText', () => {
  it('links the game a credit names', () => {
    const targets = [game('plague', 'Resonance: A Plague Tale Legacy', 'A Plague Tale Legacy')]
    expect(run('Olivier Deriviere scored Resonance: A Plague Tale Legacy (2026).', targets)).toBe(
      'Olivier Deriviere scored [Resonance: A Plague Tale Legacy] (2026).',
    )
  })

  it('takes the longest name, not the first one that fits', () => {
    const targets = [
      game('townfall', 'Silent Hill: Townfall'),
      game('silent-hill', 'Silent Hill'),
    ]
    expect(run('A page about Silent Hill: Townfall.', targets)).toBe(
      'A page about [Silent Hill: Townfall].',
    )
  })

  it('matches whole words only', () => {
    const targets = [person(1, 'Konami Digital')]
    expect(run('Konamix Digital is not them.', targets)).toBe('Konamix Digital is not them.')
  })

  it('reads a name through its own punctuation, and no further', () => {
    const targets = [person(1, 'Capcom Co., Ltd.')]
    expect(run('Published by Capcom Co. Ltd in 1996.', targets)).toBe(
      'Published by [Capcom Co. Ltd] in 1996.',
    )
  })

  it('refuses to read a sentence boundary as part of a name', () => {
    // "Silent Hill: Townfall" has a colon between its halves. A full stop is
    // not a colon, and two sentences are not a title.
    const targets = [game('townfall', 'Silent Hill: Townfall')]
    expect(run('It is set in Silent Hill. Townfall follows.', targets, { game: 'x' })).toBe(
      'It is set in Silent Hill. Townfall follows.',
    )
  })

  it('matches a curly apostrophe against a straight one', () => {
    const targets = [record('regions', 1, "Boar's Back", 'dawnwalker')]
    expect(run('climbs to Boar’s Back at dusk', targets, { game: 'dawnwalker' })).toBe(
      'climbs to [Boar’s Back] at dusk',
    )
  })

  it('needs a capitalised mention for a capitalised name', () => {
    const targets = [record('enemies', 1, 'Sawtooth', 'gears')]
    expect(run('It runs along a sawtooth ridge.', targets, { game: 'gears' })).toBe(
      'It runs along a sawtooth ridge.',
    )
    expect(run('Sawtooth holds the line.', targets, { game: 'gears' })).toBe(
      '[Sawtooth] holds the line.',
    )
  })

  it('takes either case where the name itself is lower case', () => {
    const targets = [person(1, 'Wernher von Braun')]
    expect(run('a note on Wernher Von Braun', targets)).toBe('a note on [Wernher Von Braun]')
  })

  it('links only the first mention in a block', () => {
    const targets = [person(1, 'Brencis Vartan')]
    expect(run('Brencis Vartan rules. Brencis Vartan is old.', targets)).toBe(
      '[Brencis Vartan] rules. Brencis Vartan is old.',
    )
  })

  it('never links a record to its own page', () => {
    const targets = [person(7, 'Olivier Deriviere')]
    expect(run('Olivier Deriviere is a composer.', targets, { self: 'people:7' })).toBe(
      'Olivier Deriviere is a composer.',
    )
  })

  it('never links a wiki to the game it is already on', () => {
    // Every faction summary on the Gears wiki names Gears E-Day. Linking all
    // 1,900 of them to the home page the reader is inside is noise.
    const targets = [game('gears', 'Gears of War: E-Day', 'Gears E-Day')]
    expect(run('an organisation in Gears E-Day.', targets, { game: 'gears' })).toBe(
      'an organisation in Gears E-Day.',
    )
    expect(run('an organisation in Gears E-Day.', targets, { game: 'dawnwalker' })).toBe(
      'an organisation in [Gears E-Day].',
    )
  })

  it('keeps one wiki’s records out of another wiki’s prose', () => {
    const targets = [record('characters', 1, 'Jackson Hale', 'gears')]
    expect(run('Jackson Hale appears here.', targets, { game: 'dawnwalker' })).toBe(
      'Jackson Hale appears here.',
    )
    expect(run('Jackson Hale appears here.', targets, { game: 'gears' })).toBe(
      '[Jackson Hale] appears here.',
    )
  })

  it('refuses an ambiguous name rather than choosing one', () => {
    // A quest and a court activity with one name, neither named after the
    // other. Which page a reader wanted is a question the data cannot answer,
    // and neither collection carries a facet, so nothing tries.
    const targets = [
      record('quests', 1, 'Under Watchful Eyes', 'dawnwalker'),
      record('court-activities', 2, 'Under Watchful Eyes', 'dawnwalker'),
    ]
    expect(run('finish Under Watchful Eyes early', targets, { game: 'dawnwalker' })).toBe(
      'finish Under Watchful Eyes early',
    )
  })

  it('takes the subject over its facets where the ranking says so', () => {
    // Ambrus is three rows by design: the man, the fight against him, and his
    // court. A bare mention means the man.
    const targets = [
      record('characters', 1, 'Ambrus', 'dawnwalker', CHARACTER),
      record('enemies', 2, 'Ambrus', 'dawnwalker', ENEMY),
      record('courts', 3, 'Ambrus', 'dawnwalker', COURT),
    ]
    expect(run('Boyar of the north, Ambrus runs the blood tax', targets, { game: 'dawnwalker' })).toBe(
      'Boyar of the north, [Ambrus] runs the blood tax',
    )
  })

  it('refuses when a candidate carries no facet at all', () => {
    // Naboo is a region the harvester also filed as a character. Ranking would
    // confidently pick the mistake, so `regions` is not in the order and the
    // whole match refuses rather than losing a comparison.
    const targets = [
      record('characters', 1, 'Naboo', 'zero-company', CHARACTER),
      record('regions', 2, 'Naboo', 'zero-company'),
    ]
    expect(run('the fields of Naboo', targets, { game: 'zero-company' })).toBe('the fields of Naboo')
  })

  it('refuses when two candidates tie at the same rank', () => {
    const targets = [
      record('characters', 1, 'Vicho', 'dawnwalker', CHARACTER),
      record('characters', 2, 'Vicho', 'dawnwalker', CHARACTER),
    ]
    expect(run('Vicho waits', targets, { game: 'dawnwalker' })).toBe('Vicho waits')
  })

  it('never ranks a person against a record', () => {
    // A facet order is about one game's own filings. A person who shares a
    // name with a character is two subjects, and no ranking applies.
    const targets = [
      person(1, 'Bakir'),
      record('characters', 2, 'Bakir', 'dawnwalker', CHARACTER),
    ]
    expect(run('Bakir holds the southwest', targets, { game: 'dawnwalker' })).toBe(
      'Bakir holds the southwest',
    )
  })

  it('is not ambiguous when the two records are on different wikis', () => {
    const targets = [
      record('characters', 1, 'Nathan Gray', 'gears'),
      record('characters', 2, 'Nathan Gray', 'dawnwalker'),
    ]
    expect(run('Nathan Gray is here.', targets, { game: 'gears' })).toBe('[Nathan Gray] is here.')
  })

  it('does not link a fragment of an ambiguous name', () => {
    const targets = [
      record('factions', 1, 'The Hiss', 'control'),
      record('enemies', 2, 'The Hiss', 'control'),
      record('regions', 3, 'Hiss', 'control'),
    ]
    expect(run('driven back by The Hiss today', targets, { game: 'control' })).toBe(
      'driven back by The Hiss today',
    )
  })

  it('carries the target through so the caller can pick an element', () => {
    const targets = [person(3, 'Sam Lake')]
    const matcher = buildMatcher(targets)
    const segments = matchText('Sam Lake wrote it.', matcher, { seen: new Set() })
    expect(segments[0]!.target?.key).toBe('people:3')
    expect(segments[0]!.target?.external).toBe(true)
  })

  it('leaves text alone when the index is empty', () => {
    expect(run('Nothing to link here.', [])).toBe('Nothing to link here.')
  })

  it('reports what it refused, so the losses can be read', () => {
    const { refusals } = buildMatcher([person(1, 'Gust'), person(2, 'Ancient')])
    expect(refusals.map((entry) => entry.name).sort()).toEqual(['Ancient', 'Gust'])
  })
})

describe('insideProtectedNode', () => {
  /** Outermost first: `chain('link', 'paragraph')` is a paragraph inside a link. */
  const chain = (...types: string[]): NodeWithParent | undefined =>
    types.reduce<NodeWithParent | undefined>((parent, type) => ({ type, parent }), undefined)

  it('refuses a link inside a link, however deep', () => {
    // A text node inside a bold span inside a link is two hops from the anchor,
    // and an anchor nested in an anchor does not throw — the browser un-nests
    // it and the destination becomes wherever the reader happened to click.
    expect(insideProtectedNode(chain('link', 'paragraph'))).toBe(true)
    expect(insideProtectedNode(chain('paragraph', 'autolink'))).toBe(true)
  })

  it('refuses a heading and a code block', () => {
    expect(insideProtectedNode(chain('heading'))).toBe(true)
    expect(insideProtectedNode(chain('code'))).toBe(true)
  })

  it('allows ordinary prose', () => {
    expect(insideProtectedNode(chain('paragraph', 'root'))).toBe(false)
    expect(insideProtectedNode(chain('listitem', 'list', 'root'))).toBe(false)
    expect(insideProtectedNode(undefined)).toBe(false)
  })
})
