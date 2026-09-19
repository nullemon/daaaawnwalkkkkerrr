import { Icon } from './Icon'
import type { DirectoryEntry } from '@/lib/directory'
import { editorialScore, type EditorialScore } from '@/lib/verdict'
import { releaseLine } from '@/lib/directory'

/**
 * The score, as a badge on a card's art.
 *
 * Kept beside its only caller rather than given a file: it is four elements
 * and it exists because a number set as text in a row of chips does not read
 * as a judgement, which is the one thing this number is.
 *
 * There is no longer a line under the figure saying what it is based on, and
 * the reason is the interesting half. It used to read "outlook" on the four
 * wikis for games that are not out — an honest label on a number that should
 * not have been on a card at all, because a reader scanning eight tiles reads
 * the figure and a screenshot of one carries the figure alone. `editorialScore`
 * now returns nothing at all before a game ships, so a card either shows a
 * score somebody stands behind or shows none. The measurements for what is
 * left are beside `.score-badge` in globals.css.
 */
function ScoreBadge({ verdict }: { verdict: EditorialScore }) {
  return (
    <span className="score-badge" title={verdict.summary ?? undefined}>
      <span className="score-badge-figure">
        {verdict.score.toFixed(1)}
        <span className="score-badge-outof">/10</span>
      </span>
    </span>
  )
}

/**
 * One wiki in the directory.
 *
 * A plain anchor rather than `next/link`: every wiki is a different origin, so
 * there is no client-side navigation to be had and `Link` would only add a
 * prefetch that cannot work across hosts.
 *
 * The page count is printed even when it is small. A wiki that says "14 pages"
 * is a wiki a reader can calibrate against; one that says nothing looks like
 * it is hiding the number, and they find out anyway on the first click.
 */
export function WikiCard({ entry }: { entry: DirectoryEntry }) {
  const { game, url, pages, highlights } = entry
  const release = releaseLine(game)
  const verdict = editorialScore(game)
  const hero = typeof game.theme?.hero === 'object' ? game.theme?.hero : null

  return (
    <a
      id={game.slug}
      href={url}
      className="card wiki-card"
      style={game.theme?.accent ? ({ '--card-accent': game.theme.accent } as React.CSSProperties) : undefined}
    >
      {hero?.url ? (
        <span className="wiki-card-art">
          <img src={hero.url} alt="" loading="lazy" />
          {/*
            The score, on the art, where a reader of any games site looks for
            one. It sits inside the art rather than beside the title because
            the art is the only part of this card with room for it — and it
            has to be *inside*, because the badge is positioned against
            `.wiki-card-art` and because that is the one place the mask on the
            image cannot reach it.
          */}
          {verdict ? <ScoreBadge verdict={verdict} /> : null}
        </span>
      ) : null}

      <span className="card-top">
        <h3>{game.shortTitle || game.title}</h3>
        {game.status === 'building' ? <span className="chip">In progress</span> : null}
        {/*
          The same score for a wiki with no key art, in the inline form it has
          always had. Not a duplicate — exactly one of the two renders, which
          is why the condition names the art rather than the score.

          All eight wikis carry art today, so this branch draws nothing on any
          page that currently exists. It is here because creating the row *is*
          creating the site: a wiki added in the admin has a score before it
          has a screenshot, and a badge needs a picture to be pinned to. The
          alternative was a badge floating over the card's own ground, which
          reads as a sticker somebody forgot to remove.
        */}
        {verdict && !hero?.url ? (
          <span className="card-score" title={verdict.summary ?? undefined}>
            {verdict.score.toFixed(1)}
            <span>/10</span>
          </span>
        ) : null}
      </span>

      {game.tagline ? <p className="wiki-card-tagline">{game.tagline}</p> : null}
      {game.summary ? <p>{game.summary}</p> : null}

      <span className="wiki-card-foot">
        <span className="wiki-card-count">
          <Icon name="book" size={14} className="ic" />
          {pages.toLocaleString('en-GB')} {pages === 1 ? 'page' : 'pages'}
        </span>
        {release ? <span className="note">{release}</span> : null}
      </span>

      {highlights.length > 0 ? (
        <span className="wiki-card-sections">
          {highlights.map((section) => (
            <span key={section.label} className="chip">
              {/*
                "1 enemies". Nine lines up this same component picks between
                "page" and "pages" and then skipped it here, and the count of 1
                is not a corner: `directory.ts` keeps every section with at
                least one record, and Silent Hill: Townfall holds exactly one
                enemy. The singular comes from `SECTIONS.kind` rather than from
                trimming an "s", so "Court Activities" and "Skill trees" are
                right too.
              */}
              {section.count} {(section.count === 1 ? section.kind : section.label).toLowerCase()}
            </span>
          ))}
        </span>
      ) : null}
    </a>
  )
}
