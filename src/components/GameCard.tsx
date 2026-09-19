import { releaseYear } from '@/lib/game-year'
import { ImageCredit } from './ImageCredit'
import type { Game, Media } from '@/payload-types'

/**
 * A game, named and dated, with its cover.
 *
 * Used wherever this network lists somebody's work: the games a studio made on
 * `companies.<domain>`, and the games a person is credited on at
 * `people.<domain>`. Both listed a bare title and a paragraph of summary, so a
 * reader looking at a studio with eleven games got eleven identical grey
 * rectangles and no way to recognise any of them.
 *
 * ## The year is part of the name here
 *
 * A studio's page is a body of work, and a body of work without dates is a list
 * in no order that anybody can see. `releaseYear` decides when a year may be
 * printed at all — an unconfirmed date prints none, because "(2026)" beside a
 * title reads as a fact and a moved window is not one.
 *
 * ## The cover is the game's own, or there is none
 *
 * `profile.poster` is the cover art, harvested from the game's Wikipedia
 * article with its licence recorded. Seven of fifteen games have one; a game
 * with no cover renders the card it has always rendered rather than a
 * placeholder, because a grey box labelled "no image" is worse than a title.
 *
 * **No fallback to anything else.** The poster is the one picture on this card
 * and it belongs to this game or it is absent — the rule `seed:guide-images`
 * had to learn the hard way when its "no art of its own" branch illustrated two
 * wikis with a third game's press kit under the wrong copyright line.
 *
 * `ImageCredit` rather than a bare `<img>`: these are non-free covers used
 * under a fair-dealing argument, and that argument rests on the credit being
 * printed. The credit is never trimmed to fit — see the component.
 */
export function GameCard({
  game,
  href,
  poster,
}: {
  game: Game
  /** Absolute: every wiki is its own origin. */
  href: string
  /** Resolved separately, because the lists that use this read at depth 1. */
  poster?: Media | null
}) {
  const year = releaseYear(game)
  const name = game.shortTitle || game.title

  return (
    /*
      A plain anchor, not `next/link`: every wiki is its own origin, so there is
      no client-side navigation to be had and a prefetch would only fail quietly.
    */
    <a className="card entity-card gamecard" href={href}>
      {poster?.url ? (
        <span className="gamecard-art">
          <img
            src={poster.sizes?.card?.url ?? poster.url}
            alt=""
            loading="lazy"
            decoding="async"
          />
          <ImageCredit credit={poster.credit} slot="narrow" />
        </span>
      ) : null}
      <span className="gamecard-body">
        <span className="card-top">
          <h3>
            {name}
            {year ? <span className="gamecard-year"> ({year})</span> : null}
          </h3>
        </span>
        {game.summary ? <p className="note">{game.summary}</p> : null}
      </span>
    </a>
  )
}
