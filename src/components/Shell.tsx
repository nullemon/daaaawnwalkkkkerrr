import { SiteRail, type RailItem } from './SiteRail'
import { SiteLogo } from './SiteLogo'
import { SiteFooter, type FooterColumn } from './SiteFooter'
import { getAppearance } from '@/lib/appearance-settings'

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
  /**
   * The way back to the network's own home. Omitted on the hub, which is it.
   *
   * Built by each layout from `hub('/')` in `src/lib/urls.ts` rather than from
   * a literal, because the network answers on `localhost:3000` in dev and on
   * its real apex in production and a hardcoded host is right in exactly one
   * of those. The label comes from the `nav.network-home` registry string, so
   * the network's name is read from Site settings instead of typed into ten
   * rails.
   */
  networkHome?: { label: string; href: string } | null
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

/*
  Why the appearance read happens here and not in the four layouts above.

  `SiteRail` is a client component, so it cannot ask the database whether the
  theme is locked, and the toggle lives in its foot. Shell is the last server
  component in the chain and the only one all four layouts pass through, so the
  read is here and the answer goes down as a prop — one read, one answer. Four
  layouts each doing it is four places to forget, and `getSiteSettings` is
  `cache()`d per request anyway, so this costs no query: the root layout has
  already made it for the boot script.
*/
export async function Shell({
  siteName,
  brandHref = '/',
  items,
  networkHome,
  footer,
  children,
}: ShellProps) {
  const { locked } = await getAppearance()

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <SiteRail
          siteName={siteName}
          /* 21px is the rail's icon column exactly (`--rail-icon`), so the
             brand mark sits on the same centre line as every glyph below it.
             Rendered here because the rail is a client component and the
             answer needs the database — the same reason `themeLocked` is a
             prop. */
          brand={<SiteLogo size={21} alt={siteName} />}
          brandHref={brandHref}
          items={items}
          networkHome={networkHome}
          themeLocked={locked !== null}
        />
        <div className="shell-main">
          <main id="main">{children}</main>
          <SiteFooter siteName={siteName} {...footer} />
        </div>
      </div>
    </>
  )
}
