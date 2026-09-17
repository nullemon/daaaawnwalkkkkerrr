import { Icon } from './Icon'
import type { DirectoryEntry } from '@/lib/directory'
import { editorialScore } from '@/lib/ratings'
import { releaseLine } from '@/lib/directory'

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
        </span>
      ) : null}

      <span className="card-top">
        <h3>{game.shortTitle || game.title}</h3>
        {game.status === 'building' ? <span className="chip">In progress</span> : null}
        {/*
          Our score, on the card. `editorialScore` returns nothing unless the
          reasoning is stored with it, so a card can never show a bare number
          the wiki behind it does not explain.
        */}
        {verdict ? (
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
