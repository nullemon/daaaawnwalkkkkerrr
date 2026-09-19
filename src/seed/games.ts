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
      'A narrative RPG built around a thirty-day clock: 480 segments, spent once. Quests, endings, Court Activities and the mechanics behind the timer, with every figure cited to the source it came from.',
    publisher: 'Bandai Namco Entertainment',
    developer: 'Rebel Wolves',
    /*
      It came out on 2 September 2026, and this entry used to say nobody had
      published a date.

      The comment here read "Deliberately no release date. Nothing in this
      repository sources one, and the directory would rather print nothing than
      a date we guessed." The first half of that stopped being true and nothing
      noticed: `src/seed/raw/games/dawnwalker.json`, read on 17 September, is
      the file this wiki's 46 achievements, its system requirements, its
      editions and its key art all come from, and it carries
      `releaseDate: "Sep 2, 2026"` with `comingSoon: false`. The unlock rates
      on those achievements run from 1.7% to 82.9%, which is a game people have
      finished.

      It was not a cosmetic gap. `isReleased` answers "no" to a game with no
      date, so the network's own flagship wiki was the one wiki that could
      never show an editorial score, printed nothing where the other seven
      print a date, and could never raise the audit's "released N days ago and
      the site has not been rebuilt since" finding. A field left empty because
      a sentence said the source did not exist, next to the source.

      The second half of that comment still stands and is why this is
      `releaseDateConfirmed: true` rather than a guess: the store page states
      the date as fact, the same as the other four released games here. The
      four that are not out carry `comingSoon: true` and an expectation.
    */
    releaseDate: '2026-09-02',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    /*
      The store page is a source, and every other game here cites it. Without
      it `game-guides.ts` builds an empty citation list for this wiki, which is
      how "The hardest achievements in Dawnwalker" — a page whose every figure
      is a Steam global unlock rate — came to be the one guide of 410 on this
      network carrying no source at all.
    */
    storeUrl: 'https://store.steampowered.com/app/3751260/',
    /*
      `completion-tracker` was missing here and nowhere else it was earned.
      The flag's own label reads "needs a published achievement list", and this
      wiki has 46 — the largest list on the network after Star Wars and
      Onimusha, both of which carry the flag. So `/tools/completion` 404'd on
      the one wiki this project is built around, and nothing looked broken:
      the rail is derived from these flags, so it correctly declined to link a
      page it had been told did not exist. A feature switched off by omission
      leaves no trace of the decision it never was.

      Set here rather than in the admin because the database is reproducible
      from seed by design — a click in the CMS would be undone by the next
      `pnpm db:reset`, which is exactly what is about to be run.
    */
    features: ['run-checker', 'build-planner', 'comments', 'completion-tracker'],
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
    // Its achievement list is published, so the tracker has something to track.
    features: ['comments', 'completion-tracker'],
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
    // Its achievement list is published, so the tracker has something to track.
    features: ['comments', 'completion-tracker'],
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
    // Its achievement list is published, so the tracker has something to track.
    features: ['comments', 'completion-tracker'],
    theme: { accent: '#8a6a2f' },
  },
  {
    slug: 'silent-hill-townfall',
    title: 'Silent Hill: Townfall',
    shortTitle: 'Silent Hill Townfall',
    status: 'building',
    tagline: 'A new town, and the same problem with it.',
    summary:
      'Screen Burn’s entry in the Silent Hill series, published by Konami with Annapurna Interactive. A first-person psychological horror game.',
    publisher: 'Konami, Annapurna Interactive',
    developer: 'Screen Burn',
    releaseDate: '2026-09-23',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/1636440/',
    features: ['comments'],
    theme: { accent: '#6b6f52' },
  },

  /* -----------------------------------------------------------------------
     The second wave.

     Every figure below is off a store listing this repository harvested
     (`src/seed/raw/games/<slug>.json`) or off the game's Wikipedia infobox,
     and the summaries are composed here rather than copied — facts are free
     to compile, sentences are not.

     `completion-tracker` is ticked where the harvest actually returned
     achievements carrying a global unlock rate, which is the flag's own
     condition rather than a guess: 49 for Requiem, 57 for Forza, 48 for NBA.
     Subnautica 2 and Deadlock returned none, so neither carries it, and both
     earn it at `pnpm refresh` the week their lists appear — the same way
     Dawnwalker's arrived on release day.

     Two of these have no `storeUrl` because there is no store page to name,
     and that is the honest state rather than an omission. See each.
     ----------------------------------------------------------------------- */

  {
    slug: 'resident-evil-requiem',
    title: 'Resident Evil Requiem',
    shortTitle: 'RE Requiem',
    status: 'building',
    tagline: 'Raccoon City, and what was left of it.',
    summary:
      'Capcom’s survival horror, developed and published in-house. The series’ usual economy of ammunition and space, and the first mainline entry since Village.',
    /*
      "Capcom", not the "CAPCOM Co., Ltd." the store listing spells it.

      Both are right and only one resolves: the companies host already carries
      a profile at /capcom, seeded from Onimusha, and the legal-entity form
      slugs to capcom-co-ltd — a page that does not exist. 
      would correctly decline to link it, so the studio would be named on this
      wiki and linked from nowhere. The store spelling is still in the raw
      harvest, which is where a citation reads it from.
    */
    publisher: 'Capcom',
    developer: 'Capcom',
    releaseDate: '2026-02-26',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/3764200/',
    // 49 achievements, every one with a published global unlock rate.
    features: ['comments', 'completion-tracker'],
    theme: { accent: '#8c2f2f' },
  },
  {
    slug: 'subnautica-2',
    title: 'Subnautica 2',
    shortTitle: 'Subnautica 2',
    status: 'building',
    tagline: 'A new ocean, and four people in it.',
    summary:
      'Unknown Worlds’ sequel to Subnautica: an underwater survival game on an unfamiliar alien world, playable alone or with up to three other people. In early access, so what it holds is still moving.',
    publisher: 'Unknown Worlds Entertainment',
    developer: 'Unknown Worlds Entertainment',
    releaseDate: '2026-05-14',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/1962700/',
    /*
      No completion tracker. The harvest returned zero achievements — an early
      access listing often has none until it leaves — and a tracker with
      nothing to track is the empty tool `requireFeature` exists to refuse.
    */
    features: ['comments'],
    theme: { accent: '#1f7a8c' },
  },
  {
    slug: 'forza-horizon-6',
    title: 'Forza Horizon 6',
    shortTitle: 'Forza Horizon 6',
    status: 'building',
    tagline: 'An open map, and a car for every inch of it.',
    summary:
      'Playground Games’ sixth Horizon festival, published by Xbox Game Studios. An open-world racing game built around a car list rather than a campaign, which is why this wiki is a catalogue before it is a walkthrough.',
    publisher: 'Xbox Game Studios',
    developer: 'Playground Games',
    releaseDate: '2026-05-18',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/2483190/',
    // 57 achievements with unlock rates.
    features: ['comments', 'completion-tracker'],
    theme: { accent: '#c86a1e' },
  },
  {
    slug: 'nba-2k27',
    title: 'NBA 2K27',
    shortTitle: 'NBA 2K27',
    status: 'building',
    tagline: 'One season, and every number behind it.',
    summary:
      'Visual Concepts’ basketball simulation, published by 2K. An annual release, which changes what a wiki of it can honestly be: the roster and the ratings move with every update, so what is recorded here is what the listing and the achievement data actually state.',
    publisher: '2K',
    developer: 'Visual Concepts',
    releaseDate: '2026-09-03',
    releaseDateConfirmed: true,
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/4356430/',
    // 48 achievements with unlock rates.
    features: ['comments', 'completion-tracker'],
    theme: { accent: '#b2762c' },
  },
  {
    slug: 'deadlock',
    title: 'Deadlock',
    shortTitle: 'Deadlock',
    status: 'building',
    tagline: 'Valve’s, and still mostly unannounced.',
    summary:
      'A Valve game with a store page, a playable build and no announced release date. Almost nothing about it is settled, which is the most useful thing a page about it can say, so this wiki records what the listing states and leaves the rest open.',
    publisher: 'Valve',
    developer: 'Valve',
    /*
      No date. The listing says "To be announced" and `comingSoon` is true, so
      there is nothing to put here — and `isReleased` reads an empty date as
      "not out", which is exactly right.
    */
    platforms: ['PC'],
    storeUrl: 'https://store.steampowered.com/app/1422450/',
    features: ['comments'],
    theme: { accent: '#6b4fa8' },
  },
  {
    slug: 'gta-6',
    title: 'Grand Theft Auto VI',
    shortTitle: 'GTA 6',
    status: 'building',
    tagline: 'Leonida, and two people running through it.',
    summary:
      'Rockstar’s sixth numbered Grand Theft Auto, set in the fictional state of Leonida and its Vice City. The story follows Jason Duval and Lucia Caminos; Lucia is the first female protagonist the series has not made optional.',
    publisher: 'Rockstar Games',
    developer: 'Rockstar Games',
    releaseDate: '2026-11-19',
    releaseDateConfirmed: true,
    /*
      Console, and no PC version is announced. Every other wiki here says
      `['PC']` because every other game has a Steam listing this project
      harvested; this one has none, which is why it carries no `storeUrl` and
      why its requirements, editions, languages and achievements are absent
      rather than empty. `seed:topics` reports each of those as "the listing
      does not carry this", which on a game with no listing at all is the only
      honest thing to print.
    */
    platforms: ['PlayStation 5', 'Xbox Series X|S'],
    features: ['comments'],
    theme: { accent: '#d4557f' },
  },
  {
    slug: 'fire-emblem-fortunes-weave',
    title: 'Fire Emblem: Fortune’s Weave',
    shortTitle: 'Fortune’s Weave',
    status: 'building',
    tagline: 'A grid, a cast, and one decision per turn.',
    summary:
      'Intelligent Systems’ tactical role-playing game for Nintendo Switch 2, published by Nintendo. Turn-based battles on a grid, with a cast the campaign is built around.',
    publisher: 'Nintendo',
    developer: 'Intelligent Systems',
    releaseDate: '2026-09-17',
    releaseDateConfirmed: true,
    /*
      Switch 2, and it will never have a Steam listing. The store pipeline is
      where requirements, editions, languages and achievements come from across
      this network, so all four are absent here — what this wiki has instead is
      its community wiki, Wikipedia and the demand side.
    */
    platforms: ['Nintendo Switch 2'],
    features: ['comments'],
    theme: { accent: '#3f6fa8' },
  },
]

/** The game every existing record belongs to, and the one the tools were built for. */
export const PRIMARY_GAME = 'dawnwalker'
