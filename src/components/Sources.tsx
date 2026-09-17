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

function caveat(template: string, correctionsHref: string) {
  return splitTokens(template).map((part, index) => {
    if ('text' in part) return <span key={index}>{part.text}</span>
    if (part.token === 'corrections')
      return (
        <a key={index} href={correctionsHref}>
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
 *
 * `cite` is the one exception, and it is not a way around the switch — see its
 * own note below.
 */
export async function Sources({
  sources,
  /*
    Where "Tell us" goes from the host this is rendered on.

    `/corrections` is a `[game]` route and exists on a wiki. It does not exist
    on `companies.` or `people.`, where the proxy maps the path onto that
    host's own first segment - so `/corrections` fell into `[slug]`, found no
    record and 404'd, on all 890 profiles. The caveat always renders, so this
    was a promise of a review queue and a dead link under it on every page of
    two hosts. A caller that is not on a wiki passes the address that does
    exist for it.
  */
  correctionsHref = '/corrections',
  /*
    Print the citation even while `showSources` is off. Two call sites, both
    outside `[game]`: `companies/[slug]` and `people/[slug]`.

    `showSources` is a presentation decision about the network's *own compiled
    records* — a quest, an item, a region — where the standing caveat carries
    the part a reader needs and the list is for whoever wants to audit a
    specific claim. That reasoning does not reach these two hosts:

    - The companies index tells every reader "Every figure on a profile comes
      from that company's own article, with the date it was read." With the
      list off, no profile showed a citation or a read-date at all, so the
      index was describing a page that did not exist. That copy lives in
      `src/lib/companies-copy.ts`; making the page true was the honest half of
      the fix.
    - A person profile publishes a living person's date of birth and
      birthplace. CLAUDE.md's people-host section says these pages "change the
      standard", and an unsourced claim about a living person is the exact
      thing this repository's rules exist to prevent.

    So this is a scoped, named exception rather than a bypass: it turns nothing
    on for the other ~1,700 pages, it does not read or write `showSources`, and
    switching `showSources` on still adds the list everywhere as before. If the
    owner would rather these two hosts stay bare, the fix is to reword the
    companies lede and drop this prop — not to leave the promise standing.
  */
  cite = false,
}: {
  sources?: Source[] | null
  correctionsHref?: string
  cite?: boolean
}) {
  const settings = await getSiteSettings()
  const show = (Boolean(settings.showSources) || cite) && Boolean(sources?.length)

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
      <p className="note">{caveat(pick(settings.sourcesCaveat, CAVEAT), correctionsHref)}</p>
    </section>
  )
}
