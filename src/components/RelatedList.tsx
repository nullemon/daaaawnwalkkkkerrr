import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { getUi } from '@/lib/ui'

export type RelatedItem = {
  id: string | number
  title: string
  href: string
  /** One line under the title. Kept short — this is an index, not a summary. */
  sub?: string | null
  /** Right-aligned marker: a segment cost, a rarity, a phase. */
  meta?: ReactNode
}

/**
 * "What is here" — the records that point at the one you are reading.
 *
 * A region page that names sixteen quests but not the four items found in it
 * is a dead end, and the reader has to go back to an index and filter. Every
 * relationship in the schema is already an edge worth walking in both
 * directions; this renders one side of it.
 *
 * Renders nothing when the list is empty rather than an empty box, because a
 * region with no catalogued enemies is a gap in the data, not a section of the
 * page — and `EntityImage` sets the precedent for staying silent.
 */
export async function RelatedList({
  heading,
  icon,
  items,
  note,
  emptyNote,
  href,
}: {
  heading: string
  icon?: IconName
  items: RelatedItem[]
  /** Shown above the list when there is something worth saying about it. */
  note?: string
  /** Shown *instead of* the list when it is empty. Omit to hide the section. */
  emptyNote?: string
  /** "See all" target for the index this list is drawn from. */
  href?: string
}) {
  if (items.length === 0 && !emptyNote) return null

  const ui = await getUi()

  return (
    <section className="section">
      <div className="section-head">
        <h2>
          {icon ? <Icon name={icon} size={17} className="ic" /> : null}
          {heading}
        </h2>
        {/*
          Three separate jobs that were one `.eyebrow` between them: the count
          is a micro-label, the link is an action, and the mid-dot between them
          is punctuation. The dot used to be a string in this file — a
          reader-visible character in a component, which is the thing
          docs/COPY.md exists to keep out — and `.metarow` generates it now.
        */}
        <span className="metarow">
          {items.length > 0 ? <span className="eyebrow">{items.length}</span> : null}
          {/*
            No items, no "see all", and the reason is a 404 rather than tidiness.

            All sixteen section indexes answer 404 on a collection this wiki
            has no records in — an empty section is not that wiki's section,
            and the rail, the footer and the sitemap all leave it out. This
            link did not: a region page on the Onimusha wiki printed "No quest
            in the database is filed under this region yet" and offered "see
            all" beside it, pointing at `/quests`, which does not exist on a
            wiki with no quests. Three wikis, every region page on them.

            `items.length === 0` is exactly the right test rather than an
            approximation of one: these items are drawn from the collection the
            href points at, so a list with something in it proves that
            collection has a record on this wiki, and a list with nothing in it
            is the only way the index can be missing.
          */}
          {href && items.length > 0 ? (
            <Link href={href} className="cta">
              {ui.t('related.see-all')}
            </Link>
          ) : null}
        </span>
      </div>
      {note ? <p className="note">{note}</p> : null}
      {items.length === 0 ? (
        <p className="note">{emptyNote}</p>
      ) : (
        <ul className="related">
          {items.map((item) => (
            <li key={item.id}>
              <span className="related-main">
                <Link href={item.href}>{item.title}</Link>
                {item.sub ? <span className="sub">{item.sub}</span> : null}
              </span>
              {item.meta ? <span className="related-meta">{item.meta}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
