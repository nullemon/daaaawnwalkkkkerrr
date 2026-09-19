import type { Game } from '@/payload-types'

/**
 * The year to print beside a game's name, or nothing.
 *
 * ## Why an unconfirmed date prints no year
 *
 * `releaseDateConfirmed: false` means the date is an expectation rather than a
 * date — a window a publisher has already moved once and may move again. "(2026)"
 * beside a title reads as a fact about when the game came out, and a reader
 * scanning a list of a studio's work has no way to tell which of the years in
 * it are guesses. So an unconfirmed date prints the name alone, which is true.
 *
 * A *confirmed* date in the future still prints its year, and that is
 * deliberate: GTA 6 is announced for 19 November 2026 and "(2026)" is what the
 * publisher has said. `isReleased` is the separate question of whether the game
 * is out, and it is the one that decides whether a score may be shown.
 *
 * ## Why it is a module
 *
 * `GameProfile` has had this rule inline with the comment above since the panel
 * was built. The moment a second place prints a year — a company's list of its
 * games, a person's list of credits — the rule exists twice, and the two copies
 * disagree the first time somebody decides an unconfirmed date is good enough.
 * One rule, read by everything that prints a year.
 */
export const releaseYear = (
  game: Pick<Game, 'releaseDate' | 'releaseDateConfirmed'>,
): string | null => {
  if (!game.releaseDate || game.releaseDateConfirmed === false) return null
  const year = new Date(game.releaseDate).getUTCFullYear()
  return Number.isFinite(year) ? String(year) : null
}

/** "Onimusha: Way of the Sword (2026)", or just the title where no year is due. */
export const titleWithYear = (
  game: Pick<Game, 'title' | 'shortTitle' | 'releaseDate' | 'releaseDateConfirmed'>,
  short = false,
): string => {
  const name = (short ? game.shortTitle || game.title : game.title) ?? ''
  const year = releaseYear(game)
  return year ? `${name} (${year})` : name
}
