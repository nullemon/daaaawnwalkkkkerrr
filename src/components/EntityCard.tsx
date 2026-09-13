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
}: {
  href: string
  title: string
  summary?: string | null
  badges?: ReactNode
  icon?: IconName
  /** Real game art once a record has some; the icon stands in until then. */
  image?: { url?: string | null; alt?: string | null } | null
}) {
  return (
    <Link href={href} className="card entity-card">
      {image?.url ? (
        <span className="thumb">
          <img src={image.url} alt={image.alt ?? ''} loading="lazy" />
        </span>
      ) : null}
      <span className="card-top">
        {icon ? <Icon name={icon} size={18} className="ic" /> : null}
        <h3>{title}</h3>
      </span>
      {summary ? <p>{summary}</p> : null}
      {badges ? <span className="badges">{badges}</span> : null}
    </Link>
  )
}
