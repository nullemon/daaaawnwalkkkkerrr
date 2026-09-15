import { Icon } from './Icon'
import type { DirectoryEntry } from '@/lib/directory'
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
              {section.count} {section.label.toLowerCase()}
            </span>
          ))}
        </span>
      ) : null}
    </a>
  )
}
