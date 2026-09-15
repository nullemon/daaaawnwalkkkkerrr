/**
 * Which collections belong to a game, and which belong to the network.
 *
 * This list is the spine of the whole multi-game design and is imported by
 * three places that must never disagree: the Payload config (which adds the
 * `game` field and the compound index), the query layer (which refuses to run
 * an unscoped read against any of these), and the seeding tools.
 *
 * Deliberately a plain module with no imports, so anything can read it —
 * including scripts that run outside Next.js.
 *
 * Adding a collection here is not optional bookkeeping. A game-scoped
 * collection missing from this list compiles, runs, and quietly serves one
 * game's records on another game's pages.
 */
export const GAME_SCOPED = [
  'quests',
  'achievements',
  'court-activities',
  'endings',
  'regions',
  'courts',
  'characters',
  'enemies',
  'skill-trees',
  'perks',
  'items',
  'builds',
  'mechanics',
  'guides',
  /*
    Appended, and it has to stay appended.

    Payload names a compound index by its position in this list -
    `game_slug_5_idx` and so on - so inserting a collection anywhere but the
    end renames every later collection's index and the next write fails with
    "index game_slug_N_idx already exists". Adding at the end is the only
    change that costs nothing.
  */
  'maps',
] as const

export type GameScopedCollection = (typeof GAME_SCOPED)[number]

/**
 * Everything else is network-wide, and that is a decision rather than an
 * oversight in each case:
 *
 *   games     — the list of wikis itself
 *   media     — one image library; a piece of key art can appear on the hub
 *               and on its game's wiki without being uploaded twice
 *   authors   — a writer covers several games, and their E-E-A-T profile is
 *               stronger as one page with a full body of work than as six
 *   users     — editors; which games they may edit is access control, not a
 *               separate account per wiki
 *   players   — readers; one login across the network was the point of a
 *               network
 *   corrections, requests — reader submissions, triaged in one queue, each
 *               carrying an optional game rather than being partitioned by one
 *   comments  — carries a game for filtering, but moderation is network-wide
 */
export const isGameScoped = (collection: string): collection is GameScopedCollection =>
  (GAME_SCOPED as readonly string[]).includes(collection)

/**
 * The public URL path each collection lives under.
 *
 * Mostly the collection slug, but not always — `courts` is served at `/court`
 * and `skill-trees` at `/skills`, because those read better in a URL than the
 * schema names do.
 *
 * Kept here, next to the list itself and with no imports, so the routing
 * layer, the navigation, the sitemap and the admin's "View on site" button all
 * read one map. Each of those had its own copy once and they disagreed.
 */
export const SECTION_PATH: Record<GameScopedCollection, string> = {
  quests: '/quests',
  achievements: '/achievements',
  'court-activities': '/court-activities',
  endings: '/endings',
  regions: '/regions',
  courts: '/court',
  characters: '/characters',
  enemies: '/enemies',
  'skill-trees': '/skills',
  perks: '/perks',
  items: '/items',
  builds: '/builds',
  mechanics: '/mechanics',
  guides: '/guides',
  maps: '/maps',
}
