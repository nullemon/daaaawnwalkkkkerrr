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
 * The owner has since set it to hidden by default, which is their call to
 * make and not this file's to override. What this file can do is keep the
 * reason visible where somebody would go looking — the admin field carries
 * it, and so does this comment: with the line off and no credit elsewhere,
 * the Fandom- and Wikipedia-derived facts are being used outside the terms
 * they arrived under. A site-wide credits page is the usual way to satisfy
 * that without a line on every page.
 */

type Source = { title?: string | null; url?: string | null; retrieved?: string | null }

/**
 * The date a source was read, as a reader would write it.
 *
 * Payload stores a date field as a full ISO timestamp, so the raw value put
 * "read 2026-09-15T00:00:00.000Z" in the middle of an English sentence on
 * every attributed page. The midnight Z is an artefact of a day-only picker,
 * not a time anybody recorded, so it has no business being shown.
 */
const readOn = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

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

type Licensed = {
  source: Source
  name: string
  licence: string
  url: string
}

/**
 * Fill the editable template, turning two of the tokens into links.
 *
 * Splitting on the token pattern rather than replacing into a string keeps
 * this out of `dangerouslySetInnerHTML`: the template is admin-editable, and
 * an admin-editable string that reaches the DOM as markup is a stored-XSS
 * hole waiting for the first editor account that should not have had one.
 * Each piece is rendered as a React child, so any angle brackets somebody
 * types come out as text.
 *
 * An unknown token is left alone rather than blanked - somebody who typos
 * `{soruce}` should see their typo, not a sentence with a hole in it.
 */
const TOKEN = /(\{(?:source|site|date|licence)\})/g

function fill(template: string, entry: Licensed) {
  return template.split(TOKEN).map((piece, index) => {
    switch (piece) {
      case '{source}':
        return (
          <a
            key={index}
            href={entry.source.url ?? entry.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {entry.source.title ?? entry.name}
          </a>
        )
      case '{site}':
        return <span key={index}>{entry.name}</span>
      case '{date}':
        return (
          <span key={index}>
            {entry.source.retrieved ? readOn(entry.source.retrieved) : 'an unrecorded date'}
          </span>
        )
      case '{licence}':
        return (
          <a key={index} href={entry.url} rel="license noopener noreferrer" target="_blank">
            {entry.licence}
          </a>
        )
      default:
        return <span key={index}>{piece}</span>
    }
  })
}

export async function Attribution({ sources }: { sources?: Source[] | null }) {
  if (!sources?.length) return null

  const settings = await getSiteSettings()
  // Off unless switched on. See the note at the top of this file for what
  // that means for the licence; it is a decision taken with the reason in
  // front of it rather than by accident.
  const style = (settings.attributionStyle as string) ?? 'hidden'
  if (style === 'hidden') return null

  const licensed = sources
    .map((source) => {
      const match = CC_SOURCES.find((candidate) => candidate.test.test(source.url ?? ''))
      return match ? { source, ...match } : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  if (licensed.length === 0) return null

  const template =
    (settings.attributionText as string)?.trim() ||
    'Some facts on this page are restated from {source} on {site}, read {date}, and used under {licence}.'

  return (
    <aside className="attribution" aria-label="Content attribution">
      {licensed.map((entry) => (
        <p key={entry.source.url ?? entry.name} className="note">
          {fill(template, entry)}{' '}
          {style === 'full'
            ? 'The wording on this page is our own; only the facts are reused. Reusing this page carries the same licence onward.'
            : null}
        </p>
      ))}
    </aside>
  )
}
