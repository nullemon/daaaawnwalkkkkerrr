import { Icon } from './Icon'
import { getUi } from '@/lib/ui'
import { CATALOGUE_ROLE_LABEL } from '@/lib/companies-copy'

/**
 * A company's body of work, newest first.
 *
 * ## Why this is not a `<table>`
 *
 * The house table is `.tablewrap` + `<table>`, which puts a 560px floor under
 * the table and scrolls it sideways. That is right for a stat grid of six short
 * numbers and wrong here: a studio's catalogue runs to sixty rows of
 * mixed-shape text — a platform list is forty characters, a price is five — and
 * a reader scanning it on a phone would be dragging the page left and right for
 * every one of them. This is a two-cell grid instead, what the thing is against
 * what it costs, collapsing to one column with no horizontal scroll at all.
 *
 * ## What is not printed
 *
 * Every cell is dropped when the source did not state it. A dash in a price
 * column reads as "free" to one reader and "unknown" to the next, and neither
 * is a claim this page has any business making — the same rule `FactPanel`
 * follows, for the same reason.
 *
 * No review score, from here or anywhere else. This network publishes its own
 * rating per game and that is the only one a reader should meet; a borrowed
 * number in a column of sixty rows reads as this site's verdict on sixty
 * games, which is a claim nobody here made. A catalogue row shows what the
 * thing is and what it costs.
 *
 * The component itself renders only the list. Its heading, the note that dates
 * the prices and the sentence shown when there is nothing here at all are
 * editable copy and belong to the page.
 */

export type CatalogueRow = {
  key: string
  title: string
  year?: string | null
  role?: string | null
  priceText?: string | null
  isFree?: boolean | null
  reviews?: string | null
  genre?: string | null
  platforms?: string | null
  /** Resolved by the page: a wiki on this network, or an outbound store page. */
  href?: string | null
  /** True when `href` is one of ours, which decides the `rel` and the badge. */
  internal: boolean
}

/**
 * Newest first, with undated rows last rather than sorted as year zero.
 *
 * `year` is free text — "2023", "2023-10-27", "TBA", "" — because the sources
 * write it however they like and the field takes them at their word. A row
 * nobody dated is not a row from the dawn of time, so it keeps its stored order
 * at the bottom instead of being handed a number it never had.
 */
const yearOf = (value?: string | null): number | null => {
  const found = /\b(1[89]\d{2}|2\d{3})\b/.exec(value ?? '')
  return found ? Number(found[1]) : null
}

export const sortCatalogue = <T extends { year?: string | null }>(rows: T[]): T[] =>
  rows
    .map((row, index) => ({ row, index, year: yearOf(row.year) }))
    .sort((a, b) => {
      if (a.year === b.year) return a.index - b.index
      if (a.year === null) return 1
      if (b.year === null) return -1
      return b.year - a.year
    })
    .map((entry) => entry.row)

export async function CompanyTitles({
  rows,
  coveredLabel,
}: {
  rows: CatalogueRow[]
  /** The badge on a row that links into one of this network's wikis. */
  coveredLabel: string
}) {
  if (rows.length === 0) return null
  const ui = await getUi()

  return (
    <ol className="catalogue">
      {sortCatalogue(rows).map((row) => {
        /*
          Role, genre and platforms on one line, joined only across the ones
          that exist. Building the string with separators in the markup leaves a
          leading "·" on every row whose source named no genre, which is most of
          them.
        */
        const meta = [
          row.role ? CATALOGUE_ROLE_LABEL[row.role] ?? row.role : null,
          row.genre?.trim() || null,
          row.platforms?.trim() || null,
        ].filter(Boolean)

        /*
          `isFree` wins over `priceText`, because a free-to-play listing shows a
          price of nothing and the store's own word for that is not "$0.00".
          The wording is the network's existing one for the same fact on a game
          factsheet, so the two hosts cannot disagree about it.
        */
        const price = row.isFree ? ui.t('profile.free') : row.priceText?.trim() || null
        const reviews = row.reviews?.trim() || null

        return (
          <li className="catalogue-row" key={row.key}>
            <div className="catalogue-main">
              <p className="catalogue-head">
                {row.year ? <span className="catalogue-year">{row.year}</span> : null}
                {row.href ? (
                  row.internal ? (
                    /*
                      A plain anchor, not `next/link`: a wiki is its own origin,
                      so there is no client-side navigation to be had and a
                      prefetch would only fail quietly. No `nofollow` either —
                      this one is ours.
                    */
                    <a className="catalogue-title" href={row.href}>
                      {row.title}
                    </a>
                  ) : (
                    <a
                      className="catalogue-title"
                      href={row.href}
                      rel="nofollow noopener noreferrer"
                      target="_blank"
                    >
                      {row.title}
                      <Icon className="ic" name="external" size={12} />
                    </a>
                  )
                ) : (
                  /* Listed unlinked rather than dropped. A record that quietly
                     disappears from a page is the failure this repository has
                     been bitten by more than once. */
                  <span className="catalogue-title">{row.title}</span>
                )}
                {row.internal ? <span className="catalogue-here">{coveredLabel}</span> : null}
              </p>
              {meta.length > 0 ? <p className="catalogue-meta">{meta.join(' · ')}</p> : null}
            </div>

            {price || reviews ? (
              <div className="catalogue-stats">
                {price ? (
                  <p className="catalogue-stat">
                    <span className="catalogue-stat-label">{ui.t('profile.price')}</span>
                    <b>{price}</b>
                  </p>
                ) : null}
                {/* Unlabelled on purpose: "Very Positive (12,481)" says what it
                    is, and a label above it would be longer than the value. */}
                {reviews ? <p className="catalogue-reviews">{reviews}</p> : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
