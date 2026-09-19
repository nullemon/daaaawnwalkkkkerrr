import type { Author, Media } from '@/payload-types'
import { getSiteSettings } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { leadSentences } from '@/lib/seo'
import { hub } from '@/lib/urls'

/**
 * Who wrote this, and when it was last looked at.
 *
 * Only guides carry one. A record page — a quest, an item, a region — has no
 * byline and never has: it is a compiled fact sheet rather than a piece of
 * writing, and putting a name on it would claim authorship of the game's own
 * data. Guides are written, so guides are signed.
 *
 * ## `provisional` does nothing here, and that is deliberate
 *
 * The contributor roster ships as placeholders with `provisional` ticked. This
 * component does not read the flag: a byline prints the name on the record,
 * placeholder or not.
 *
 * That is a decision rather than an oversight, and it replaced an earlier one
 * where the flag swapped the name for the editorial team, hid the profile from
 * search and dropped the author out of the Article markup — three behaviours
 * hanging off one editorial checkbox, so a real contributor stayed invisible
 * until somebody remembered to untick it, and nobody remembers.
 *
 * The failure mode that leaves behind is a claim about a person who does not
 * exist, printed on 394 guides. The answer is not to print a warning 394 times
 * — the marker belongs where a reader who wants to know who wrote this
 * actually goes, which is the profile the byline links to. `/authors/[slug]`
 * carries it, unconditionally and in code rather than as editable copy, for
 * the same reason `LegalGap` is in code: a warning the person being warned can
 * edit away is not a warning. See `docs/COPY.md`.
 *
 * **Anything that claims this component reads `provisional` is stale.** Four
 * separate comments did, for as long as 36 of 36 contributors were
 * placeholders and not one page said so.
 *
 * No avatar placeholder either: a blank circle beside a name looks like a
 * broken image rather than a person.
 *
 * ## The portrait is opt-in, and the article does not ask for it
 *
 * `avatar` defaults to off. On the masthead of a guide a 34px monogram sits
 * directly beside a 40px headline and competes with it for the same glance,
 * and the owner asked for it gone; a contributor profile or a card-sized
 * credit is a different slot and is welcome to pass `avatar`.
 *
 * It is a prop rather than a deletion because the picture is real data that a
 * caller may legitimately want, and because a caller that does ask has to read
 * the author at **depth 2** — the upload hangs off the author relationship, so
 * at depth 1 it arrives as a number and this renders nothing at all, silently.
 */
export async function Byline({
  author,
  published,
  updated,
  bio = false,
  avatar: withAvatar = false,
  checkedBasis,
  children,
}: {
  author?: Author | number | string | null
  /**
   * Print the author's portrait beside the credit.
   *
   * Off by default. Requires the caller to have read the author at depth 2 —
   * see the note above.
   */
  avatar?: boolean
  /**
   * Print the author's own one-line bio under the credit.
   *
   * Opt-in, and the guide route is the only caller that asks. A byline in a
   * table row or beside a card wants a name and a date; the top of an article
   * is the one place a reader is deciding whether to believe a person, which
   * is where a line about who they are earns its space. Blank bio prints
   * nothing, like everything else here.
   */
  bio?: boolean
  /**
   * Anything that belongs on the far side of the same row — the share links,
   * a reading estimate.
   *
   * A prop rather than a wrapper in the route, because the row has to collapse
   * as one thing on a phone and two siblings in a flex container cannot agree
   * on that between them.
   */
  children?: React.ReactNode
  /*
    The day the article went up, from the guide's own `published` field.

    Never `createdAt`. The database is reproducible from seed by design, so
    `createdAt` is the date of the last `pnpm db:reset` — publishing it would
    date every guide on the network to whenever somebody last rebuilt. Same
    trap on the other side: `updatedAt` moves when a seeder rewrites a row, so
    it cannot stand in for `updated` either. See `src/lib/guide-dates.ts`.
  */
  published?: string | null
  updated?: string | null
  /**
   * Where `updated` came from — `guideDates`' `basis`, passed straight through.
   *
   * It changes one word, and the word is the whole point. For a guide with no
   * editorial `updated` field the date is the newest day one of the page's own
   * citations was read, which is a real fact about the sources and *not* a
   * review anybody performed. "Last checked" over that date claims an
   * editorial pass that did not happen, in the line a reader uses to decide
   * how stale the page is — the same class of overstatement as a default
   * fact-check sentence, which `ArticleMeta` refuses for the same reason.
   *
   * `sources` prints "Sources last read" instead. Anything else keeps "Last
   * checked", because an editor who typed a date into the Provenance tab did
   * check it.
   */
  checkedBasis?: 'editorial' | 'sources' | 'none'
}) {
  const settings = await getSiteSettings()
  const person = author && typeof author === 'object' ? (author as Author) : null
  /*
    Three states, not two, and the middle one is the one that bites.

      person          the relationship resolved — print the name
      author, no doc  an id came back unpopulated, i.e. the caller read at
                      depth 0. There *is* an author; we just cannot name them,
                      so crediting the team here would be a false statement
                      about a page that is signed. Print the date alone.
      no author       genuinely unsigned — this is what `bylineTeamFallback`
                      is for.

    The middle and last cases were collapsed into `const named = person`, which
    made the team branch below unreachable and the Site settings field labelled
    "Byline when nobody is named" inert: it saved, and changed nothing on any
    page. A control that is present, reachable and useless is worse than no
    control, because somebody will set it and believe it took.
  */
  const unsigned = !author
  const avatar =
    person?.avatar && typeof person.avatar === 'object' ? (person.avatar as Media) : null
  const checked = updated ? new Date(updated) : null
  const first = published ? new Date(published) : null

  /*
    Who the page is credited to when nobody is named.

    The editable line wins outright, including over `maintainer` — a field
    labelled "Byline when nobody is named" that quietly loses to another field
    on a different tab is a control that is present, reachable and useless.
    Left blank it falls back to exactly what shipped: the maintainer if there
    is one, otherwise the team, named after the site.
  */
  const team = copy(
    settings.bylineTeamFallback,
    settings.maintainer || 'the {site} team',
    { site: settings.siteName ?? 'editorial' },
  )

  if (!author && !checked && !first && !children) return null

  const written = (value: Date) =>
    value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  /*
    Both dates, each only if it exists.

    `updated` is not filled in from `published`. A guide that has never been
    re-checked should say nothing about being re-checked — repeating the
    publication date under the words "last checked" is a claim that somebody
    went back to the sources, which is exactly the fabricated editorial history
    this site cannot afford.
  */
  const date =
    first || checked ? (
      <span className="byline-date">
        {first ? (
          <time dateTime={first.toISOString().slice(0, 10)}>Published {written(first)}</time>
        ) : null}
        {first && checked ? ' · ' : null}
        {checked ? (
          <time dateTime={checked.toISOString().slice(0, 10)}>
            {checkedBasis === 'sources' ? 'Sources last read' : 'Last checked'} {written(checked)}
          </time>
        ) : null}
      </span>
    ) : null

  return (
    <div className="byline">
      {person ? (
        <>
          {withAvatar && avatar?.url ? (
            <img
              className="byline-avatar"
              src={avatar.url}
              alt=""
              width={34}
              height={34}
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <span className="byline-text">
            <span>
              By <a href={hub(`/authors/${person.slug}`)}>{person.name}</a>
              {person.role ? <span className="byline-role"> · {person.role}</span> : null}
            </span>
            {date}
            {/*
              An excerpt, not the whole bio.

              `bio` allows 600 characters and the seeded roster uses most of
              them, which at the top of an article is five lines of somebody
              else's CV between the headline and the first sentence.

              `leadSentences` rather than `clamp`, because this slot wants a
              whole sentence and `clamp` wants a full budget: clamp stops at a
              sentence end only past 60% of its limit, so a bio whose opening
              sentence is short printed that sentence, most of the next one,
              and `as every…`. Every one of the thirty-six seeded bios has
              exactly that shape.

              It is a server-side cut either way, never a CSS line-clamp. A
              clamp *hides* text: it is still in the document, still read out
              by a screen reader, and invisible to anyone looking at the page.
              That is `4206c56` in a new place.

              Nothing is lost either way: the name directly above links to the
              profile that carries the bio in full.
            */}
            {bio && person.bio ? (
              <span className="byline-bio">{leadSentences(person.bio, 200)}</span>
            ) : null}
          </span>
        </>
      ) : unsigned ? (
        <span className="byline-text">
          <span>
            Compiled and checked by {team}
            <span className="byline-role"> · no single author is claimed for this page</span>
          </span>
          {date}
        </span>
      ) : (
        <span className="byline-text">{date}</span>
      )}
      {children ? <span className="byline-aside">{children}</span> : null}
    </div>
  )
}
