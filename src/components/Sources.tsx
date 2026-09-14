import { getSiteSettings } from '@/lib/payload'

type Source = { title?: string | null; url?: string | null; retrieved?: string | null }

/**
 * Citations, and the standing caveat that goes with them.
 *
 * The caveat always shows: a reader needs to know the facts were compiled from
 * public sources rather than verified against the game, and needs somewhere to
 * report an error. The link list is the optional half — it is for anyone who
 * wants to audit a specific claim, and Site settings → Content decides whether
 * to print it.
 *
 * Sources are stored on every record and `src/seed/import.ts` still refuses any
 * record without one, whichever way the switch is set. Hiding the list does not
 * make the site less sourced; it makes the page shorter.
 */
export async function Sources({ sources }: { sources?: Source[] | null }) {
  const settings = await getSiteSettings()
  const show = Boolean(settings.showSources) && Boolean(sources?.length)

  return (
    <section className="sources">
      {show ? (
        <>
          <h2 className="eyebrow">Sources</h2>
          <ul>
            {sources!.map((source, index) => (
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
        </>
      ) : null}
      <p className="note">
        Facts compiled from public sources and not verified against the game. Spotted an error?{' '}
        <a href="/corrections">Tell us</a> — corrections go straight to our review queue.
      </p>
    </section>
  )
}
