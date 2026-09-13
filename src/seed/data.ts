import { rich } from './lexical'
import { cite } from './sources'

/**
 * Seed content, compiled from public sources on 13 September 2026 and written
 * as original prose. Nothing here has been verified against the game itself,
 * which is exactly why every record carries a confidence level.
 *
 * Quest time costs are deliberately left unconfirmed (`time.known: false`)
 * rather than invented. An unknown cost is not a zero cost, and the run
 * checker reports the difference.
 */

export const siteSettings = {
  siteName: 'Dawnwalker Guide',
  tagline: 'A run planner and database for The Blood of Dawnwalker',
  description:
    'Plan your 480 segments. Quests, endings, Court Activities and the mechanics behind the thirty-day clock — with every figure sourced and its confidence shown.',
  heroHeading: 'You have 480 segments. Spend them well.',
  heroSubheading:
    'Thirty days and thirty nights, eight segments each. The clock only moves when you let it. Work out what you can still reach from where you actually are.',
  primaryNav: [
    { label: 'Run checker', href: '/tools/run-checker' },
    { label: 'Quests', href: '/quests' },
    { label: 'Endings', href: '/endings' },
    { label: 'Court', href: '/court' },
    { label: 'Mechanics', href: '/mechanics' },
    { label: 'Regions', href: '/regions' },
  ],
  footerNote:
    'Unofficial fan project. The Blood of Dawnwalker is developed by Rebel Wolves and published by Bandai Namco Entertainment. No affiliation is claimed. Facts are compiled from public sources and have not been verified against the game.',
  adsEnabled: false,
}

export const regions = [
  {
    title: 'Laslea Glen',
    slug: 'laslea-glen',
    dangerRating: 'starting',
    summary:
      'The valley floor where the run begins, and where Crake’s chain opens. Gentle by Vale Sangora standards, which is not saying much.',
  },
  {
    title: 'Briar Sloughs',
    slug: 'briar-sloughs',
    dangerRating: 'moderate',
    summary:
      'Wetland west of the glen. The broken bridge here guards Durandal, the earliest legendary sword in the game.',
  },
  {
    title: 'Maragir Wealds',
    slug: 'maragir-wealds',
    dangerRating: 'moderate',
    summary: 'Deep woodland. Monster lairs and ancient circles sit well off the tracks.',
  },
  {
    title: 'Boar’s Back',
    slug: 'boars-back',
    dangerRating: 'moderate',
    summary: 'The ridge road. A crossing point between the lowlands and Svartrau, and a stop on Crake’s chain.',
  },
  {
    title: 'Svartrau Outskirts',
    slug: 'svartrau-outskirts',
    dangerRating: 'dangerous',
    summary: 'The approach to the city, patrolled hard once Infamy climbs and the Edicts start landing.',
  },
  {
    title: 'Svartrau City',
    slug: 'svartrau-city',
    dangerRating: 'dangerous',
    summary:
      'The seat of the regime, and the densest quest hub in the game. Lacra’s chain opens on its rooftops after dark.',
  },
  {
    title: 'Rockfalls',
    slug: 'rockfalls',
    dangerRating: 'dangerous',
    summary: 'Broken high ground. Vertical traversal matters here, which quietly favours a night run.',
  },
  {
    title: 'St. Tyna’s Grove',
    slug: 'st-tynas-grove',
    dangerRating: 'moderate',
    summary: 'Consecrated woodland. Shrines here interact with Corruption.',
  },
  {
    title: 'The Slits',
    slug: 'the-slits',
    dangerRating: 'late',
    summary: 'Narrow underground cuts beneath the city. Late-run territory.',
  },
  {
    title: 'Tantari Woods',
    slug: 'tantari-woods',
    dangerRating: 'late',
    summary: 'The far edge of the vale. Remote, and expensive in segments simply to work through.',
  },
].map((region) => ({
  ...region,
  confidence: 'medium' as const,
  sources: cite('fextraliteLocations', 'showgamerMap'),
  body: rich(
    `${region.title} is one of the ten regions of Vale Sangora. Region boundaries matter more here than in most open worlds, because Court Activities are filed by region and each vassal only cares about trouble caused in territory they hold.`,
    'Travel itself is free. Walking and fast travel cost no segments at all, so the expense of a region is whatever its quests charge once you commit to them — not the distance to reach it.',
  ),
}))

export const courts = [
  {
    title: 'Ambrus',
    slug: 'ambrus',
    activityCount: 14,
    summary:
      'The first vassal most runs move against. Fourteen Court Activities, and a heavy armour set that carries his name.',
  },
  {
    title: 'Bakir',
    slug: 'bakir',
    activityCount: 12,
    summary: 'The shortest of the three courts at twelve activities, which makes it the cheapest duel to unlock.',
  },
  {
    title: 'Xanthe',
    slug: 'xanthe',
    activityCount: 15,
    summary: 'The longest court at fifteen activities, and the most expensive route to a duel.',
  },
].map((court) => ({
  ...court,
  angerThresholdPct: 75,
  confidence: 'medium' as const,
  sources: cite('powerpyxCourt', 'vgcCourt', 'gamespotBosses'),
  body: rich(
    `${court.title} is one of Brencis’s three vampiric vassals. After the prologue there is no linear main quest — progression is a matter of angering all three until each challenges you to a duel, and killing the three of them is what finally draws Brencis out.`,
    { h: 'How much is enough' },
    'You do not have to clear every activity in a court. Reporting puts the threshold at roughly three quarters of a vassal’s operations before their duel unlocks, which on this court means around ' +
      `${Math.ceil(court.activityCount * 0.75)} of ${court.activityCount}. Treat that figure as unconfirmed: it is widely repeated but we have not seen it stated by the developer.`,
    'That slack is the single biggest saving available to a tight run. Clearing all 41 activities across the three courts is substantially more work than clearing enough of them.',
  ),
}))

export const characters = [
  {
    title: 'Coen',
    slug: 'coen',
    role: 'protagonist',
    romanceable: false,
    summary:
      'Half-vampire, and the reason the game has two rulesets. Human by day, dawnwalker by night, with a separate skill tree for each.',
    body: rich(
      'Coen is cursed into a split existence: a man while the sun is up, a vampire once it sets. The practical effect is that half your kit is unavailable at any given moment, and a fair number of quest steps are locked to one phase or the other.',
      'His family is taken by Brencis in the prologue, and everything after that hangs off one deadline — thirty days and thirty nights to get them back.',
    ),
  },
  {
    title: 'Brencis',
    slug: 'brencis',
    role: 'antagonist',
    romanceable: false,
    summary: 'The knyaz. He takes Coen’s family in the prologue and waits at the end of the thirty days, whatever state you arrive in.',
    body: rich(
      'Brencis holds Vale Sangora through three vassals and a body of law. Infamy is how his regime keeps score of you, and the nine Edicts are how it answers — they are concrete penalties, not set dressing.',
      'He cannot be reached directly. Killing Ambrus, Bakir and Xanthe is what draws him out, so the road to the final fight runs through the Court menu.',
    ),
  },
  {
    title: 'Lacra',
    slug: 'lacra',
    role: 'ally',
    romanceable: true,
    summary:
      'A vrakhir with her own reason to want Brencis dead. Her chain gates the Patricide ending and is one of three romances.',
    body: rich(
      'Lacra arrives in Vale Sangora already hunting Brencis, which makes her the most straightforwardly aligned ally in the game. Her chain opens with a rooftop investigation in Svartrau City and ends underground, in a throne room.',
      { h: 'Plan it as a night run' },
      'Nearly every step of her questline is locked to night, and several objectives want vampire traversal. If you are running her chain, your nights are committed and your days are the flexible half of the budget — which is the opposite of how most runs are shaped.',
      { h: 'A note on the quest list' },
      'Sources disagree on the length of this chain. Some list five quests, others describe a six-quest arc, and the fifth is named both as Midnight Reckoning and as The Night of Horrors. We have seeded five with low confidence and flagged it rather than pick a side.',
    ),
  },
  {
    title: 'Crake',
    slug: 'crake',
    role: 'ally',
    romanceable: false,
    summary:
      'The manumits’ hidden leader. The longest optional storyline in the game, and the gate on the Knyazmaker ending.',
    body: rich(
      'Crake leads the manumits. Follow his chain far enough and it opens an alternative route into the finale — you march on the castle with allies rather than walking in alone.',
      'The chain spans Laslea Glen, Briar Sloughs, Boar’s Back and Svartrau City, and each link only appears once the previous one closes. That strictly sequential shape matters for planning: you cannot parallelise it, and you cannot start it late.',
    ),
  },
  {
    title: 'Ambrus',
    slug: 'ambrus-character',
    role: 'vassal',
    romanceable: false,
    summary: 'Vassal of the first court. His cuirass is among the better heavy chest pieces in the game.',
    body: rich('One of Brencis’s three vassals. Anger him enough through Court Activities and he will meet you in a duel.'),
  },
  {
    title: 'Bakir',
    slug: 'bakir-character',
    role: 'vassal',
    romanceable: false,
    summary: 'Vassal of the second court, and the cheapest of the three to provoke at twelve activities.',
    body: rich('One of Brencis’s three vassals. His court is the shortest, which makes him the efficient first duel on a tight run.'),
  },
  {
    title: 'Xanthe',
    slug: 'xanthe-character',
    role: 'vassal',
    romanceable: false,
    summary: 'Vassal of the third and largest court, at fifteen activities.',
    body: rich('One of Brencis’s three vassals. The largest court, and therefore the most expensive duel to unlock.'),
  },
].map((character) => ({
  ...character,
  confidence: 'medium' as const,
  sources: cite('fextraliteEndings', 'allthingsLacra', 'allthingsCrake', 'gamespotBosses'),
}))

export const skillTrees = [
  {
    title: 'Swordmastery',
    slug: 'swordmastery',
    phase: 'either',
    gatedByCorruption: false,
    summary: 'The tree that works around the clock. Steel does not care whether the sun is up.',
    body: rich(
      'Swordmastery sits between the other two trees and stays available in both phases, which makes it the safe investment on a run you have not finished planning.',
      'Its ultimate, Last Stand, doubles all weapon damage at 30% health or below — a bracket you can enter deliberately.',
    ),
  },
  {
    title: 'Witchcraft',
    slug: 'witchcraft',
    phase: 'day',
    gatedByCorruption: false,
    summary: 'The daylight tree. Hexes, wards and preparation, for the half of the run you spend human.',
    body: rich(
      'Witchcraft is what Coen has while the sun is up and his vampiric kit is closed to him. It rewards setup over reaction.',
      'Its ultimate, Runic Bulwark, gives a 15% chance to apply a random Hex on a Perfect Block — which pays off in proportion to how well you block.',
    ),
  },
  {
    title: 'Vampirism',
    slug: 'vampirism',
    phase: 'night',
    gatedByCorruption: true,
    summary: 'The night tree, and the one with a price. Its abilities open as Corruption rises.',
    body: rich(
      'Vampirism is the strongest of the three and the only one gated by something other than skill points: its abilities unlock as Corruption climbs, and Corruption climbs by feeding.',
      'Its ultimate, Renounce Death, returns you to the fight once per combat with ten seconds of immortality instead of dying.',
      'The tree is therefore a running argument with the endings system rather than a pure power choice.',
    ),
  },
].map((tree) => ({
  ...tree,
  confidence: 'medium' as const,
  sources: cite('game8Skills', 'game8Perks'),
}))

export const perks = [
  {
    title: 'Last Stand',
    slug: 'last-stand',
    tree: 'swordmastery',
    effect: 'Doubles all weapon damage while at 30% health or below.',
    summary: 'Swordmastery ultimate. Doubles weapon damage in the bottom third of your health bar.',
  },
  {
    title: 'Runic Bulwark',
    slug: 'runic-bulwark',
    tree: 'witchcraft',
    effect: '15% chance to apply a random Hex to an opponent on a Perfect Block.',
    summary: 'Witchcraft ultimate. Turns Perfect Blocks into a hex engine.',
  },
  {
    title: 'Renounce Death',
    slug: 'renounce-death',
    tree: 'vampirism',
    effect: 'Once per combat, return with ten seconds of immortality instead of dying.',
    summary: 'Vampirism ultimate. One free death per fight.',
  },
].map((perk) => ({
  ...perk,
  isUltimate: true,
  timeCostSegments: 1,
  foundInWorld: false,
  confidence: 'medium' as const,
  sources: cite('game8Perks'),
  body: rich(
    `${perk.title} is one of the nine ultimate perks — three in each tree, of which you may take only one per tree. That is the real cost: picking it closes the other two in its tree for the rest of the run.`,
    'Learning a perk usually costs one segment. A few cost nothing and a few cost two, so a heavy spec session is worth budgeting for rather than doing piecemeal.',
  ),
}))

export const items = [
  {
    title: 'Durandal',
    slug: 'durandal',
    category: 'weapon',
    rarity: 'legendary',
    region: 'briar-sloughs',
    howToGet:
      'West of Briar Sloughs. Approach the broken bridge and defeat the spirits guarding it.',
    summary: 'The earliest legendary sword in the game, and reachable well before most runs expect a legendary.',
  },
  {
    title: 'Ambrus’ Cuirass',
    slug: 'ambrus-cuirass',
    category: 'armour',
    rarity: 'legendary',
    region: 'svartrau-city',
    howToGet: 'Tied to Ambrus’s court.',
    summary:
      'Heavy chest piece. Improves vampiric ability cooldown, attack stamina cost, and Armour Condition restoration on both attacks and perfect blocks.',
    stats: [
      { label: 'Vampiric ability cooldown', value: 'Improved' },
      { label: 'Attack stamina cost', value: 'Reduced' },
      { label: 'AC restoration (attacks)', value: 'Improved' },
      { label: 'AC restoration (perfect blocks)', value: 'Improved' },
    ],
  },
].map((item) => ({
  ...item,
  confidence: 'medium' as const,
  sources: cite('gamespotGear'),
  body: rich(
    'Exact stat values are not seeded here. Published figures for this item vary between sources and we would rather show you nothing than show you a number we cannot stand behind.',
  ),
}))

export const mechanics = [
  {
    title: 'The thirty-day clock',
    slug: 'the-clock',
    order: 10,
    summary:
      'A run is 480 segments — thirty days of eight daylight and eight night segments. Time only moves when you let it.',
    keyFacts: [
      { label: 'Segments per phase', value: '8', confidence: 'high' },
      { label: 'Segments per full day', value: '16', confidence: 'high' },
      { label: 'Days in a run', value: '30', confidence: 'high' },
      { label: 'Total budget', value: '480 segments', confidence: 'high' },
      { label: 'Typical skill learning cost', value: '1 segment (some 0, some 2)', confidence: 'medium' },
    ],
    body: rich(
      'The clock in The Blood of Dawnwalker does not run. It advances only when you take an action the game has marked with an hourglass, and it warns you before you commit. That single design choice is what turns thirty days from a timer into a budget.',
      { h: 'What is free' },
      { ul: ['Walking anywhere', 'Fast travel', 'Looting', 'Killing enemies', 'Reading your journal', 'Standing still and thinking about it'] },
      { h: 'What costs you' },
      { ul: ['Committing to a quest step', 'Certain dialogue choices', 'Shrine actions', 'Learning most skills'] },
      { h: 'Why the distinction matters' },
      'Because exploration is free, there is no reason to rush through the world — and every reason to be deliberate about the moment you accept a quest step. A run is lost in the Court menu, not on the road.',
      { h: 'What happens at day 30' },
      'The run does not simply end. You can push past thirty days, fight Brencis and roll credits — but your family dies at his ceremony, and that is the Time Runs Out ending. Overrunning is a choice with a cost, not a game over.',
    ),
    sources: cite('g2aTime', 'vgcTimeLimit'),
    confidence: 'high',
  },
  {
    title: 'Corruption',
    slug: 'corruption',
    order: 20,
    summary:
      'The price of the Vampirism tree. Feeding raises it, and raising it opens abilities you cannot get any other way.',
    keyFacts: [
      { label: 'Raised by', value: 'Feeding', confidence: 'medium' },
      { label: 'Unlocks', value: 'Vampiric abilities', confidence: 'medium' },
    ],
    body: rich(
      'Corruption is the game’s bargain. The Vampirism tree holds the strongest abilities in the run, and they open as Corruption rises — which means the most direct route to power is also the one that changes what Coen is.',
      'Treat it as a resource you are spending in a currency other than segments. The cost does not show up on the clock.',
    ),
    sources: cite('game8Skills'),
    confidence: 'medium',
  },
  {
    title: 'Infamy and the nine Edicts',
    slug: 'infamy',
    order: 30,
    summary:
      'How the regime keeps score. As Infamy climbs, Brencis issues Edicts against Coen — nine of them, and all of them penalties.',
    keyFacts: [
      { label: 'Number of Edicts', value: '9', confidence: 'medium' },
      { label: 'Issued by', value: 'Brencis', confidence: 'medium' },
    ],
    body: rich(
      'Infamy tracks how much trouble you have caused. Cross a threshold and Brencis answers with an Edict — and the Edicts are mechanical penalties rather than flavour text.',
      'The tension is direct: Court Activities are how you progress, and Court Activities are what raise Infamy. You cannot advance the main story without inviting the response.',
    ),
    sources: cite('vgcCourt'),
    confidence: 'medium',
  },
  {
    title: 'Quickslots',
    slug: 'quickslots',
    order: 40,
    summary: 'Limited slots, and a loadout that wants to change at dusk and again at dawn.',
    body: rich(
      'Because half of Coen’s kit is unavailable in either phase, quickslots are effectively two loadouts sharing one set of slots. Most runs settle into a day configuration and a night configuration and swap at the turn.',
    ),
    sources: cite('g2aTime'),
    confidence: 'low',
  },
  {
    title: 'Levelling and XP',
    slug: 'levelling',
    order: 50,
    summary: 'Skill points, what they buy, and the segment cost of actually spending them.',
    body: rich(
      'Learning skills costs time as well as points — usually one segment each, occasionally zero, occasionally two. On a 480-segment budget a full spec is a real line item, and it is cheaper to do in deliberate sessions than one perk at a time.',
      'Some perks cannot be bought at all and must be found out in the world, which turns part of your build into an exploration problem.',
    ),
    sources: cite('game8Perks', 'game8Skills'),
    confidence: 'medium',
  },
]

/**
 * Quest chains. Time costs are left unconfirmed throughout — published figures
 * disagree and we have no way to check them. `known: false` makes the run
 * checker treat totals as a floor and say so, which is the honest behaviour.
 */
const unknownTime = { min: 0, max: 0, confidence: 'low' as const, known: false, note: 'Segment cost not confirmed by any source we trust.' }

export const quests = [
  {
    title: 'The Prologue',
    slug: 'prologue',
    kind: 'prologue',
    phase: 'either',
    region: 'laslea-glen',
    prereqs: [],
    summary:
      'Brencis takes Coen’s family. Everything after this is open — there is no linear main quest once the prologue closes.',
    sources: cite('powerpyxWalkthrough', 'wikipedia'),
  },

  // Lacra — gates The Patricide.
  {
    title: 'A Friend Like This',
    slug: 'a-friend-like-this',
    kind: 'ally',
    phase: 'night',
    region: 'svartrau-city',
    prereqs: ['prologue'],
    summary: 'Lacra’s chain opens with a rooftop investigation in Svartrau City, after dark.',
    sources: cite('allthingsLacra', 'fextraliteEndings'),
  },
  {
    title: 'The Song of the Mountain',
    slug: 'song-of-the-mountain',
    kind: 'ally',
    phase: 'night',
    region: 'rockfalls',
    prereqs: ['a-friend-like-this'],
    summary: 'Second in Lacra’s chain.',
    sources: cite('allthingsLacra'),
  },
  {
    title: 'Hive and Seek',
    slug: 'hive-and-seek',
    kind: 'ally',
    phase: 'night',
    region: 'maragir-wealds',
    prereqs: ['song-of-the-mountain'],
    summary: 'Third in Lacra’s chain.',
    sources: cite('allthingsLacra'),
  },
  {
    title: 'Our Rotten Roots',
    slug: 'our-rotten-roots',
    kind: 'ally',
    phase: 'night',
    region: 'the-slits',
    prereqs: ['hive-and-seek'],
    summary: 'Fourth in Lacra’s chain.',
    sources: cite('allthingsLacra'),
  },
  {
    title: 'Midnight Reckoning',
    slug: 'midnight-reckoning',
    kind: 'ally',
    phase: 'night',
    region: 'the-slits',
    prereqs: ['our-rotten-roots'],
    summary:
      'The close of Lacra’s chain, underground. Also reported as “The Night of Horrors” — sources disagree on the name and on whether the chain is five quests or six.',
    confidence: 'low',
    sources: cite('allthingsLacra', 'fextraliteEndings'),
  },

  // Crake — gates The Knyazmaker.
  {
    title: 'The Firebrand',
    slug: 'the-firebrand',
    kind: 'ally',
    phase: 'either',
    region: 'laslea-glen',
    prereqs: ['prologue'],
    summary: 'Crake’s chain opens in Laslea Glen.',
    sources: cite('allthingsCrake', 'fextraliteEndings'),
  },
  {
    title: 'Shadows in the Woods',
    slug: 'shadows-in-the-woods',
    kind: 'ally',
    phase: 'either',
    region: 'maragir-wealds',
    prereqs: ['the-firebrand'],
    summary: 'Second in Crake’s chain.',
    sources: cite('allthingsCrake'),
  },
  {
    title: 'Where Loyalty Lies',
    slug: 'where-loyalty-lies',
    kind: 'ally',
    phase: 'either',
    region: 'boars-back',
    prereqs: ['shadows-in-the-woods'],
    summary: 'Third in Crake’s chain.',
    sources: cite('allthingsCrake'),
  },
  {
    title: 'What Hunts the Night',
    slug: 'what-hunts-the-night',
    kind: 'ally',
    phase: 'night',
    region: 'briar-sloughs',
    prereqs: ['where-loyalty-lies'],
    summary: 'Fourth in Crake’s chain.',
    sources: cite('allthingsCrake'),
  },
  {
    title: 'What Moves the Dead',
    slug: 'what-moves-the-dead',
    kind: 'ally',
    phase: 'either',
    region: 'st-tynas-grove',
    prereqs: ['what-hunts-the-night'],
    summary: 'Fifth in Crake’s chain.',
    sources: cite('allthingsCrake'),
  },
  {
    title: 'Who Pulls the Strings',
    slug: 'who-pulls-the-strings',
    kind: 'ally',
    phase: 'either',
    region: 'svartrau-city',
    prereqs: ['what-moves-the-dead'],
    summary: 'Sixth in Crake’s chain. Completing it opens the Manumit route into the finale.',
    sources: cite('allthingsCrake'),
  },
  {
    title: 'Rise at Dawn',
    slug: 'rise-at-dawn',
    kind: 'ally',
    phase: 'day',
    region: 'svartrau-city',
    prereqs: ['who-pulls-the-strings'],
    summary: 'The Manumit route, first half.',
    sources: cite('allthingsCrake', 'fextraliteEndings'),
  },
  {
    title: 'Fall Before Dusk',
    slug: 'fall-before-dusk',
    kind: 'ally',
    phase: 'day',
    region: 'svartrau-city',
    prereqs: ['rise-at-dawn'],
    summary: 'The Manumit route, second half. This is the last gate on the Knyazmaker ending.',
    sources: cite('allthingsCrake', 'fextraliteEndings'),
  },
].map((quest) => ({
  time: unknownTime,
  confidence: 'medium' as const,
  unlocks: [] as string[],
  excludes: [] as string[],
  ...quest,
  body: rich(
    quest.summary,
    { h: 'Time cost' },
    'No source we trust publishes a segment cost for this quest, so we have not invented one. It is counted as outstanding work by the run checker but contributes nothing to the estimate, which means any total containing it is a floor rather than a figure. If you know the real cost, the correction form at the foot of this page goes straight to our review queue.',
  ),
}))

export const endings = [
  {
    title: 'The Patricide',
    slug: 'the-patricide',
    gate: 'ally',
    ally: 'lacra',
    requiredQuests: ['midnight-reckoning'],
    howToGet: 'Complete Lacra’s questline before starting the final sequence, then take down Brencis with her.',
    summary: 'Team up with Lacra to kill Brencis. Gated on finishing her chain before the finale.',
  },
  {
    title: 'The Knyazmaker',
    slug: 'the-knyazmaker',
    gate: 'ally',
    ally: 'crake',
    requiredQuests: ['fall-before-dusk'],
    howToGet: 'Finish Crake’s questline through Rise at Dawn and Fall Before Dusk, then march on the castle with the Manumit.',
    summary: 'Team up with Crake and the Manumit. The longest chain in the game, and the latest one you can still start.',
  },
  {
    title: 'The Folk Hero',
    slug: 'the-folk-hero',
    gate: 'choice',
    requiredQuests: [],
    howToGet: 'Defeat Brencis without Lacra’s or Crake’s help.',
    summary: 'Kill Brencis alone. Requires no questline, which makes it the fallback when both allies are out of reach.',
  },
  {
    title: 'The Turncoat',
    slug: 'the-turncoat',
    gate: 'choice',
    requiredQuests: [],
    howToGet: 'Betray your allies and strike a deal with Brencis to get your family back.',
    summary: 'Deal with Brencis instead of fighting him.',
  },
  {
    title: 'A Hero They Deserve',
    slug: 'a-hero-they-deserve',
    gate: 'choice',
    isEarlyExit: true,
    requiredQuests: [],
    howToGet: 'Escape Vale Sangora rather than see it through.',
    summary: 'Leave. An early exit that closes the run before the confrontation.',
  },
  {
    title: 'Together Forever',
    slug: 'together-forever',
    gate: 'choice',
    isEarlyExit: true,
    requiredQuests: [],
    howToGet: 'Choose to stay with your family rather than press on.',
    summary: 'Stay. The other early exit.',
  },
  {
    title: 'Time Runs Out',
    slug: 'time-runs-out',
    gate: 'clock',
    isFailure: true,
    requiredQuests: [],
    howToGet: 'Take longer than thirty days. Your family is sacrificed at Brencis’s ceremony.',
    summary:
      'The failure state, and the only ending decided by the clock rather than a choice. You can still finish the game — you just finish it without them.',
  },
].map((ending) => ({
  isFailure: false,
  isEarlyExit: false,
  confidence: 'medium' as const,
  sources: cite('fextraliteEndings', 'powerpyxEndings'),
  ...ending,
  body: rich(
    ending.summary,
    { h: 'How it is gated' },
    ending.gate === 'ally'
      ? 'This ending is gated on an ally questline, which means it is the kind you can lose by accident. The chain has to be finished before the final sequence starts — there is no catching up once you are in the endgame.'
      : ending.gate === 'clock'
        ? 'Nothing needs to be done to reach this ending. It is what you get by running past day thirty, which is why the run checker never reports it as barred.'
        : 'This ending is decided by a choice at the end rather than by preparation, so it stays available as long as you reach the finale at all.',
    { h: 'Seeing more than one' },
    'All seven can be seen in a single playthrough by making a manual save before the final quest and reloading it. That does not help with the two ally-gated endings, which are decided long before you get there.',
  ),
}))

export const guides = [
  {
    title: 'Can you still reach every ending from where you are?',
    slug: 'can-you-still-reach-every-ending',
    targetQuery: 'blood of dawnwalker can I still get knyazmaker ending day 17',
    summary:
      'Two of the seven endings are decided by work you do long before the finale. Here is how to tell, mid-run, whether they are still on the table.',
    relatedEndings: ['the-patricide', 'the-knyazmaker'],
    confidence: 'medium',
    sources: cite('fextraliteEndings', 'powerpyxEndings', 'allthingsCrake', 'allthingsLacra'),
    body: rich(
      'Five of the seven endings are decided at the end. Two are not, and those are the ones that catch people out.',
      { h: 'The two that can be lost early' },
      'The Patricide needs Lacra’s chain finished before the final sequence begins. The Knyazmaker needs Crake’s, which is longer — eight quests that only appear one at a time, so you cannot compress it. Arrive at the finale without having done the work and neither is offered. There is no catching up.',
      { h: 'The ones you cannot lose' },
      'The Folk Hero, The Turncoat, and both early exits are choices made at the end. As long as you reach the finale they remain available. Time Runs Out needs nothing at all — it is what happens if you overrun.',
      { h: 'Working out where you stand' },
      'What matters is not the day number but the segments left against the segments the outstanding chain costs. A run on day 20 that has already finished Crake’s chain is in far better shape than one on day 12 that has not started it. Our run checker does that arithmetic against the quests you have actually finished.',
      { h: 'The honest caveat' },
      'Nobody publishes reliable segment costs for individual quests yet, ours included. The checker counts what it knows and tells you what it does not, so treat its totals as a floor.',
    ),
  },
]
