'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { RunBadge } from './RunBadge'

/**
 * The persistent header.
 *
 * This was a left rail, and the file is still called that because every
 * layout, the footer and `check:css` know it by that name. The rail was the
 * right shape for one wiki with eleven sections and the wrong one for a
 * network: on the hub it listed fifteen games as fifteen identical rows, and
 * collapsed to its icons it asked a reader to learn sixteen glyphs before they
 * could go anywhere.
 *
 * What it is now is the broadcast shape - a white slab carrying the name, a
 * strip of tabs running out of it, and the controls on the far side. It is
 * sticky, because a database site is somewhere people move sideways (a quest
 * to a region to a character to an ending) and a bar that scrolls away makes
 * every one of those moves start with a scroll back up. On a phone the tabs
 * take a second row and scroll under a thumb. There is one list, rendered
 * once, whatever the width; the CSS in `globals.css` under "shell" does the
 * rest.
 */

export type RailItem = {
  label: string
  href: string
  icon: IconName
  /**
   * A game's mark: its initials, in its own accent colour.
   *
   * Fifteen entries carrying the same chevron is a strip of fifteen identical
   * tabs, which is no navigation at all. The initials on the game's accent are
   * one system with the glyphs beside them - same height, same weight - and
   * the same monogram language the contributor avatars already use.
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
  themeLocked = false,
  brand,
}: {
  siteName: string
  /**
   * The mark itself, already rendered.
   *
   * A node rather than a flag, because whether the network uses the drawn
   * glyph or an uploaded picture is a question only a server component can
   * answer and this file is `'use client'`. `Shell` resolves it once for the
   * header and the footer alike; the same reason the theme lock arrives as a
   * prop rather than being looked up here.
   */
  brand: React.ReactNode
  items: RailItem[]
  /** Where the wordmark goes. A wiki's header points at its own home, not the hub's. */
  brandHref?: string
  /**
   * The way out, to the network's own home - on every host except the hub.
   *
   * It is rendered here rather than appended to `items` by each layout so the
   * three that need it cannot disagree about its wording, its glyph or its
   * position, and so the hub opts out by passing nothing rather than by
   * remembering not to add a link to itself. Last in the strip on purpose,
   * pushed to the far end: it reads as leaving rather than as one more
   * section of this site.
   */
  networkHome?: { label: string; href: string } | null
  /**
   * Site settings → Appearance has pinned the network to one theme.
   *
   * Passed down from `Shell`, which is the last server component in the chain
   * and can read it; this one is a client component and cannot. Default false,
   * so a caller that has not been told renders the site the code does.
   */
  themeLocked?: boolean
}) {
  const pathname = usePathname()

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="navrail" aria-label="Primary">
      <div className="navrail-top">
        <Link href={brandHref} className="navrail-brand" title={siteName}>
          <span className="navrail-brand-mark">{brand}</span>
          <span className="navrail-brand-name">{siteName}</span>
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
                      {item.mark.image ? (
                        <img src={item.mark.image} alt="" loading="lazy" decoding="async" />
                      ) : (
                        item.mark.initials
                      )}
                    </span>
                  ) : (
                    <Icon name={item.icon} size={15} />
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
              that cannot work across hosts. `external` is the glyph - the arrow
              leaving a box - and it is the only entry on the network that uses
              it, so the one tab that leaves the site is the one tab that looks
              like it does.
            */
            <li className="navrail-leave">
              <a href={networkHome.href} className="navrail-link" title={networkHome.label}>
                <span className="navrail-icon">
                  <Icon name="external" size={15} />
                </span>
                <span className="navrail-label">{networkHome.label}</span>
              </a>
            </li>
          ) : null}
        </ul>

        <div className="navrail-foot">
          <RunBadge />
          {/*
            Absent under a lock, not disabled and not hidden with CSS.

            A button that cannot change the outcome is the reassuring-control
            failure this repo keeps finding: a reader presses it, the page does
            not change, and there is nothing anywhere saying why. The honest
            render of "this site is dark, full stop" is no switch at all.
          */}
          {themeLocked ? null : <ThemeToggle />}
        </div>
      </div>
    </nav>
  )
}
