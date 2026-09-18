'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { RunBadge } from './RunBadge'

/**
 * The persistent left rail.
 *
 * A database site is somewhere people move sideways — quests to a region to a
 * character to an ending — and a top nav bar that scrolls away makes every one
 * of those moves start with a scroll back up. The rail is always there, and
 * collapsed to icons it costs 64px. It expands on hover on a desktop and
 * becomes a bottom bar on a phone, where a fixed side rail would eat a quarter
 * of the screen.
 */

export type RailItem = {
  label: string
  href: string
  icon: IconName
  /**
   * A game's mark: its initials, in its own accent colour.
   *
   * Seven entries carrying the same chevron is a list of seven identical rows,
   * which is no navigation at all — the rail collapses to icons by default, so
   * the icon *is* the label most of the time. The first answer to that was the
   * game's capsule art, and it was the wrong one twice over. Mechanically, a
   * 24px image with a 1px border sat in a 22px box beside 19px glyphs, so
   * every game row was four pixels taller than every other row and none of the
   * left edges lined up. Visually, eight photographic crops with eight
   * different palettes and subjects sat next to flat monochrome glyphs, which
   * is two icon sets in one column rather than one.
   *
   * Initials on the game's accent are one system: same size, same shape, same
   * weight as the glyphs, distinguishable at a glance, and the same monogram
   * language the contributor avatars already use.
   */
  mark?: { initials: string; accent?: string | null; image?: string | null } | null
  /** True for an entry pointing at another host, so it renders as a plain anchor. */
  external?: boolean
}

export function SiteRail({
  siteName,
  items,
  brandHref = '/',
  networkHome,
}: {
  siteName: string
  items: RailItem[]
  /** Where the wordmark goes. A wiki's rail points at its own home, not the hub's. */
  brandHref?: string
  /**
   * The way out, to the network's own home — on every host except the hub.
   *
   * It is rendered here rather than appended to `items` by each layout so the
   * three that need it cannot disagree about its wording, its glyph or its
   * position, and so the hub opts out by passing nothing rather than by
   * remembering not to add a link to itself. Last in the list on purpose: it
   * reads as leaving rather than as one more section of this site.
   */
  networkHome?: { label: string; href: string } | null
}) {
  const pathname = usePathname()

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="navrail" aria-label="Primary">
      <Link href={brandHref} className="navrail-brand" title={siteName}>
        {/* 21px is the rail's icon column exactly (`--rail-icon`), so the
            brand mark sits on the same centre line as every glyph below it
            rather than half a pixel off it. */}
        <span className="navrail-brand-mark">
          <Logo size={21} />
        </span>
        <span className="navrail-label navrail-brand-name">{siteName}</span>
      </Link>

      <ul className="navrail-list">
        {items.map((item) => {
          const inner = (
            <>
              <span className="navrail-icon">
                {item.mark ? (
                  // Decorative: the label beside it already names the game.
                  <span
                    className="navrail-mark"
                    aria-hidden="true"
                    style={item.mark.accent ? { background: item.mark.accent } : undefined}
                  >
                    {/*
                      The game's own art, in a box the same size as a glyph.
                      The art was never the problem — its footprint was: 24px
                      and a border inside a 22px slot, four pixels taller than
                      every other row. Initials were tried instead and read as
                      placeholder, which they were. The ring is a box-shadow so
                      it cannot add to the box and put the unevenness back.
                    */}
                    {item.mark.image ? (
                      <img src={item.mark.image} alt="" loading="lazy" decoding="async" />
                    ) : (
                      item.mark.initials
                    )}
                  </span>
                ) : (
                  <Icon name={item.icon} size={19} />
                )}
              </span>
              <span className="navrail-label">{item.label}</span>
            </>
          )

          return (
            <li key={item.href}>
              {item.external ? (
                // Cross-origin: `next/link` would add a prefetch that cannot work.
                <a href={item.href} className="navrail-link" title={item.label}>
                  {inner}
                </a>
              ) : (
                <Link
                  href={item.href}
                  className="navrail-link"
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  title={item.label}
                >
                  {inner}
                </Link>
              )}
            </li>
          )
        })}

        {networkHome ? (
          /*
            Cross-origin, so a plain anchor: `next/link` would add a prefetch
            that cannot work across hosts.

            `external` is the glyph — the arrow leaving a box — and it is the
            only rail entry on the network that uses it, which is what the rail
            needs it to be. Collapsed to 64px the icon *is* the control, so a
            glyph that already means something else (a crown is Companies, a
            person is People, a house is this site's own home) would be a
            second meaning on one mark rather than navigation. The label is
            still carried as `title`, so the collapsed state answers a hover
            and a screen reader reads the text either way.
          */
          <li className="navrail-leave">
            <a href={networkHome.href} className="navrail-link" title={networkHome.label}>
              <span className="navrail-icon">
                <Icon name="external" size={19} />
              </span>
              <span className="navrail-label">{networkHome.label}</span>
            </a>
          </li>
        ) : null}
      </ul>

      <div className="navrail-foot">
        <RunBadge />
        <ThemeToggle />
      </div>
    </nav>
  )
}
