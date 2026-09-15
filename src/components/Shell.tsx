import { SiteRail, type RailItem } from './SiteRail'
import { SiteFooter, type FooterColumn } from './SiteFooter'

/**
 * The page frame: rail on the left, content and footer on the right.
 *
 * This used to live inside the single root layout, which was fine while the
 * site was one wiki. It is a component now because the network has two kinds
 * of page that need the same frame around different furniture — a game's wiki,
 * whose rail lists that game's sections, and the hub, whose rail lists the
 * network's. Everything above this (the document, the fonts, the providers)
 * stays shared; everything inside it varies.
 */

export type ShellProps = {
  siteName: string
  /** Where the brand mark links. The hub on the hub, the wiki home on a wiki. */
  brandHref?: string
  items: RailItem[]
  footer: {
    blurb: string
    columns: FooterColumn[]
    note?: string | null
    maintainer?: string | null
    legalEntity?: string | null
    postalAddress?: string | null
    contactEmail?: string | null
  }
  children: React.ReactNode
}

export function Shell({ siteName, brandHref = '/', items, footer, children }: ShellProps) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <SiteRail siteName={siteName} brandHref={brandHref} items={items} />
        <div className="shell-main">
          <main id="main">{children}</main>
          <SiteFooter siteName={siteName} {...footer} />
        </div>
      </div>
    </>
  )
}
