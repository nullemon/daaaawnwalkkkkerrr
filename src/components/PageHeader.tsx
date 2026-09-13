import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type Crumb = { label: string; href?: string }

/**
 * Decorative art for a header band.
 *
 * Only the home page and the section indexes pass this. Record pages never do:
 * no source says which place or person any official screenshot shows, and a
 * picture above the words "Laslea Glen" reads as a claim that it is Laslea
 * Glen whatever the alt text says. See docs/ASSETS.md.
 */
export type HeaderArt = { src: string; credit?: string; tall?: boolean }

export function PageHeader({
  eyebrow,
  title,
  lede,
  crumbs = [],
  badges,
  icon,
  art,
}: {
  eyebrow?: string
  title: string
  lede?: string | null
  crumbs?: Crumb[]
  badges?: ReactNode
  icon?: IconName
  art?: HeaderArt
}) {
  const head = (
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
        <div className="title-row">
          {icon ? (
            <span className="title-icon">
              <Icon name={icon} size={21} />
            </span>
          ) : null}
          <h1>{title}</h1>
        </div>
        {lede ? <p className="lede">{lede}</p> : null}
        <div className="meta-row">{badges}</div>
      </div>
    </div>
  )

  if (!art) return head

  return (
    <div
      className="page-art"
      style={{ backgroundImage: `url(${art.src})` }}
      data-tall={art.tall ? 'true' : undefined}
    >
      {head}
      {art.credit ? <p className="art-credit">{art.credit}</p> : null}
    </div>
  )
}
