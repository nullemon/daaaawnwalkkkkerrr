import type { ReactNode } from 'react'
import type { Author } from '@/payload-types'
import { hub } from '@/lib/urls'

/**
 * Where an article says who wrote it, when, and what it was built from.
 *
 * ## Why this exists
 *
 * A guide carried a byline and nothing else. No publication date, no review
 * statement, and its citations floating at the foot under a caveat with no
 * heading — so the only provenance a reader or a crawler could find was a
 * name. That is the half of an article that decides whether anyone believes
 * the other half, and on four hundred pages it was missing.
 *
 * Everything here is optional and **a blank field prints nothing**. That is
 * not politeness, it is the rule the rest of this repository runs on: a row
 * reading "Reviewed by —" is a claim about work nobody did, dressed as a
 * layout placeholder. `FactPanel` drops a fact with no value for the same
 * reason. If every field is blank, all that is left is the standing caveat the
 * children carry, which is the honest state of a guide nobody has reviewed.
 *
 * ## Why there is no default fact-check sentence
 *
 * The obvious convenience — a site-wide "Fact checked by our editorial team"
 * with a per-guide override — would print a claim about work nobody has done
 * on every article on the network, in the exact place a reader goes to decide
 * whether to trust the page. The owner's words were "after we are done we will
 * do a proper fact check", so today the true value is nothing and the field is
 * empty on every guide. Do not give this a default.
 *
 * ## Dates
 *
 * Never the row's `createdAt`/`updatedAt`. See `src/lib/guide-dates.ts`:
 * `updatedAt` moves when a seeder rewrites a row and `createdAt` is the date
 * of the last `pnpm db:reset`, so publishing either would date every guide on
 * the network to this afternoon.
 *
 * What the caller passes instead comes from `guideDates`: `published` is an
 * editor's field and nothing else writes it, and `updated` is either an
 * editor's or the newest day one of the page's own citations was read.
 * `checkedBasis` says which, and the row's label follows it — see the prop.
 *
 * ## Strings
 *
 * The labels are in code rather than in `ui-strings`. They are interface
 * furniture and belong in `src/lib/ui-registry.ts` with the rest; that file is
 * being edited elsewhere as this is written, so adding them is a follow-up
 * rather than a conflict.
 */

/** A day as a reader writes it, with the machine-readable form beside it. */
function Day({ value }: { value: string }) {
  const date = new Date(value)
  /*
    An unparseable date prints as stored rather than as "Invalid Date". The
    value came from a picker so this should not happen; when it does, the raw
    string is something somebody can recognise and fix.
  */
  if (Number.isNaN(date.getTime())) return <>{value}</>
  return (
    <time dateTime={date.toISOString().slice(0, 10)}>
      {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
    </time>
  )
}

/** The author relationship, resolved, or null when it came back as an id. */
const resolve = (value: unknown): Author | null =>
  value && typeof value === 'object' ? (value as Author) : null

export type Review = {
  statement?: string | null
  reviewer?: Author | number | string | null
  checkedOn?: string | null
}

export function ArticleMeta({
  published,
  updated,
  checkedBasis,
  author,
  review,
  children,
}: {
  published?: string | null
  updated?: string | null
  /**
   * Where `updated` came from — `guideDates`' `basis`.
   *
   * A generated guide has no editorial `updated` field, so its date is the
   * newest day one of its own citations was read. That is a fact, and it is
   * the fact a reader of a compiled reference page wants; it is not a review.
   * Labelling it "Last checked" would claim an editorial pass nobody made, in
   * the panel whose whole job is to say what did happen — the same thing this
   * component refuses a default fact-check sentence for.
   *
   * "Sources last read" is the row's label in that case, and it sits directly
   * above the citation list it is talking about.
   */
  checkedBasis?: 'editorial' | 'sources' | 'none'
  author?: Author | number | string | null
  review?: Review | null
  /** The citation list and the licence line, so provenance is one block. */
  children?: ReactNode
}) {
  const person = resolve(author)
  const reviewer = resolve(review?.reviewer)
  const statement = review?.statement?.trim()

  /*
    Rows, built then filtered, rather than a chain of ternaries in the markup.
    The filter is the whole behaviour of this component and it should be one
    readable line rather than five places that each have to remember it.
  */
  const rows: { label: string; value: ReactNode }[] = [
    ...(published ? [{ label: 'Published', value: <Day value={published} /> }] : []),
    ...(updated
      ? [
          {
            label: checkedBasis === 'sources' ? 'Sources last read' : 'Last checked',
            value: <Day value={updated} />,
          },
        ]
      : []),
    ...(person
      ? [
          {
            label: 'Written by',
            value: (
              <>
                {/*
                  `hub()`, not a bare path. Contributor profiles exist once at
                  the apex; a relative link from a wiki resolves to
                  `dawnwalker.<domain>/authors/<slug>`, which 404s.
                */}
                <a href={hub(`/authors/${person.slug}`)}>{person.name}</a>
                {person.role ? <span className="note"> · {person.role}</span> : null}
              </>
            ),
          },
        ]
      : []),
  ]

  // Any one of the three is enough to show the block; all three blank shows
  // nothing at all, which is every guide on the network today.
  const hasReview = Boolean(statement || reviewer || review?.checkedOn)

  return (
    <section className="panel factpanel" aria-label="About this article">
      <div className="panel-head">
        <h2>About this article</h2>
      </div>

      {rows.length > 0 ? (
        <dl className="factlist">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {hasReview ? (
        <p className="panel-note">
          {statement ? <span>{statement} </span> : null}
          {reviewer ? (
            <span>
              Checked by <a href={hub(`/authors/${reviewer.slug}`)}>{reviewer.name}</a>
              {review?.checkedOn ? (
                <>
                  {' '}
                  on <Day value={review.checkedOn} />
                </>
              ) : null}
              .
            </span>
          ) : review?.checkedOn ? (
            <span>
              Checked on <Day value={review.checkedOn} />.
            </span>
          ) : null}
        </p>
      ) : null}

      {children}
    </section>
  )
}
