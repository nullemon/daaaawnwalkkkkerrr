type Source = { title?: string | null; url?: string | null; retrieved?: string | null }

/**
 * Citations, shown in full rather than hidden behind a link. A reader who can
 * see where a claim came from can judge it themselves — and can tell us when
 * the source was wrong.
 */
export function Sources({ sources }: { sources?: Source[] | null }) {
  if (!sources?.length) return null
  return (
    <section className="sources">
      <h2 className="eyebrow">Sources</h2>
      <ul>
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`}>
            <a href={source.url ?? '#'} rel="nofollow noopener noreferrer" target="_blank">
              {source.title || source.url}
            </a>
            {source.retrieved ? (
              <span className="mono"> · retrieved {String(source.retrieved).slice(0, 10)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="note">
        Facts compiled from public sources and not verified against the game. Spotted an error?{' '}
        <a href="/corrections">Tell us</a> — corrections go straight to our review queue.
      </p>
    </section>
  )
}
