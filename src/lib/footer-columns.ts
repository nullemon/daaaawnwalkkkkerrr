/**
 * The footer site map, and what an editor's own columns do to it.
 *
 * ## Why this is a merge and not a replacement
 *
 * Nothing on this network authors a link to a section. The rail, the footer
 * and the sitemap are all derived from `sectionsFor`, which returns the
 * sections a wiki has records in — so the footer is not a decoration, it is
 * one of the two places a page becomes reachable at all. `/about`,
 * `/corrections` and `/requests` have no other inbound link anywhere on a wiki
 * host, and several hub pages are in the same position.
 *
 * `settings.footerColumns` is one field on the **network** global, and it used
 * to replace the built-in columns outright the moment a single one was filled.
 * Two things followed from that, neither of which errored:
 *
 * - **Nine pages lost their only inbound link on one admin save.** No warning,
 *   nothing in any log, and every check stayed green because the pages still
 *   render — the state `auditNetwork` reports for empty section indexes,
 *   arriving through the door an editor walks through.
 * - **The columns are per host and the field is not.** The hub's map, each
 *   wiki's section list and the companies host's list are three different
 *   things; one stored array replaced all ten. An editor writing "Wikis /
 *   Guides / Tools" for the hub silently served the hub's wording as the
 *   Dawnwalker wiki's section list on every page of all eight wikis. That is
 *   the `footerNote` defect exactly — one network field that reads as a
 *   sentence about one site.
 *
 * So an edited column is **added to** the built-in map rather than put in its
 * place, which is the rule `companies/layout.tsx` already states for its own
 * "This site" column and the reason it states it.
 *
 * ## What an editor can and cannot do
 *
 * Can: add a column, and add links to a column that already exists by giving
 * it the same heading. Order is built-ins first, then anything new.
 *
 * Cannot: remove a built-in link. That is the deliberate half. The thing being
 * protected is the set of pages with exactly one inbound link, and a control
 * that can silently orphan nine pages is not worth the convenience of hiding
 * one of them. Anything genuinely unwanted is a code change, where it is
 * visible, reviewed and one commit.
 *
 * Nothing here is game-scoped or host-aware: it takes the built-in map its
 * caller was going to render and the stored field, and merges them. The caller
 * is the one that knows which host it is.
 */

export type FooterColumn = {
  heading: string
  links: { label: string; href: string }[]
}

/**
 * A stored column, as Payload hands it over: every field optional, because a
 * row half-typed in the admin is a real state.
 */
export type StoredColumn = {
  heading?: string | null
  links?: { label?: string | null; href?: string | null }[] | null
}

/** Headings match on case and surrounding space, so "This site" finds "this site ". */
const key = (heading: string): string => heading.trim().toLowerCase()

/**
 * The stored field, cleaned up into columns worth rendering.
 *
 * A column with no links is dropped: a heading over nothing reads as a broken
 * site, and it is what a half-filled record produces — headings typed, links
 * not yet. A link with no href is dropped for the same reason; a link with no
 * label falls back to its href rather than rendering as an empty anchor
 * nobody can click.
 */
export const editedColumns = (stored: StoredColumn[] | null | undefined): FooterColumn[] =>
  (stored ?? [])
    .map((column) => ({
      heading: (column.heading ?? '').trim(),
      links: (column.links ?? [])
        .map((link) => ({ label: (link.label ?? '').trim(), href: (link.href ?? '').trim() }))
        .filter((link) => link.href !== '')
        .map((link) => ({ label: link.label || link.href, href: link.href })),
    }))
    .filter((column) => column.heading !== '' && column.links.length > 0)

/**
 * The built-in map for this host, with the editor's additions folded in.
 *
 * Deduplicated on `href` rather than on label, because the same page typed a
 * second time under a better name is still the same page and two links to it
 * in one column is the thing that looks broken. The built-in label wins, since
 * it is the one the rest of the network uses for that page.
 */
export const mergeFooterColumns = (
  builtIn: FooterColumn[],
  stored: StoredColumn[] | null | undefined,
): FooterColumn[] => {
  const edited = editedColumns(stored)
  if (edited.length === 0) return builtIn.filter((column) => column.links.length > 0)

  const merged = builtIn.map((column) => {
    const addition = edited.find((candidate) => key(candidate.heading) === key(column.heading))
    if (!addition) return column
    const seen = new Set(column.links.map((link) => link.href))
    return {
      heading: column.heading,
      links: [...column.links, ...addition.links.filter((link) => !seen.has(link.href))],
    }
  })

  const builtInHeadings = new Set(builtIn.map((column) => key(column.heading)))
  const added = edited.filter((column) => !builtInHeadings.has(key(column.heading)))

  return [...merged, ...added].filter((column) => column.links.length > 0)
}
