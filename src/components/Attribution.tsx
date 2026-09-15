import { getSiteSettings } from '@/lib/payload'

/**
 * The licence line for content taken from a CC-licensed wiki.
 *
 * ## Why this is not the same switch as "show sources"
 *
 * `showSources` controls whether the citation list prints under a page. That
 * is genuinely a presentation choice: the facts on a Dawnwalker record were
 * compiled by us from public sources, and whether to print the working is ours
 * to decide.
 *
 * This is different. Five hundred-odd records restate facts from Fandom and
 * Wikipedia, both CC BY-SA, and that licence **requires** attribution as a
 * condition of use. Making it optional would not be a design decision, it
 * would be using the content outside its terms — so the admin controls how
 * prominent it is, not whether it appears.
 *
 * The distinction is written into the field description too, because the
 * obvious next request is to turn it off and the reason it cannot be turned
 * off should be readable where somebody would go looking.
 */

type Source = { title?: string | null; url?: string | null; retrieved?: string | null }

/** Hosts whose content arrives under a Creative Commons licence. */
const CC_SOURCES: { test: RegExp; name: string; licence: string; url: string }[] = [
  {
    test: /\.fandom\.com/i,
    name: 'Fandom',
    licence: 'CC BY-SA',
    url: 'https://www.fandom.com/licensing',
  },
  {
    test: /wikipedia\.org/i,
    name: 'Wikipedia',
    licence: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
]

export async function Attribution({ sources }: { sources?: Source[] | null }) {
  if (!sources?.length) return null

  const settings = await getSiteSettings()
  // Default to showing it when the setting has never been touched: the safe
  // state for a licence condition is on.
  const style = (settings.attributionStyle as string) ?? 'compact'
  if (style === 'hidden') return null

  const licensed = sources
    .map((source) => {
      const match = CC_SOURCES.find((candidate) => candidate.test.test(source.url ?? ''))
      return match ? { source, ...match } : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  if (licensed.length === 0) return null

  return (
    <aside className="attribution" aria-label="Content attribution">
      {licensed.map((entry) => (
        <p key={entry.source.url ?? entry.name} className="note">
          Some facts on this page are restated from{' '}
          <a href={entry.source.url ?? entry.url} rel="noopener noreferrer" target="_blank">
            {entry.source.title ?? entry.name}
          </a>{' '}
          on {entry.name}
          {entry.source.retrieved ? `, read ${entry.source.retrieved}` : ''}, and used under{' '}
          <a href={entry.url} rel="license noopener noreferrer" target="_blank">
            {entry.licence}
          </a>
          .{' '}
          {style === 'full'
            ? 'The wording on this page is our own; only the facts are reused. Reusing this page carries the same licence onward.'
            : null}
        </p>
      ))}
    </aside>
  )
}
