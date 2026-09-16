import Link from 'next/link'
import type { Game } from '@/payload-types'
import { calloutFor } from '@/lib/game-copy'
import { copy, type Tokens } from '@/lib/copy'

/**
 * A bordered note inside a section, with an editor's version taking precedence
 * over the one written in the page.
 *
 * Three outcomes rather than two, which is the whole reason this is a
 * component and not a `copy()` call at each site:
 *
 *   no row       → the built-in note, exactly as it reads today
 *   row, hidden  → nothing at all
 *   row, filled  → the editor's heading and body
 *
 * The middle one is the point. Most of these callouts state a Dawnwalker
 * mechanic — "travel is free" describes a segment clock seven of the eight
 * games do not have — and the right answer for those wikis is an empty space,
 * not a reworded sentence. A two-way "override or default" could not express
 * that, so the first attempt at fixing this class of bug wrapped each callout
 * in `game?.slug === 'dawnwalker'`, which fixes one wiki's page and leaves the
 * other seven with nothing anybody can put there.
 *
 * `children` is the built-in body, so it keeps its inline links and its
 * computed numbers. An editor's body is plain text with `{tokens}`: an
 * editable string that reaches the DOM as markup is the stored-XSS hole the
 * attribution template already refuses to be.
 */
export function Callout({
  game,
  where,
  heading,
  tokens = {},
  builtIn = true,
  children,
}: {
  game: Pick<Game, 'callouts'> | null | undefined
  /** Which callout this is — matches the options in `src/fields/gameCopy.ts`. */
  where: string
  /** The built-in heading. */
  heading: string
  tokens?: Tokens
  /**
   * Whether the built-in note applies to this wiki at all.
   *
   * Several of these point at a tool only Dawnwalker has switched on. A link
   * to a tool a wiki does not have is worse than no callout: it reads as a
   * broken site rather than as a section that does not apply, which is the
   * same reason the rail refuses to list an empty index. Pass `false` and the
   * box appears only if an editor has written one.
   */
  builtIn?: boolean
  /** The built-in body. */
  children: React.ReactNode
}) {
  const row = calloutFor(game, where)
  if (row?.hide) return null

  const written = row && (row.heading || row.body)
  if (!written) {
    if (!builtIn) return null
    return (
      <div className="callout">
        <h2>{copy(undefined, heading, tokens)}</h2>
        {children}
      </div>
    )
  }

  const href = row.linkHref?.trim()
  return (
    <div className="callout">
      <h2>{copy(row.heading, heading, tokens)}</h2>
      {row.body ? <p>{copy(row.body, '', tokens)}</p> : null}
      {href ? (
        <p>
          {/*
            Relative links stay in-app so the wiki does not reload; anything
            with a scheme is somebody else's site and leaves.
          */}
          {href.startsWith('/') ? (
            <Link href={href}>{row.linkLabel || href}</Link>
          ) : (
            <a href={href} rel="nofollow noopener noreferrer" target="_blank">
              {row.linkLabel || href}
            </a>
          )}
        </p>
      ) : null}
    </div>
  )
}
