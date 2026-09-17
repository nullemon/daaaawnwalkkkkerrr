import { countRecords, getPublishedGames, gameUrl } from './payload'
import { SECTIONS } from './sections'
import type { Game } from '@/payload-types'

/**
 * The game directory: every wiki, with how big it is and where it lives.
 *
 * The page count is the whole point of a directory like this. Fextralife
 * prints one against every wiki in its list, and it is the most persuasive
 * thing on the page — a reader deciding whether a site is worth their time
 * reads "4,600 pages" and stops deciding. Ours will say 422 for Dawnwalker and
 * a much smaller number for a game that launches next month, and both are
 * honest in a way that "comprehensive guide" is not.
 *
 * Counted at build time from the database rather than stored on the game, so
 * it cannot be stale and nobody has to remember to update it.
 */

export type DirectoryEntry = {
  game: Game
  url: string
  pages: number
  /**
   * Sections with at least one record, longest first. Shown as a summary.
   *
   * `kind` is the singular that goes with `label`. The filter above admits a
   * count of 1 - Silent Hill: Townfall holds exactly one enemy - and the chip
   * printed the plural label against it, so the network directory read "1
   * enemies". `SECTIONS` has carried the singular all along; this just brings
   * it along so the card does not have to guess at one.
   */
  highlights: { label: string; kind: string; count: number }[]
}

export const directory = async (): Promise<DirectoryEntry[]> => {
  const games = await getPublishedGames()

  const entries = await Promise.all(
    games.map(async (game) => {
      const counts = await Promise.all(
        SECTIONS.map(async (section) => ({
          label: section.label,
          kind: section.kind,
          count: await countRecords(section.collection, { game: game.slug }),
        })),
      )

      return {
        game,
        url: await gameUrl(game),
        pages: counts.reduce((total, section) => total + section.count, 0),
        highlights: counts
          .filter((section) => section.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 4),
      }
    }),
  )

  /*
    Biggest first. A directory sorted alphabetically opens on whatever game
    starts with A, which on a network this size is a wiki with nine pages —
    and the first impression of the network is then that it is empty.
  */
  return entries.sort((a, b) => b.pages - a.pages)
}

/** "6 October 2026", or "expected October 2026" when the date is not firm. */
export const releaseLine = (game: Game): string | null => {
  if (!game.releaseDate) return null
  const date = new Date(game.releaseDate)
  if (Number.isNaN(date.getTime())) return null

  const full = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const month = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  if (!game.releaseDateConfirmed) return `Expected ${month}`
  return date.getTime() > Date.now() ? `Releases ${full}` : `Released ${full}`
}
