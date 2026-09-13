/** Shared citations, so every seeded record points at where its facts came from. */
export const SOURCES = {
  fextraliteLocations: {
    title: 'Locations — Blood of Dawnwalker Wiki (Fextralife)',
    url: 'https://bloodofdawnwalker.wiki.fextralife.com/Locations',
  },
  fextraliteEndings: {
    title: 'Endings Guide — Blood of Dawnwalker Wiki (Fextralife)',
    url: 'https://bloodofdawnwalker.wiki.fextralife.com/Endings_Guide',
  },
  fextraliteCourt: {
    title: 'Court Activities Walkthrough — Blood of Dawnwalker Wiki (Fextralife)',
    url: 'https://bloodofdawnwalker.wiki.fextralife.com/Court_Activities_Walkthrough',
  },
  powerpyxEndings: {
    title: 'All Endings Guide — PowerPyx',
    url: 'https://www.powerpyx.com/the-blood-of-dawnwalker-all-endings-guide/',
  },
  powerpyxCourt: {
    title: 'All Court Activity Locations — PowerPyx',
    url: 'https://www.powerpyx.com/blood-of-dawnwalker-all-court-activity-locations/',
  },
  powerpyxWalkthrough: {
    title: 'Walkthrough — All Quests — PowerPyx',
    url: 'https://www.powerpyx.com/the-blood-of-dawnwalker-walkthrough-all-quests/',
  },
  g2aTime: {
    title: 'How Time Works in The Blood of Dawnwalker — G2A News',
    url: 'https://www.g2a.com/news/features/guide/how-time-works-in-the-blood-of-dawnwalker/',
  },
  vgcTimeLimit: {
    title: 'What happens after the 30-day time limit? — VGC',
    url: 'https://www.videogameschronicle.com/guide/blood-of-dawnwalker-what-happens-after-30-days/',
  },
  vgcCourt: {
    title: 'How to kill Brencis’s court of boyars — VGC',
    url: 'https://www.videogameschronicle.com/guide/blood-of-dawnwalker-how-to-kill-brenciss-court-of-boyars/',
  },
  game8Skills: {
    title: 'All Skills — Game8',
    url: 'https://game8.co/games/The-Blood-of-Dawnwalker/archives/616366',
  },
  game8Perks: {
    title: 'All Perks List — Game8',
    url: 'https://game8.co/games/The-Blood-of-Dawnwalker/archives/618584',
  },
  gamespotGear: {
    title: 'Best Gear — All Legendary Weapons And Armor — GameSpot',
    url: 'https://www.gamespot.com/articles/blood-of-dawnwalker-legendary-weapons-armors-gear/',
  },
  gamespotBosses: {
    title: 'How To Defeat All Vampire Court Bosses — GameSpot',
    url: 'https://www.gamespot.com/articles/blood-of-dawnwalker-boss-guide-brencis-ambrus-bakir-xanthe/',
  },
  allthingsLacra: {
    title: 'Lacra Questline Walkthrough — allthings.how',
    url: 'https://allthings.how/the-blood-of-dawnwalker-lacra-questline-walkthrough-all-six-quests/',
  },
  allthingsCrake: {
    title: 'Full Crake Questline Walkthrough — allthings.how',
    url: 'https://allthings.how/the-blood-of-dawnwalker-full-crake-questline-walkthrough/',
  },
  showgamerMap: {
    title: 'Full Map — All Regions and Points of Interest — ShowGamer',
    url: 'https://showgamer.com/en/guides/5407-polnaya-karta-the-blood-of-dawnwalker',
  },
  wikipedia: {
    title: 'The Blood of Dawnwalker — Wikipedia',
    url: 'https://en.wikipedia.org/wiki/The_Blood_of_Dawnwalker',
  },
} as const

const RETRIEVED = '2026-09-13'

export type SourceKey = keyof typeof SOURCES

/** Expand source keys into the array shape the `sources` field expects. */
export const cite = (...keys: SourceKey[]) =>
  keys.map((key) => ({ ...SOURCES[key], retrieved: RETRIEVED }))
