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

/**
 * Pages read and judged by hand, because no pattern separates them safely.
 *
 * "Gears of War: Anvil Gate" is a novel and "Autrin" is a place, and nothing
 * in either title or URL says which. The franchise wiki files both under the
 * same category, so the harvester took both.
 *
 * A pattern was tried twice and was wrong both times: one flagged
 * `b1-series-battle-droid` - a real enemy - for containing "series", and one
 * deleted Antar 4, a real moon, for ending in a digit. Fifty-odd titles are
 * few enough to read, and a list somebody reviewed is worth more here than a
 * rule nobody can predict.
 *
 * Kept as titles rather than slugs so the importer can reject them before a
 * record exists, and the prune can find the ones already written.
 */
export const REVIEWED_NOT_ENTITIES = new Set(
  [
  'Beneath the Surface: An Inside Look at Gears of War 2',
  'Books',
  'Comic Series',
  'Stand-Alone Comic Issues',
  'The Art of Gears of War',
  'Gears 5 Soundtrack',
  'Gears of War Soundtrack',
  'Gears of War 2 Soundtrack',
  'Gears of War 3 Soundtrack',
  'Gears of War 4 Soundtrack',
  'Gears of War: Judgment Soundtrack',
  'Gears of War: A Pendulum Wars Story',
  'Gears of War: Anvil Gate',
  'Gears of War: Ascendance',
  'Gears of War: Aspho Fields',
  'Gears of War: Barren',
  'Gears of War: Bloodlines',
  'Gears of War: Book One',
  'Gears of War: Book Two',
  'Gears of War: Book Three',
  "Gears of War: Coalition's End",
  'Gears of War: Destroyed Beauty',
  'Gears of War: Dirty Little Secrets',
  'Gears of War: Ephyra Rising',
  'Gears of War: Exile',
  'Gears of War: Hivebusters',
  'Gears of War: Hollow',
  "Gears of War: Jacinto's Remnant",
  'Gears of War: Judgment',
  'Gears of War: Reloaded',
  'Gears of War: Tactics',
  'Gears of War: The Rise of RAAM',
  'Gears of War: The Slab',
  'Mad World',
  'Team Deathmatch',
  'Horror Adventure',
  'Play Novel: Silent Hill',
  'Return to Silent Hill',
  'Silent Hill 4: The Room',
  'Silent Hill HD Collection',
  'Silent Hill f',
  'Silent Hill: Ascension',
  'Silent Hill: Book of Memories',
  'Silent Hill: Downpour',
  'Silent Hill: Escape',
  'Silent Hill: Homecoming',
  'Silent Hill: Origins',
  'Silent Hill: Orphan',
  'Silent Hill: Return',
  'Silent Hill: Shattered Memories',
  'Silent Hill: The Arcade',
  'Silent Hill: The Escape',
  'Silent Hill: The Short Message',
  'Timeline',
  'Timeline of Events',
  'Phantom Blade Wiki',
  ].map((title) => title.toLowerCase()),
)

export type HarvestedEntity = {
  title: string
  url?: string | null
  wikiTitle?: string | null
  /** The wiki's own categories, where the harvest captured them. */
  categories?: string[] | null
  /** The infobox, where the harvest captured it. */
  facts?: Record<string, string> | null
}

/**
 * A page about somebody real, on a wiki about a fiction.
 *
 * Fandom wikis file their cast and crew in the same namespace as the
 * characters those people play, and the category harvest cannot tell them
 * apart: "Silent Hill Townfall People" contains both. So three actors were
 * live as *characters* on this network — Jovan Adepo, Kezia Burrows and Terry
 * O'Quinn, each with a composed summary describing them as a character in the
 * game, each with a real source URL, because the page they came from is real.
 * The same shape as the Gears of War film arriving as a region: the research
 * was sound and the *kind* of thing was wrong.
 *
 * Two signals, and both have to be decisive on their own, because a filter
 * written to catch bad records throws away good ones just as quietly — the
 * lesson Antar 4 taught this file. `The Real World` is what these wikis
 * themselves call the category for people who exist; and an infobox that gives
 * an occupation of actor *and* names who they portrayed is describing the
 * performer, not the part.
 */
const REAL_WORLD_CATEGORY = /^(the )?real[- ]world$/i
const PERFORMER_OCCUPATION = /^(actor|actress|voice actor|voice actress)$/i

const isARealPerson = (entity: HarvestedEntity): boolean => {
  if ((entity.categories ?? []).some((name) => REAL_WORLD_CATEGORY.test(name.trim()))) return true

  const facts = entity.facts ?? {}
  const occupation = facts.occupation ?? facts.Occupation ?? ''
  const portrayed = facts.portrayed ?? facts['portrayed by'] ?? ''
  return PERFORMER_OCCUPATION.test(occupation.trim()) && portrayed.trim() !== ''
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
 * An event, filed as a place.
 *
 * A wiki about a game has pages for the things that *happened* in it as well
 * as the places they happened in, and the category harvest cannot tell them
 * apart: Control's location sweep brought back the Oldest House and New York
 * City, and also the Hiss invasion, the Altered World Event, and the AWEs at
 * Ordinary, Bright Falls and Kyiv. Five of its twenty "regions" are events,
 * each rendering on the site as "<name>, a location in Control Resonant".
 *
 * It surfaced from a direction nobody was looking: once regions gained a
 * `parent` field, `Hiss invasion` became a place inside the Oldest House, and
 * a wrong edge is a great deal more visible than a wrong record.
 *
 * Both halves are required, and that is what keeps it from being a guess. The
 * wiki's own category has to name a kind of happening, *and* no category may
 * name a kind of place — because "Ordinary" carries `AWE locations` alongside
 * `Locations` and is a town where an event occurred, while "Ordinary AWE" is
 * the event. One signal alone would have taken the town with it, which is the
 * shape of the rule that deleted Antar 4.
 *
 * This is deliberately not part of `isNotAnEntity`: an event is a real thing
 * in the game and would belong in a collection this network does not have. It
 * says the record is not a *place*, and what follows from that is the caller's
 * decision.
 */
const HAPPENING_CATEGORY =
  new RegExp(String.raw`^(.*\b)?(events?|conflicts?|battles?|wars?|incidents?|disasters?|phenomena|phenomenon|massacres?|invasions?)$`, 'i')
const PLACE_CATEGORY =
  new RegExp(String.raw`\b(locations?|places?|areas?|regions?|sectors?|dimensions?|thresholds?|realms?|planets?|worlds?|cities|towns?|buildings?|rooms?)\b`, 'i')

export const isNotAPlace = (entity: HarvestedEntity): boolean => {
  const categories = (entity.categories ?? []).map((name) => name.trim()).filter(Boolean)
  if (categories.length === 0) return false

  /*
    Each category is asked what it is before it is asked anything else, and a
    category that is a happening never gets asked whether it is a place.

    The first version tested the whole list for a place word first, and
    "Altered World Events" contains "World" — so every Control event looked
    like a place and the rule caught nothing. A category name is a head noun
    with modifiers in front of it, and `HAPPENING_CATEGORY` is anchored at the
    end for exactly that reason: "Altered World **Events**" is a kind of event
    however many place words precede it, and "AWE **locations**" is a kind of
    place however clearly it names an event.
  */
  const happenings = categories.filter((name) => HAPPENING_CATEGORY.test(name))
  if (happenings.length === 0) return false

  const rest = categories.filter((name) => !HAPPENING_CATEGORY.test(name))
  return !rest.some((name) => PLACE_CATEGORY.test(name))
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
  if (REVIEWED_NOT_ENTITIES.has(entity.title.trim().toLowerCase())) return true
  if (isARealPerson(entity)) return true
  if (WORK_DISAMBIGUATOR.test(url)) return true
  if (WORK_DISAMBIGUATOR.test(entity.wikiTitle ?? '')) return true
  return isNumberedSequel(entity.title, game)
}
