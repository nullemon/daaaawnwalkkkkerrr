import Link from 'next/link'
import { Logo } from './Logo'

/**
 * The footer, as a site map rather than a row of links.
 *
 * A guide site's footer is where a reader checks two things: that the place is
 * run by somebody real, and that the section they want exists. So it carries
 * the publisher, the office, and every index the site has — grouped the way the
 * content is grouped rather than in one long list.
 */

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Plan a run',
    links: [
      { label: 'Your run', href: '/run' },
      { label: 'Run checker', href: '/tools/run-checker' },
      { label: 'Build planner', href: '/tools/build-planner' },
      { label: 'Guides', href: '/guides' },
    ],
  },
  {
    heading: 'Database',
    links: [
      { label: 'Quests', href: '/quests' },
      { label: 'Characters', href: '/characters' },
      { label: 'Regions', href: '/regions' },
      { label: 'Items', href: '/items' },
      { label: 'Enemies', href: '/enemies' },
    ],
  },
  {
    heading: 'Systems',
    links: [
      { label: 'Endings', href: '/endings' },
      { label: 'The Court', href: '/court' },
      { label: 'Court Activities', href: '/court-activities' },
      { label: 'Perks', href: '/perks' },
      { label: 'Skill trees', href: '/skills' },
      { label: 'Mechanics', href: '/mechanics' },
    ],
  },
  {
    heading: 'This site',
    links: [
      { label: 'About the data', href: '/about' },
      { label: 'Report an error', href: '/corrections' },
      { label: 'Contact', href: '/contact' },
      { label: 'Your account', href: '/account' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
]

export function SiteFooter({
  siteName,
  note,
  maintainer,
  legalEntity,
  postalAddress,
  contactEmail,
}: {
  siteName: string
  note?: string | null
  maintainer?: string | null
  legalEntity?: string | null
  postalAddress?: string | null
  contactEmail?: string | null
}) {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="page site-footer-inner">
        <div className="site-footer-brand">
          <p className="wordmark-sm">
            <span className="glyph">
              <Logo size={17} />
            </span>
            {siteName}
          </p>
          <p className="note">
            A run planner and database for The Blood of Dawnwalker. Every figure carries a
            confidence rating, and where sources disagree we say so rather than picking one.
          </p>
          {maintainer ? <p className="note">Written and maintained by {maintainer}.</p> : null}
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="site-footer-col">
            <p className="eyebrow">{column.heading}</p>
            <ul>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="page site-footer-legal">
        <div>
          {legalEntity ? (
            <p className="note">
              © {year} {legalEntity}
              {contactEmail ? (
                <>
                  {' · '}
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </>
              ) : null}
            </p>
          ) : null}
          {/* The address is one line here; the contact page prints it in full. */}
          {postalAddress ? (
            <p className="note">{postalAddress.split('\n').filter(Boolean).join(', ')}</p>
          ) : null}
        </div>
        <p className="note site-footer-disclaimer">{note}</p>
      </div>
    </footer>
  )
}
