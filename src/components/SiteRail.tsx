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
   * The game's own capsule art, for the hub's rail.
   *
   * Seven entries all carrying the same chevron is a list of seven identical
   * rows, which is no navigation at all — the rail collapses to icons by
   * default, so the icon *is* the label most of the time. A game is
   * recognisable by its key art in a way no glyph in the set can match.
   */
  image?: string | null
  /** True for an entry pointing at another host, so it renders as a plain anchor. */
  external?: boolean
}

export function SiteRail({
  siteName,
  items,
  brandHref = '/',
}: {
  siteName: string
  items: RailItem[]
  /** Where the wordmark goes. A wiki's rail points at its own home, not the hub's. */
  brandHref?: string
}) {
  const pathname = usePathname()

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="navrail" aria-label="Primary">
      <Link href={brandHref} className="navrail-brand" title={siteName}>
        <span className="navrail-brand-mark">
          <Logo size={22} />
        </span>
        <span className="navrail-label navrail-brand-name">{siteName}</span>
      </Link>

      <ul className="navrail-list">
        {items.map((item) => {
          const inner = (
            <>
              <span className="navrail-icon">
                {item.image ? (
                  // Decorative: the label beside it already names the game.
                  <img src={item.image} alt="" className="navrail-art" loading="lazy" />
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
      </ul>

      <div className="navrail-foot">
        <RunBadge />
        <ThemeToggle />
      </div>
    </nav>
  )
}
