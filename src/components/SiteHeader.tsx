import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'
import { RunBadge } from './RunBadge'
import { Icon } from './Icon'

type NavItem = { label?: string | null; href?: string | null; id?: string | null }

export function SiteHeader({ siteName, nav }: { siteName: string; nav: NavItem[] }) {
  return (
    <header className="site-header">
      <div className="page site-header-inner">
        <Link href="/" className="wordmark">
          <Icon name="blood" size={19} className="glyph" />
          {siteName}
        </Link>
        <nav aria-label="Primary">
          <ul>
            {nav.map((item) => (
              <li key={item.href ?? item.label}>
                <Link href={item.href ?? '/'}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <RunBadge />
        <Link href="/search" className="icon-btn" aria-label="Search the database" title="Search">
          <Icon name="search" size={17} />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
