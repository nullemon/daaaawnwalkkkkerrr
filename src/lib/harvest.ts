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
  /*
    Studios and one cancelled project, filed as places and people by the
    category sweep. Each has - or should have - a record on the companies host,
    which is where a studio belongs; `check:kind` reports them mechanically
    because it can compare against that host, and they are listed here so the
    importer refuses them in the first place rather than writing them and
    waiting to be told.

    Not a rule on "Entertainment" or "Games" in a title: that is the shape that
    deleted Antar 4, and "Grand Army of the Republic companies" is a military
    unit in a game called Zero Company.
  */
  'Electronic Arts',
  'Lucasfilm Games',
  'Respawn Entertainment',
  'Bit Reactor',
  'The Coalition',
  'Remedy Entertainment',
  'Star Wars video games',
  'Untitled Electronic Arts first-person shooter game',

  /*
    Organisations, moved to `factions`.

    Each of these has a real article on its own wiki and arrived here filed as
    a character, an enemy, a system or a quest - the Federal Bureau of Control
    as a *character*, the InterGalactic Banking Clan as a *mechanic*, Project
    War-Mantle as a *quest*. `pnpm seed:factions` writes each of them as the
    organisation it is, from that same page, and leaving the entity copy in
    place means two pages about one thing competing with each other in search:
    the same cannibalisation the section-index titles caused when eight wikis
    shared one `<title>`.

    The faction record is the destination, so it keeps the source URL and the
    infobox; this list only stops the *entity* copy being written again, and
    `pnpm seed:prune-entities` removes the ones already there. Same
    relationship the studios above have with the companies host.

    All thirty-five were read one at a time before being listed, and the check
    was whether the wiki's own page says "body" rather than whether the name
    sounds like one: an organisation category, or governance in its own
    infobox - a head of state, a commander, a founding, a headquarters.

    **The Hiss is deliberately not here.** It is named as an affiliation on
    Control character infoboxes and it has a faction record for that reason,
    but its own page carries no organisation category and no governance at all
    - it is categorised Enemies, and it is the thing you fight for the length
    of the game. Deleting the enemy page for a game's principal enemy because
    something cited it as an allegiance is the Antar 4 failure, and it was the
    one page out of thirty-six where the check earned its keep.

    Locust Horde is here and is the close call in the other direction: its
    categories are Creatures throughout, but it also carries Government and
    Organizations and its infobox is a government one - head of state,
    commander, capital, constitution, dissolved. The polity is what the page
    is about; the creatures have their own pages.
  */
  'Federal Bureau of Control',
  'Coalition of Ordered Governments',
  'Coalition of Ordered Governments Army',
  'Coalition of Ordered Governments Air Corps',
  'Locust Horde',
  'Union of Independent Republics',
  'The Order',
  '100th Clone Company',
  'Clone Underground',
  'Confederacy of Independent Systems',
  'Executive Separatist Council',
  'Galactic Empire',
  'Galactic Republic',
  'Galactic Senate',
  'Hutt Clan',
  'Imperial Ruling Council',
  'Imperial Security Bureau',
  'Infinite Coil',
  'Inquisitorius',
  'InterGalactic Banking Clan',
  "Ivor's platoon",
  'Jedi High Council',
  'Jedi Order',
  'Project War-Mantle',
  'Pyke Syndicate',
  'Republic Futures Program',
  'Republic Intelligence',
  'Republic Military',
  'Separatist Intelligence',
  'Sith',
  'Stillwatch Battalion',
  'Tarran Assembly',
  'Techno Union',
  'Trade Federation',
  'Zero Company',

  /*
    Abstractions, filed as characters and enemies by the category sweep.

    None of these is a person, a creature or a thing that can be fought, and
    each was rendering as one: "Order 66, a character in Star Wars Zero
    Company", "Thrashball, a character in Gears of War: E-Day". Every one had a
    real source URL, because the page it came from is real - it is only the
    *kind* of thing that is wrong, which is the whole Gears-of-War-film shape
    one collection along.

    They are here rather than in a rule because there is nothing in a title or
    a URL that separates an abstraction from a creature, and the two attempts
    at a rule on this repository's record both went the wrong way: one flagged
    `b1-series-battle-droid` for containing "series", one deleted Antar 4 for
    ending in a digit. Each was read one at a time, and what was read was the
    wiki's own categories, quoted here so the next person can check the
    judgement rather than trust it:

      Order 66              Commands; Contingency Orders for the Grand Army of
                            the Republic; Galactic Republic codes. A military
                            order, and the event of its execution.
      Meditation            Jedi ceremonies. A practice.
      Darth                 Sith ranks. A title somebody holds.
      Dark Lord of the Sith Sith ranks. The same.
      Thrashball            Sports; Human Culture. A sport.
      Costumes              An index of cosmetic outfits across five Onimusha
                            games. Its only categories are the game names.

    The events are deliberately *not* here: `isAnEvent` below reads the wiki's
    own conflict infobox and decides them mechanically, which is better than a
    list because it catches the next one without anybody opening a URL.
  */
  'Order 66',
  'Meditation',
  'Darth',
  'Dark Lord of the Sith',
  'Thrashball',
  'Costumes',

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

  /*
    Twenty-five living people the category sweep filed as characters, and one
    as a *place*: `/regions/gordy-haab` on the Star Wars wiki read "Gordy Haab,
    a location in Zero Company" — a composer, described to a reader as a
    location.

    `isARealPerson` below is supposed to catch these and under-catches for two
    one-line reasons. Its category test is anchored on `^(the )?real[- ]world$`
    and Wookieepedia's category is "Real-world people"; its infobox test wants
    an actor occupation *and* a `portrayed` field, and Remedy's cast infoboxes
    give `occupation: Actor` with no `portrayed` at all. Widening either is a
    one-character change that would take twenty-five records with it, and
    "Cast" is what one wiki calls its actors and could be what another calls
    its dramatis personae — the shape that deleted Antar 4.

    So the rule stays as it is and these are listed, which is what this list is
    for. Each was read against its own categories first; every one carries
    "Real-world people", a "voice actors" category, "Actors who have portrayed
    <character>", or an explicit `occupation: Actor`/`Actress`. None is a
    judgement call, which is exactly why they can be named rather than matched.

    Where they belong is the people host, and three of them are already there
    with profiles — Courtney Hope, James McCaffrey and Matthew Porretta each
    existed twice, once as themselves and once as a fictional character of the
    game they acted in. `check:kind` keeps printing anything this list has not
    reached, so the next leak is visible rather than silent.
  */
  'Gordy Haab',
  'Aaron Contreras',
  'Alex Damon',
  'Alexander Freed',
  'Courtney Hope',
  'Darren Bailey',
  'David Acord',
  'D.C. Douglas',
  'Dee Bradley Baker',
  'Elizabeth Grullón',
  'Erica Luttrell',
  'Hunter Smith',
  'James McCaffrey',
  'Jason Spisak',
  'JB Blanc',
  'Jonathan Freeman',
  'Judy Alice Lee',
  'Lane Compton',
  'Leo Howard',
  'Martin Keßler',
  'Matt Lanter',
  'Matthew Porretta',
  'Nicole Rainteau',
  'Rekha Sharma',
  'Vic Michaelis',
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
 * An event, filed as an enemy.
 *
 * "Emergence Day" was in `enemies` on the Gears of War wiki, so the autolinker
 * — correctly, given where the record was — turned every mention of the phrase
 * into a link to `/enemies/emergence-day`, a page describing the day the
 * Locust invaded as a thing you fight. `Second Battle of Jannermont` was there
 * too, and `Bombing of the Jedi Temple hangar` was in `characters` on the Star
 * Wars wiki. Each had a real source URL, each rendered perfectly, and
 * `pnpm verify` and the build were green: the research was sound and only the
 * kind of thing was wrong. The Gears film in `regions`, one collection along.
 *
 * ## Why this reads the infobox and not the categories
 *
 * `isNotAPlace` above asks the wiki's categories, and that works for a place
 * because a place category and an event category are different words. It does
 * not transfer: `HAPPENING_CATEGORY` is anchored on its head noun, and
 * "Creatures in Gears of **War**" is a creature category ending in an event
 * word. Every Gears drone, boomer and wretch matches it. A rule built on that
 * would have deleted the bestiary of the wiki it was written for, which is the
 * Antar 4 failure at scale.
 *
 * What is decisive instead is the *conflict template*. A wiki that has a page
 * about a battle fills in a box with `conflict`, `side1`, `side2`,
 * `commanders1`, `forces1`, `casual1` — the wiki's own structured claim about
 * what kind of page it is, not a guess about its name. Across all 1,027
 * harvested entities on the seven wikis this matches 33 pages and every one of
 * them is an event: 26 already in `quests`, 4 already caught in `regions`, and
 * exactly the 3 above. No creature and no person carries one field of it.
 *
 * Two fields are required rather than one. `outcome` and `participants` are
 * the only two loose enough to turn up elsewhere some day, and needing a pair
 * costs nothing on the real corpus — the thinnest genuine event here has two.
 *
 * ## It does not say "delete"
 *
 * The same rule `isNotAPlace` follows, and for a stronger reason: 26 of the 33
 * are in `quests`, where a battle is the mission the game makes of it and the
 * filing is right. This says the page is an event. Whether that makes the
 * record wrong depends on which collection is asking, and that is the caller's
 * decision — `enemies` and `characters` are the two where it cannot be right.
 */
const CONFLICT_FIELDS =
  /^(conflict|side[_]?[123ab]|commanders?[123]|forces[123]|casual[123]|unit[123]|ppl[12]|keyparties|participants|outcome|event_date|event_location)$/i

export const isAnEvent = (entity: HarvestedEntity): boolean =>
  Object.keys(entity.facts ?? {}).filter((key) => CONFLICT_FIELDS.test(key.trim())).length >= 2

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
  if (isListPage(entity.title)) return true
  if (isAnotherWorkInTheSeries(entity.title, game)) return true
  return isNumberedSequel(entity.title, game)
}

/**
 * A page that indexes things, filed as one of the things.
 *
 * The GTA wiki filed `Cheats in GTA Vice City`, `Missions in GTA Online`,
 * `Protagonists in GTA London` and `Characters in GTA VI` as **locations in
 * GTA 6** — each with a real source URL and a composed summary reading
 * "Cheats in GTA Vice City, a location in GTA 6". Every check passed: the
 * rows exist, they carry a game, the pages render.
 *
 * These are the wiki's own index pages. `Cheats in X` is not a place, a
 * character or an item in any game; it is a list *about* a game. The shape is
 * always the same — a plural noun, the word "in", and a title — which is what
 * this matches, and it matches on the leading noun rather than on "in"
 * anywhere in a title, so `Battle in the Ashtray Maze` is untouched.
 *
 * The nouns are a reviewed list rather than "any plural", because "Weapons of
 * the Locust" and "Bosses of Kyoto" are perfectly good record titles and a
 * rule broad enough to catch the index pages would take those too — the
 * Antar 4 mistake, which this file already carries one scar from.
 */
const LIST_PAGE =
  /^(cheats|missions|characters|protagonists|weapons|vehicles|collectibles|achievements|trophies|radio stations|soundtrack|locations|gangs|businesses|properties|side missions|random events|easter eggs|glitches|beta content|cut content)\s+in\s+/i

export const isListPage = (title: string): boolean => LIST_PAGE.test(title.trim())

/**
 * A different game in the same series, filed as a thing inside this one.
 *
 * `Grand Theft Auto: Vice City`, `Grand Theft Auto: Liberty City Stories` and
 * `Grand Theft Auto: The Trilogy - The Definitive Edition` all arrived as
 * *regions in GTA 6*. `isNumberedSequel` does not catch them because none of
 * them ends in a digit: the discriminator is a subtitle after the franchise
 * name, not a number.
 *
 * Matched on the franchise name the caller passes, so it can only ever reject
 * a title that opens with the name of the game being harvested — and only
 * when something follows it. `Vice City` on its own stays, because a place can
 * share a name with the game it is in and on this wiki it does.
 *
 * The franchise stem is the game's name up to its first colon or numeral, so
 * "Grand Theft Auto VI" yields "Grand Theft Auto" and "Resident Evil Requiem"
 * yields "Resident Evil" — which is what makes this reject the sibling games
 * rather than the game itself.
 */
export const isAnotherWorkInTheSeries = (title: string, game: string): boolean => {
  const stem = game
    .split(/[:\u2013\u2014]|\s+(?:[IVXLC]+|\d+)\b/)[0]
    .trim()
  if (stem.length < 4) return false

  const name = title.trim()
  if (!name.toLowerCase().startsWith(stem.toLowerCase())) return false

  const rest = name.slice(stem.length).trim()
  /*
    Nothing after the stem is the game itself, or a place named for it.
    A colon, a dash or a numeral after it is a different release.
  */
  if (rest === '') return false
  return /^[:\u2013\u2014-]|^\b([IVXLC]+|\d+)\b/.test(rest)
}

/**
 * Words that start with a vowel letter but a consonant sound, and the reverse.
 *
 * Kept as a short reviewed list rather than a cleverer rule, for the same
 * reason `REVIEWED_NOT_ENTITIES` is a list: English spelling does not predict
 * English sound, and a rule that tried to would be wrong on a different set of
 * words with nothing to show which. These are the ones that actually turn up in
 * an occupation or a creature type on a game wiki.
 */
const SOUNDS_CONSONANT =
  /^(?:unit|uniq|unif|unic|univers|usab|usag|used|usef|user|usu|util|utop|euro|eulog|eupho|once|one\b|one-)/i
const SOUNDS_VOWEL = /^(?:hour|honest|honou?r|heir)/i

/**
 * "a" or "an" for a word read off a wiki infobox.
 *
 * The summaries these compose are stored on the record, so a wrong article is
 * not a render bug somebody fixes in a deploy — it is baked into the `summary`
 * column of every row the pass wrote, in the meta description, and in the
 * search index, and it takes a re-seed to repair. `a engineer` and `a assassin`
 * shipped that way on live pages.
 *
 * A value that is empty or does not start with a letter gets "a", because the
 * caller is about to print something odd either way and guessing "an" in front
 * of it does not help.
 */
export const indefiniteArticle = (word: string): 'a' | 'an' => {
  const first = word.trim()
  if (!first) return 'a'
  if (SOUNDS_VOWEL.test(first)) return 'an'
  if (SOUNDS_CONSONANT.test(first)) return 'a'
  return /^[aeiou]/i.test(first) ? 'an' : 'a'
}
