import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

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
export function RelatedList({
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

  return (
    <section className="section">
      <div className="section-head">
        <h2>
          {icon ? <Icon name={icon} size={17} className="ic" /> : null}
          {heading}
        </h2>
        <span className="eyebrow">
          {items.length > 0 ? items.length : null}
          {href ? (
            <>
              {items.length > 0 ? ' · ' : ''}
              <Link href={href}>see all</Link>
            </>
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
