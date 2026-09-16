import { getSiteSettings } from '@/lib/payload'
import { pick, splitTokens } from '@/lib/copy'

type Source = { title?: string | null; url?: string | null; retrieved?: string | null }

/**
 * The caveat, with its link rendered rather than pasted.
 *
 * The sentence is admin-editable and it contains a link, which is the one
 * combination that must not go through `dangerouslySetInnerHTML`: an editable
 * string that reaches the DOM as markup is a stored-XSS hole waiting for the
 * first editor account that should not have had one. So `{corrections}` is a
 * token and the anchor is a React child, the same way the attribution
 * template handles `{source}`.
 *
 * A token nobody recognises is printed as typed. `{corrcetions}` visible on
 * the page is a typo somebody fixes in a minute; silently swallowing it is a
 * page with no way to report an error on it and nothing saying why.
 */
const CAVEAT =
  'Facts compiled from public sources and not verified against the game. Spotted an error? {corrections} — corrections go straight to our review queue.'

function caveat(template: string) {
  return splitTokens(template).map((part, index) => {
    if ('text' in part) return <span key={index}>{part.text}</span>
    if (part.token === 'corrections')
      return (
        <a key={index} href="/corrections">
          Tell us
        </a>
      )
    return <span key={index}>{`{${part.token}}`}</span>
  })
}

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
      <p className="note">{caveat(pick(settings.sourcesCaveat, CAVEAT))}</p>
    </section>
  )
}
