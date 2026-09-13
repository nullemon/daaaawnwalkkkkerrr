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

export type RailItem = { label: string; href: string; icon: IconName }

export function SiteRail({ siteName, items }: { siteName: string; items: RailItem[] }) {
  const pathname = usePathname()

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="navrail" aria-label="Primary">
      <Link href="/" className="navrail-brand" title={siteName}>
        <span className="navrail-brand-mark">
          <Logo size={22} />
        </span>
        <span className="navrail-label navrail-brand-name">{siteName}</span>
      </Link>

      <ul className="navrail-list">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="navrail-link"
              aria-current={isCurrent(item.href) ? 'page' : undefined}
              title={item.label}
            >
              <span className="navrail-icon">
                <Icon name={item.icon} size={19} />
              </span>
              <span className="navrail-label">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="navrail-foot">
        <RunBadge />
        <ThemeToggle />
      </div>
    </nav>
  )
}
