/**
 * What a community wiki offers that is not a thing inside the game.
 *
 * A franchise wiki carries the films, the novels, the pachislot machine and
 * every game in the series alongside the locations and characters. The
 * harvester already takes only categories that name the specific game, which
 * keeps most of that out — but a page called "Gears of War (film)" sits in the
 * Gears of War category, and arrived in `regions` as a Region. The composed
 * summary then read "Gears of War, a location in Gears E-Day": a sentence no
 * source says, about a thing that is not a place, on a page a reader would
 * take at face value.
 *
 * Thirteen of them were live before anyone opened one — five "Silent Hill"
 * regions on the Townfall wiki, one of them a slot machine. Nothing errored,
 * `pnpm verify` passed, and every one had a real source URL, because the page
 * it came from is real. It is only the *kind* of thing that is wrong, and no
 * check the project had was looking at kind.
 *
 * The tell is the disambiguator the wiki itself puts in the URL, and a title
 * that is only the name of a work.
 *
 * Deliberately narrow, because a real location can share the game's name —
 * Silent Hill the town is a place in Silent Hill. So this rejects on the
 * wiki's own parenthetical rather than on the name, and on a numbered title
 * only when the name before the number is the game's own. The first version
 * rejected any Title Case name ending in a digit and deleted Antar 4, a moon
 * on the Star Wars wiki, which is the same over-broad reading it was written
 * to prevent.
 *
 * Kept free of Payload types so it can be unit-tested without a database.
 */

const WORK_DISAMBIGUATOR =
  /\((film|movie|tv[ _]series|series|franchise|pachislot|pachinko|mobile[ _]game|arcade[ _]game|video[ _]game|novel|book|comic|manga|soundtrack|album|song|board[ _]game|card[ _]game|anime|toy|magazine|upcoming[ _]video[ _]game|\d{4}[ _]video[ _]game)\)/i

export type HarvestedEntity = {
  title: string
  url?: string | null
  wikiTitle?: string | null
}

/** Letters only, lowercased, so "Gears of War: E-Day" meets "Gears of War 3". */
const stem = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * "Gears of War 3" is a sequel. "Antar 4" is a moon.
 *
 * The first version of this rejected any Title Case name ending in a number,
 * which read well and deleted Antar 4 from the Star Wars wiki on its first
 * run — a real place, removed by a rule written to catch sequels. Numbered
 * names are ordinary in science fiction, so the number alone says nothing.
 *
 * What says something is the rest of the title: a sequel is the *game's own
 * name* with a number after it. So the stem has to match the game before the
 * number counts against it, which is why this needs to know which game it is
 * reading for.
 */
const isNumberedSequel = (title: string, game: string): boolean => {
  const match = title.trim().match(/^(.*?)[ :]+(\d+)$/)
  if (!match) return false

  const titleStem = stem(match[1])
  if (!titleStem) return false

  /*
    Compare against the franchise, not the edition. "Silent Hill: Townfall"
    is this wiki's game, but the sequels it needs to reject are "Silent Hill
    2" and "Silent Hill: Mobile 2" - neither of which starts with the whole
    title. Everything before the colon is the part they share.
  */
  const franchise = stem(game.split(':')[0])
  if (!franchise) return false

  return titleStem.startsWith(franchise) || franchise.startsWith(titleStem)
}

/**
 * @param game the title of the game being harvested for, so a numbered name
 *   can be told apart from a numbered sequel to that game.
 */
export const isNotAnEntity = (entity: HarvestedEntity, game = ''): boolean => {
  let url = entity.url ?? ''
  try {
    url = decodeURIComponent(url)
  } catch {
    // A malformed escape is not a reason to let the record through unchecked.
  }
  if (WORK_DISAMBIGUATOR.test(url)) return true
  if (WORK_DISAMBIGUATOR.test(entity.wikiTitle ?? '')) return true
  return isNumberedSequel(entity.title, game)
}
