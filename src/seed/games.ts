/**
 * The wikis the network opens with.
 *
 * Every date, publisher and developer below was read from the game's own Steam
 * store page rather than from a news article or from memory, on 15 September
 * 2026. That matters more than usual here: a release date is the first fact a
 * reader checks, and getting it wrong on the directory page costs the site its
 * credibility before anybody reaches an actual record.
 *
 * `platforms` says PC and nothing else for the same reason. Steam confirms
 * Windows; it says nothing about consoles, and several of these are obviously
 * coming to one. Obviously is not a source. An editor adds the rest.
 *
 * Summaries are written here rather than pasted from the store pages — the
 * same rule that governs every other page on the network. They stick to what
 * the store page establishes: genre, premise, who made it.
 */

export type SeedGame = {
  slug: string
  title: string
  shortTitle?: string
  status: 'planned' | 'building' | 'live' | 'archived'
  tagline?: string
  summary: string
  publisher?: string
  developer?: string
  releaseDate?: string
  releaseDateConfirmed?: boolean
  platforms?: string[]
  storeUrl?: string
  features?: string[]
  theme?: { accent?: string }
}

export const games: SeedGame[] = [
  {
    slug: 'dawnwalker',
    title: 'The Blood of Dawnwalker',
    shortTitle: 'Dawnwalker',
    status: 'live',
    tagline: 'Thirty days and thirty nights. 480 segments.',
    summary:
      'A narrative RPG built around a thirty-day clock: 480 segments, spent once. Quests, endings, Court Activities and the mechanics behind the timer, with every figure sourced and its confidence shown.',
    publisher: 'Bandai Namco Entertainment',
    developer: 'Rebel Wolves',
    // Deliberately no release date. Nothing in this repository sources one,
    // and the directory would rather print nothing than a date we guessed.
    platforms: ['PC'],
    features: ['run-checker', 'build-planner', 'comments'],
    theme: { accent: '#c02630' },
  },
  {
    slug: 'onimusha-way-of-the-sword',
    title: 'Onimusha: Way of the Sword',
    shortTitle: 'Onimusha',
    status: 'building',
    tagline: 'Kyoto, the Oni Gauntlet, and the Genma.',
    summary:
      'Capcom’s revival of Onimusha, an action game set in a Kyoto besieged by the Genma. The player carries the Oni Gauntlet through a campaign of close, deliberate swordfighting.',
    publisher: 'Capcom',
    developer: 'Capcom',
    releaseDate: '2026-09-03',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/2638890/',
    features: ['comments'],
    theme: { accent: '#9b1c1c' },
  },
  {
    slug: 'phantom-blade-zero',
    title: 'Phantom Blade Zero',
    shortTitle: 'Phantom Blade Zero',
    status: 'building',
    tagline: 'Sixty-six days left to live.',
    summary:
      'A wuxia action RPG from S-GAME, built in Unreal Engine 5. The player is Soul, an assassin with sixty-six days to live — a hard countdown the whole campaign is arranged around.',
    publisher: 'S-GAME Publishing',
    developer: 'S-GAME Studio',
    releaseDate: '2026-10-28',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/4115450/',
    // The countdown makes this the one other game here that may genuinely want
    // a run planner. Not switched on until the mechanics are documented —
    // a tool built on guessed numbers is worse than no tool.
    features: ['comments'],
    theme: { accent: '#7a1fa2' },
  },
  {
    slug: 'control-resonant',
    title: 'Control Resonant',
    shortTitle: 'Control Resonant',
    status: 'building',
    tagline: 'A warped Manhattan, and Dylan Faden.',
    summary:
      'Remedy’s action-adventure RPG set in a distorted Manhattan, following Dylan Faden and his paranatural abilities against a reality-bending threat.',
    publisher: 'Remedy Entertainment',
    developer: 'Remedy Entertainment',
    releaseDate: '2026-09-24',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/3669870/',
    features: ['comments'],
    theme: { accent: '#b8531a' },
  },
  {
    slug: 'gears-of-war-e-day',
    title: 'Gears of War: E-Day',
    shortTitle: 'Gears E-Day',
    status: 'building',
    tagline: 'Emergence Day, from the beginning.',
    summary:
      'The Coalition’s prequel to the Gears of War series, a third-person shooter campaign set on Emergence Day itself.',
    publisher: 'Xbox Game Studios',
    developer: 'The Coalition',
    releaseDate: '2026-10-06',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/3010850/',
    features: ['comments'],
    theme: { accent: '#4a6b2a' },
  },
  {
    slug: 'star-wars-zero-company',
    title: 'Star Wars Zero Company',
    shortTitle: 'Zero Company',
    status: 'building',
    tagline: 'Turn-based tactics, late in the Clone Wars.',
    summary:
      'A single-player turn-based tactics game from Bit Reactor, set in the closing period of the Clone Wars. The player commands a squad through a campaign of discrete missions.',
    publisher: 'Electronic Arts',
    developer: 'Bit Reactor',
    releaseDate: '2026-08-27',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/2075800/',
    features: ['comments'],
    theme: { accent: '#1f6f9b' },
  },
  {
    slug: 'resonance-a-plague-tale-legacy',
    title: 'Resonance: A Plague Tale Legacy',
    shortTitle: 'A Plague Tale Legacy',
    status: 'building',
    tagline: 'Sophia, and the Minotaur’s Island.',
    summary:
      'Asobo Studio’s prequel to the A Plague Tale games, a linear narrative adventure following Sophia to the Minotaur’s Island.',
    publisher: 'Focus Entertainment',
    developer: 'Asobo Studio',
    releaseDate: '2026-08-27',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/2713000/',
    features: ['comments'],
    theme: { accent: '#8a6a2f' },
  },
]

/** The game every existing record belongs to, and the one the tools were built for. */
export const PRIMARY_GAME = 'dawnwalker'
