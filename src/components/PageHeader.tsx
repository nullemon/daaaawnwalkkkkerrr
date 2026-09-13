import Link from 'next/link'
import type { ReactNode } from 'react'

export type Crumb = { label: string; href?: string }

export function PageHeader({
  eyebrow,
  title,
  lede,
  crumbs = [],
  badges,
}: {
  eyebrow?: string
  title: string
  lede?: string | null
  crumbs?: Crumb[]
  badges?: ReactNode
}) {
  return (
    <div className="page">
      <div className="page-head">
        {crumbs.length > 0 ? (
          <ol className="breadcrumbs">
            {crumbs.map((crumb, index) => (
              <li key={crumb.label}>
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
                {index < crumbs.length - 1 ? <span aria-hidden="true"> / </span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
        {badges ? <div className="meta-row">{badges}</div> : <div className="meta-row" />}
      </div>
    </div>
  )
}
