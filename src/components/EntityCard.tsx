import Link from 'next/link'
import type { ReactNode } from 'react'

export function EntityCard({
  href,
  title,
  summary,
  badges,
}: {
  href: string
  title: string
  summary?: string | null
  badges?: ReactNode
}) {
  return (
    <Link href={href} className="card entity-card">
      <h3>{title}</h3>
      {summary ? <p>{summary}</p> : null}
      {badges ? <div className="badges">{badges}</div> : null}
    </Link>
  )
}
