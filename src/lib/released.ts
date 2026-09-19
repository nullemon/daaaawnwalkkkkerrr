import type { Game } from '@/payload-types'

/**
 * Has this game actually come out?
 *
 * One question, asked in one place, because three components were each about
 * to answer it slightly differently — which is how `sectionArt` came to serve
 * Dawnwalker's press footage on the Onimusha wiki.
 *
 * ## The three ways of not being out, and why each is a "no"
 *
 * **No date at all** is a no. Dawnwalker deliberately has none: nothing in this
 * repository sources one, and the directory would rather print nothing than a
 * date we guessed. "Unknown is not zero" applies to release as much as to a
 * quest's segment cost — an empty field is the absence of a source, not a
 * claim that the game is out.
 *
 * **An unconfirmed date** is a no, even one in the past. `releaseDateConfirmed:
 * false` means the date is an expectation, and an expectation that has been
 * overtaken by the calendar is still an expectation. `GameProfile` already
 * reads it this way (`!== false`) and `directory.ts` prints "Expected
 * <month>"; this agrees with both rather than inventing a third reading.
 *
 * **A confirmed date in the future** is a no, obviously, and is the case this
 * was written for.
 *
 * ## `now` is the build clock, and that is a real caveat
 *
 * Every public page on this network prerenders to static HTML, so this is
 * evaluated when the site is built and not when it is read. A game that comes
 * out on Tuesday keeps whatever this said on the day of the last deploy until
 * somebody rebuilds.
 *
 * That is consistent with everything else here — release dates, achievement
 * unlock rates and store facts are all baked at build time, and `pnpm refresh`
 * the week each game launches is the plan rather than an afterthought. It is
 * written down because the failure is silent in the reassuring direction: the
 * site simply goes on not showing a score, and nothing anywhere says the
 * embargo it is honouring lifted a fortnight ago. `src/lib/audit.ts` carries
 * the finding that says so.
 *
 * The parameter is injectable so the tests can pin both sides of a boundary
 * without waiting for one.
 */
export const isReleased = (
  game: Pick<Game, 'releaseDate' | 'releaseDateConfirmed'>,
  now: Date = new Date(),
): boolean => {
  if (!game.releaseDate) return false
  if (game.releaseDateConfirmed === false) return false

  const released = new Date(game.releaseDate).getTime()
  // An unparseable date is not a release date. Same rule as the empty field:
  // we cannot say it is out, so we do not.
  if (!Number.isFinite(released)) return false

  return released <= now.getTime()
}

/**
 * How long ago it came out, in whole days, or null if it has not.
 *
 * Only the audit uses this — to say "released 19 days ago and the site has not
 * been rebuilt since", which is the one thing `isReleased` cannot tell anybody
 * on its own.
 */
export const daysSinceRelease = (
  game: Pick<Game, 'releaseDate' | 'releaseDateConfirmed'>,
  now: Date = new Date(),
): number | null => {
  if (!isReleased(game, now)) return null
  const released = new Date(game.releaseDate as string).getTime()
  return Math.floor((now.getTime() - released) / 86_400_000)
}
