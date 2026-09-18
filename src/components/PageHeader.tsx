import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { getSiteSettings } from '@/lib/payload'

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

export async function PageHeader({
  eyebrow,
  title,
  subtitle,
  lede,
  crumbs = [],
  badges,
  icon,
  art,
}: {
  eyebrow?: string
  title: string
  /*
    A deck, under the headline and above the lede.

    Optional everywhere and set by exactly one route today — a guide, from its
    own `subtitle` field. It is a prop rather than something composed here for
    the reason CLAUDE.md gives about sentences in components: a line written
    into a shared header is served on every page of all eight wikis, which is
    how the Gears of War Regions index came to be headed "Vale Sangora".

    Blank prints nothing. It is deliberately not filled in from the lede: the
    same sentence twice under a headline is not a subtitle, it is an echo.
  */
  subtitle?: string | null
  /*
    A node, not a string.

    The lede is composed prose and composed prose names records that have
    pages, so a call site passes `<Linked>` here to get those names linked.
    Widening rather than adding a second prop: every existing call passes a
    string, and a string is a node.
  */
  lede?: ReactNode
  crumbs?: Crumb[]
  badges?: ReactNode
  icon?: IconName
  art?: HeaderArt
}) {
  // Same switch as the credit under a record's own image, so the page does not
  // credit one picture and not the other. See `EntityImage`.
  const settings = await getSiteSettings()
  const showCredit = Boolean(settings.showImageCredits)

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
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
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
      {showCredit && art.credit ? <p className="art-credit">{art.credit}</p> : null}
    </div>
  )
}
