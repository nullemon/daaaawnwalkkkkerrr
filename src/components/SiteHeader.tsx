import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'
import { RunBadge } from './RunBadge'

type NavItem = { label?: string | null; href?: string | null; id?: string | null }

export function SiteHeader({ siteName, nav }: { siteName: string; nav: NavItem[] }) {
  return (
    <header className="site-header">
      <div className="page site-header-inner">
        <Link href="/" className="wordmark">
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
        <ThemeToggle />
      </div>
    </header>
  )
}
