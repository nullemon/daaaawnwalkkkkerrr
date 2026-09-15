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

export type FooterColumn = {
  heading: string
  links: { label: string; href: string }[]
}

export function SiteFooter({
  siteName,
  blurb,
  columns,
  note,
  maintainer,
  legalEntity,
  postalAddress,
  contactEmail,
}: {
  siteName: string
  /** What this particular site is, in a sentence or two. */
  blurb: string
  /**
   * The site map. Passed in rather than declared here, because the footer of a
   * game wiki lists that game's sections and the footer of the hub lists the
   * network's — and a game with no run checker must not link to one.
   */
  columns: FooterColumn[]
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
          <p className="note">{blurb}</p>
          {maintainer ? <p className="note">Written and maintained by {maintainer}.</p> : null}
        </div>

        {columns.map((column) => (
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
