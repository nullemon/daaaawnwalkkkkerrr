import { describe, expect, it } from 'vitest'
import {
  indefiniteArticle,
  isAnEvent,
  isAnotherWorkInTheSeries,
  isListPage,
  isNotAnEntity,
  isNotAPlace,
} from './harvest'

const entity = (title: string, url = '') => ({ title, url })

describe('rejecting works about the game', () => {
  /* Every one of these was live, filed as a Region. */
  const REAL_CASES = [
    'https://gearsofwar.fandom.com/wiki/Gears_of_War_(film)',
    'https://gearsofwar.fandom.com/wiki/Gears_of_War_(TV_Series)',
    'https://gearsofwar.fandom.com/wiki/Gears_of_War_(franchise)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(pachislot)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(mobile_game)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(video_game)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(franchise)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_2_(2024_video_game)',
    'https://silenthill.fandom.com/wiki/Silent_Hill_(upcoming_video_game)',
  ]

  for (const url of REAL_CASES) {
    it(`rejects ${url.split('/wiki/')[1]}`, () => {
      expect(isNotAnEntity(entity('Silent Hill', url))).toBe(true)
    })
  }

  it('rejects a numbered sequel to the game being harvested', () => {
    expect(isNotAnEntity(entity('Silent Hill 2'), 'Silent Hill: Townfall')).toBe(true)
    expect(isNotAnEntity(entity('Gears of War 3'), 'Gears of War: E-Day')).toBe(true)
    expect(isNotAnEntity(entity('Silent Hill: Mobile 2'), 'Silent Hill: Townfall')).toBe(true)
  })

  /*
   * The first version of the rule rejected any Title Case name ending in a
   * digit, and deleted Antar 4 - a real moon - from the Star Wars wiki on its
   * first run. Numbered names are ordinary in science fiction; only a number
   * after the game's own name means a sequel.
   */
  it('keeps a numbered place that is not the game with a number after it', () => {
    expect(isNotAnEntity(entity('Antar 4'), 'STAR WARS Zero Company')).toBe(false)
    expect(isNotAnEntity(entity('Sector 7'), 'Gears of War: E-Day')).toBe(false)
    expect(isNotAnEntity(entity('Delta Squad 2'), 'Gears of War: E-Day')).toBe(false)
  })

  it('does not reject a numbered title when no game is given', () => {
    expect(isNotAnEntity(entity('Silent Hill 2'))).toBe(false)
  })

  it('reads a percent-encoded url', () => {
    expect(
      isNotAnEntity(entity('Kyoto', 'https://x.fandom.com/wiki/Thing_%28film%29')),
    ).toBe(true)
  })

  it('survives a malformed escape rather than throwing', () => {
    expect(() => isNotAnEntity(entity('Thing', 'https://x/%E0%A4%A'))).not.toThrow()
  })
})

describe('keeping the things that are actually in the game', () => {
  const KEEP: [string, string][] = [
    ['Kyoto', 'https://onimusha.fandom.com/wiki/Kyoto_(Onimusha%3A_Way_of_the_Sword)'],
    ['Marcus Fenix', 'https://gearsofwar.fandom.com/wiki/Marcus_Fenix'],
    ['Lancer', 'https://gearsofwar.fandom.com/wiki/Lancer'],
    ['Ephyra', 'https://gearsofwar.fandom.com/wiki/Ephyra'],
    ['Locust Drone', 'https://gearsofwar.fandom.com/wiki/Locust_Drone'],
    ['Brookhaven Hospital', 'https://silenthill.fandom.com/wiki/Brookhaven_Hospital'],
  ]

  for (const [title, url] of KEEP) {
    it(`keeps ${title}`, () => {
      expect(isNotAnEntity(entity(title, url))).toBe(false)
    })
  }

  /*
   * The narrowness matters: a place can share the game's name, and rejecting
   * on the name alone would throw away the town the game is set in.
   */
  it('keeps a location that shares the game’s name', () => {
    expect(
      isNotAnEntity(entity('Silent Hill', 'https://silenthill.fandom.com/wiki/Silent_Hill_(town)')),
    ).toBe(false)
  })
})

describe('the hand-reviewed list', () => {
  it('rejects a novel whose title gives nothing away', () => {
    expect(isNotAnEntity(entity('Gears of War: Anvil Gate'), 'Gears of War: E-Day')).toBe(true)
    expect(isNotAnEntity(entity("Gears of War: Jacinto's Remnant"), 'Gears of War: E-Day')).toBe(true)
  })

  it('rejects a soundtrack, a game mode and a genre', () => {
    expect(isNotAnEntity(entity('Gears of War 3 Soundtrack'), 'Gears of War: E-Day')).toBe(true)
    expect(isNotAnEntity(entity('Team Deathmatch'), 'Gears of War: E-Day')).toBe(true)
    expect(isNotAnEntity(entity('Horror Adventure'), 'Silent Hill: Townfall')).toBe(true)
  })

  it('is case-insensitive and tolerant of stray spacing', () => {
    expect(isNotAnEntity(entity('  books  '), 'Gears of War: E-Day')).toBe(true)
  })

  /* The places on the same wikis, which must survive all of it. */
  it('keeps the real places it sits next to', () => {
    for (const place of ['Autrin', 'Jannermont', 'Kaia', 'Kalona', 'Nordesca', 'Oria Stadium', 'Sera', 'South Islands', 'The Armored Prayer Bar']) {
      expect(isNotAnEntity(entity(place), 'Gears of War: E-Day'), place).toBe(false)
    }
    expect(isNotAnEntity(entity('Silent Hill, Maine'), 'Silent Hill: Townfall')).toBe(false)
  })
})

describe('real people on a fiction wiki', () => {
  /*
    Three actors were live as characters on the Silent Hill wiki, each with a
    composed summary calling them a character in the game. `pnpm verify`
    passed, the build was green and the pages rendered — the research was
    sound and only the kind of thing was wrong, which is the same failure the
    Gears of War film taught this file.
  */
  it('rejects a page the wiki files under its own real-world category', () => {
    expect(
      isNotAnEntity({
        title: 'Terry O’Quinn',
        categories: ['Actors', 'Staff', 'The Real World'],
      }),
    ).toBe(true)
  })

  it('rejects a performer whose infobox names who they portrayed', () => {
    expect(
      isNotAnEntity({
        title: 'Kezia Burrows',
        facts: { occupation: 'Actress', portrayed: 'Zoe Ellis' },
      }),
    ).toBe(true)
  })

  it('keeps a character who happens to be an actor in the fiction', () => {
    // An in-world performer is still a character. The occupation alone must
    // not be enough, or a wiki's own theatre troupe disappears.
    expect(
      isNotAnEntity({
        title: 'Priscilla the Player',
        categories: ['Characters'],
        facts: { occupation: 'Actress' },
      }),
    ).toBe(false)
  })

  it('keeps an ordinary character with neither signal', () => {
    expect(isNotAnEntity({ title: 'Jesse Faden', categories: ['Characters'] })).toBe(false)
  })
})

describe('events filed as places', () => {
  /*
    Five of Control's twenty harvested "regions" are events. Each rendered as
    "<name>, a location in Control Resonant" and nothing was looking - it only
    surfaced once regions gained a parent field and the Hiss invasion became a
    place inside the Oldest House.
  */
  it('rejects a page the wiki files only under a kind of happening', () => {
    expect(
      isNotAPlace({
        title: 'Hiss invasion',
        categories: ['Altered World Events', 'Conflicts', 'Events', 'Hiss'],
      }),
    ).toBe(true)
    expect(
      isNotAPlace({ title: 'Altered World Event', categories: ['Altered World Events', 'Paranatural phenomena'] }),
    ).toBe(true)
  })

  it('keeps a place where an event happened', () => {
    // "Ordinary" is a town and "Ordinary AWE" is the event in it. One signal
    // alone takes the town with it, which is the shape that deleted Antar 4.
    expect(
      isNotAPlace({ title: 'Ordinary', categories: ['AWE locations', 'Article stubs', 'Locations'] }),
    ).toBe(false)
    expect(isNotAPlace({ title: 'Ordinary AWE', categories: ['Altered World Events'] })).toBe(true)
  })

  it('keeps a place whose categories say nothing either way', () => {
    expect(isNotAPlace({ title: 'Research Sector', categories: ['Needs attention'] })).toBe(false)
    expect(isNotAPlace({ title: 'New York City', categories: [] })).toBe(false)
    expect(isNotAPlace({ title: 'Nowhere' })).toBe(false)
  })
})

describe('the article in front of a harvested word', () => {
  /*
    These sentences are stored, not rendered — they go into `summary`, and from
    there into the meta description, the search index and the JSON-LD. "a
    engineer" and "a assassin" were live on real pages because the article was
    a literal.
  */
  it('uses "an" before a vowel sound', () => {
    for (const word of ['engineer', 'assassin', 'archer', 'officer', 'elite', 'item', 'axe']) {
      expect(indefiniteArticle(word)).toBe('an')
    }
  })

  it('uses "a" before a consonant sound', () => {
    for (const word of ['knight', 'sword', 'ronin', 'boss', 'weapon']) {
      expect(indefiniteArticle(word)).toBe('a')
    }
  })

  it('goes by sound rather than by first letter', () => {
    // The whole reason this is a reviewed list and not `/^[aeiou]/`.
    expect(indefiniteArticle('unique weapon')).toBe('a')
    expect(indefiniteArticle('unit')).toBe('a')
    expect(indefiniteArticle('European noble')).toBe('a')
    expect(indefiniteArticle('one-handed sword')).toBe('a')
    expect(indefiniteArticle('hour-long ritual')).toBe('an')
    expect(indefiniteArticle('heir')).toBe('an')
  })

  it('does not take "un-" for "uni-"', () => {
    // "undead" and "unknown" are ordinary vowel sounds; only the "yoo" words
    // are the exception, and an over-broad prefix would have taken both.
    expect(indefiniteArticle('undead')).toBe('an')
    expect(indefiniteArticle('unknown creature')).toBe('an')
  })

  it('falls back to "a" on something it cannot read', () => {
    expect(indefiniteArticle('')).toBe('a')
    expect(indefiniteArticle('   ')).toBe('a')
  })
})

/**
 * An event, told apart from the creature that fought in it.
 *
 * Both directions are pinned, because a filter written to stop bad records is
 * still a filter and this repository has twice shipped one that was
 * over-broad. The first attempt at this rule read the wiki's categories, and
 * "Creatures in Gears of **War**" is a creature category ending in an event
 * word — it matched every drone, boomer and wretch on the bestiary it was
 * written to protect.
 *
 * So the evidence is the wiki's own conflict template, and the cases below are
 * the real infoboxes: `Emergence Day` and `Second Battle of Jannermont` were
 * live in `enemies`, `Bombing of the Jedi Temple hangar` in `characters`, and
 * `Drone`, `Brumak` and `Quake` are records that are filed correctly and must
 * survive.
 */
describe('isAnEvent', () => {
  it('finds the three that were live in the wrong collection', () => {
    // Gears of War: E-Day, `enemies/emergence-day` — the autolinker pointed
    // every mention of the phrase at a page about a day you fight.
    expect(
      isAnEvent({
        title: 'Emergence Day',
        facts: {
          next: 'Emergence in Jannermont',
          conflict: 'Locust War',
          date: 'Bounty 0 A.E.',
          place: 'Every major city on Sera',
          result: 'Major Locust Strategic Victory',
          side1: 'COG UIR',
          side2: 'Locust Horde',
          commanders1: 'Council of Sovereigns',
        },
      }),
    ).toBe(true)

    expect(
      isAnEvent({
        title: 'Second Battle of Jannermont',
        facts: { conflict: 'Locust War', side1: 'COG', side2: 'Locust Horde', casual1: 'None' },
      }),
    ).toBe(true)

    // Star Wars Zero Company, `characters`. The thinnest genuine event in the
    // whole harvest: two fields, which is why two is the threshold.
    expect(
      isAnEvent({
        title: 'Bombing of the Jedi Temple hangar',
        facts: {
          date: '19 BBY',
          place: 'Jedi Temple, Coruscant',
          outcome: '6 Jedi killed',
          participants: 'Jackar Bowmani, Letta Turmond',
        },
      }),
    ).toBe(true)
  })

  it('leaves a creature alone, however many wars its categories name', () => {
    /*
      The other direction, and the one that matters. Every Gears creature sits
      in "Creatures in Gears of War" and carries a `date`, a `place` or a
      `weapons` field; none of them carries a conflict template.
    */
    expect(
      isAnEvent({
        title: 'Drone',
        categories: ['Creatures in Gears of War', 'Locust Horde', 'Locust Soldier'],
        facts: { affiliation: 'Locust Horde', weapons: 'Hammerburst', species: 'Locust' },
      }),
    ).toBe(false)

    // Imulsion is the close call: the wiki gives it a creature infobox with a
    // birth and a death on it, which is dates without a conflict.
    expect(
      isAnEvent({
        title: 'Imulsion',
        facts: {
          homeland: 'Hollow, Sera',
          species: 'Parasitic Fungi',
          birth: 'Prehistory',
          death: 'Bloom 17 A.E.',
          weapons: 'Limitless reproduction',
        },
      }),
    ).toBe(false)

    // A clone trooper, whose infobox names an army and a war and is a person.
    expect(
      isAnEvent({
        title: 'Quake',
        categories: ['Clone troopers', 'Canon articles'],
        facts: {
          homeworld: 'Kamino',
          species: 'Human',
          donor: 'Jango Fett',
          affiliation: 'Galactic Republic, Grand Army of the Republic',
        },
      }),
    ).toBe(false)
  })

  it('needs two fields, so one loose key is not enough', () => {
    /*
      `outcome` and `participants` are the only two of the set loose enough to
      turn up on something that is not a battle. One of them says nothing.
    */
    expect(isAnEvent({ title: 'Something', facts: { outcome: 'Victory' } })).toBe(false)
    expect(isAnEvent({ title: 'Something', facts: { participants: 'Two people' } })).toBe(false)
  })

  it('says nothing about a record with no harvested infobox', () => {
    // A hand-written record, or one whose harvest file is missing. No infobox
    // is no evidence, not evidence of absence.
    expect(isAnEvent({ title: 'Xanthe' })).toBe(false)
    expect(isAnEvent({ title: 'Xanthe', facts: {} })).toBe(false)
    expect(isAnEvent({ title: 'Xanthe', facts: null })).toBe(false)
  })
})

describe('the abstractions on the reviewed list', () => {
  /*
    Read one at a time against the wiki's own categories, and listed rather
    than matched because nothing in a title separates an abstraction from a
    creature. Each was rendering as a character or an enemy.
  */
  it('rejects the ones that were live', () => {
    for (const title of [
      'Order 66',
      'Meditation',
      'Darth',
      'Dark Lord of the Sith',
      'Thrashball',
      'Costumes',
    ]) {
      expect(isNotAnEntity({ title }), title).toBe(true)
    }
  })

  it('still keeps the records next to them on the same wikis', () => {
    // The other direction. Every one of these is a real thing in its game and
    // shares a wiki, a category or a word with something on the list above.
    for (const title of [
      'Darth Sidious',
      'Sith Lord',
      'Padawan',
      'Thrashball Field',
      'Costume Guard',
      'Order of the Silver Rose',
      'Meditation Chamber',
    ]) {
      expect(isNotAnEntity({ title }), title).toBe(false)
    }
  })
})

describe('index pages and sibling games, filed as things in the game', () => {
  /*
    All seven of these were live as "a location in GTA 6", each with a real
    source URL and a composed summary saying so. The GTA wiki has 23,013
    articles and the intersection harvest reached its index pages and its
    back catalogue; every check passed, because the rows exist, carry a game
    and render.
  */
  it('rejects the wiki own index pages', () => {
    for (const title of [
      'Cheats in GTA Vice City',
      'Cheats in GTA Liberty City Stories',
      'Missions in GTA Online',
      'Characters in GTA VI',
      'Protagonists in GTA London',
    ]) {
      expect(isListPage(title)).toBe(true)
    }
  })

  it('rejects other games in the same series', () => {
    for (const title of [
      'Grand Theft Auto: Vice City',
      'Grand Theft Auto: Liberty City Stories',
      'Grand Theft Auto: The Trilogy - The Definitive Edition',
    ]) {
      expect(isAnotherWorkInTheSeries(title, 'Grand Theft Auto VI')).toBe(true)
    }
  })

  /*
    The Antar 4 half. A filter written to stop bad records throws away good
    ones just as silently, so both directions are pinned.
  */
  it('keeps a place that shares its name with the game', () => {
    expect(isAnotherWorkInTheSeries('Vice City', 'Grand Theft Auto VI')).toBe(false)
    expect(isListPage('Vice City')).toBe(false)
  })

  it('keeps ordinary records whose titles contain "in" or a series word', () => {
    for (const title of ['Battle in the Ashtray Maze', 'Weapons of the Locust', 'Bone County']) {
      expect(isListPage(title)).toBe(false)
      expect(isAnotherWorkInTheSeries(title, 'Grand Theft Auto VI')).toBe(false)
    }
  })

  it('needs a real franchise stem, so a short game name rejects nothing', () => {
    expect(isAnotherWorkInTheSeries('Control Resonant', 'Control')).toBe(false)
  })
})
