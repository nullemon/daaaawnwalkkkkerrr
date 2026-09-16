import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function EntityCard({
  href,
  title,
  summary,
  badges,
  icon,
  image,
  thumbFit = 'cover',
  headingLevel = 3,
}: {
  href: string
  title: string
  summary?: string | null
  badges?: ReactNode
  icon?: IconName
  /** Real game art once a record has some; the icon stands in until then. */
  image?: { url?: string | null; alt?: string | null } | null
  /*
    Art fills the thumb; a logo must not. Most company marks arrive on a
    transparent background and are wider than they are tall, so cropping one
    to a card thumbnail cuts the wordmark in half.
  */
  thumbFit?: 'cover' | 'contain'
  /*
    An index that is a bare grid has no <h2> between its <h1> and these cards,
    so a card heading of 3 skips a level - which it did on every section index
    rendered as a grid rather than a table. Pages that put their grid inside a
    titled <section> leave this at 3, where it is correct.
  */
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <Link href={href} className="card entity-card">
      {image?.url ? (
        <span className={thumbFit === 'contain' ? 'thumb thumb-contain' : 'thumb'}>
          <img src={image.url} alt={image.alt ?? ''} loading="lazy" />
        </span>
      ) : null}
      <span className="card-top">
        {icon ? <Icon name={icon} size={18} className="ic" /> : null}
        <Heading>{title}</Heading>
      </span>
      {summary ? <p>{summary}</p> : null}
      {badges ? <span className="badges">{badges}</span> : null}
    </Link>
  )
}
