/**
 * One tokeniser, and one correction that every matcher on this network needs.
 *
 * ## The correction
 *
 * **The game's own name carries every comparison.** "resonance a plague tale
 * legacy how long to beat" shares four words with every article on that wiki
 * simply by naming the game, so without a discount it matched the release-date
 * page and that page was presented as the answer to a question this network
 * deliberately does not answer. Matching has to happen on the words that are
 * *not* the game's name — beat, map, endings, multiplayer — and on nothing
 * else.
 *
 * ## Why it is a module
 *
 * There were two copies of the list and the tokeniser, in `lib/asking.ts` and
 * in `seed/topic-guides.ts`, and CLAUDE.md carried a line saying a third
 * matcher would need the same correction. A note telling the next person to
 * remember something is the weakest guard there is: the failure it prevents is
 * silent in both directions, because a matcher without the discount does not
 * error, it just answers the wrong question confidently.
 *
 * So there is one list, one tokeniser and one scoring function, and the third
 * matcher — the "More guides" rail on every article — is built on them rather
 * than on a fourth copy.
 *
 * No I/O and no Payload types, so it is unit-tested directly.
 */

/**
 * Words that carry no signal when matching a question to an article.
 *
 * `game` is on it deliberately: every wiki here is about one, so the word
 * distinguishes nothing. `long`, `much` and `many` are here because "how long
 * to beat" and "how much does it cost" are question scaffolding rather than
 * subject.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'is', 'it', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'how', 'what', 'when', 'where', 'why', 'does', 'do', 'can', 'you', 'i',
  'be', 'are', 'was', 'will', 'there', 'much', 'many', 'long', 'get', 'game',
  /*
    `every` was the addition the "More guides" rail forced, and it was carrying
    real weight: a dozen generated titles open with it — "Every achievement
    in …", "Every romance in …", "Every region in …" — so it was the single
    commonest word on some wikis and it related the achievements guide to the
    romance guide on the strength of it.
  */
  'every',
])

/**
 * A plural reduced to its singular, and nothing more clever than that.
 *
 * `achievements` and `achievement` are the same subject and were two
 * unrelated tokens, which on a network whose generated titles read "Every
 * achievement in …" and "The rarest achievements …" meant the two pages most
 * about each other scored zero together.
 *
 * A trailing `s` only, and only after a consonant. English plurals land on
 * one — achievement**s**, ending**s**, quest**s**, perk**s** — while a word
 * that ends in a vowel plus `s` is usually not a plural at all: `this`,
 * `bonus`, `status`, `chaos`, `versus`. The first version of this rule was
 * "strip a trailing s" and it turned `this` into `thi`, which is the same
 * mistake in miniature that the rest of this file is about: a transform that
 * is wrong in the direction of merging two things is exactly as silent as a
 * filter that is wrong in the direction of deleting one.
 *
 * So it is deliberately short of a stemmer, and misses `-es` plurals
 * (`bosses`, `weaknesses`). Two words that should match and do not is a rail
 * with one fewer good entry. Two words that should not match and do is this
 * network saying one page answers a question it does not.
 */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

const singular = (word: string): string => {
  if (word.length <= 3 || !word.endsWith('s')) return word
  const before = word[word.length - 2]
  // `boss`, `glass`, `across`: a doubled s is never a plural marker, and `s`
  // is a consonant, so the vowel test alone would have made this `bos`.
  if (before === 's' || VOWELS.has(before)) return word
  return word.slice(0, -1)
}

/**
 * A string reduced to the words worth matching on.
 *
 * Lower-cased, punctuation dropped, stop words removed, and anything of two
 * characters or fewer dropped with them — which is what keeps "e-day" from
 * contributing a bare "e" that matches everything.
 */
export const terms = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .map(singular)

/**
 * The words that name the game, which every comparison on its wiki has to
 * discount.
 *
 * Takes the whole list rather than one string because the harvest files carry
 * several spellings of each game — the store title, the short title, what
 * people actually type — and a name is discounted whichever one is used.
 */
export const gameWords = (names: readonly string[]): ReadonlySet<string> =>
  new Set(names.flatMap((name) => terms(name)))

/**
 * How much two pieces of text have in common, once the game's name is out of
 * the way.
 *
 * The count of distinct shared terms, which is deliberately not a percentage:
 * an article with a three-word title should not out-rank a better match for
 * having fewer words to be wrong about. Zero means nothing in common and is
 * the answer a caller should treat as "no relation", never as "the weakest
 * relation".
 */
export const overlap = (
  left: Iterable<string>,
  right: Iterable<string>,
  discount: ReadonlySet<string> = new Set(),
): number => {
  const rightSet = new Set(right)
  let shared = 0
  for (const word of new Set(left)) {
    if (discount.has(word)) continue
    if (rightSet.has(word)) shared += 1
  }
  return shared
}
