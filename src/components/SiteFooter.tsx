import Link from 'next/link'
import { Logo } from './Logo'
import { copy } from '@/lib/copy'
import { getSiteSettings } from '@/lib/payload'

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

/**
 * A footer link may point at another host — a wiki's footer links the hub's
 * legal and contributor pages, which live at the apex only.
 *
 * `next/link` across origins does nothing useful: there is no client-side
 * navigation to be had, and it adds a prefetch that cannot resolve. So an
 * absolute href renders as a plain anchor and a relative one keeps the
 * prefetching it benefits from.
 */
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (/^https?:\/\//i.test(href)) return <a href={href}>{children}</a>
  return <Link href={href}>{children}</Link>
}

export async function SiteFooter({
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
  const settings = await getSiteSettings()

  /*
    One edit, three hosts.

    The columns are resolved here rather than in each layout because there are
    three layouts — hub, wiki, companies — and each had its own hardcoded
    list, which is how the hub came to link to a page the wikis do not have.
    The list passed in stays the fallback for whichever host this is, so an
    empty field changes nothing anywhere.

    A column with no links is dropped: an empty heading over nothing reads as a
    broken site. If that leaves nothing at all — a half-filled record, headings
    typed and links not yet — the built-in map is used rather than serving a
    footer with no way out of it.
  */
  const edited = (settings.footerColumns ?? [])
    .map((column) => ({
      heading: column.heading,
      links: (column.links ?? []).map((link) => ({ label: link.label, href: link.href })),
    }))
    .filter((column) => column.links.length > 0)
  const shown = edited.length > 0 ? edited : columns

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
          {/* No maintainer, no line. An editable sentence with the name missing
              from the middle of it is worse than the silence it replaces. */}
          {maintainer ? (
            <p className="note">
              {copy(settings.maintainerLine, 'Written and maintained by {maintainer}.', {
                maintainer,
              })}
            </p>
          ) : null}
        </div>

        {shown.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="site-footer-col">
            <p className="eyebrow">{column.heading}</p>
            <ul>
              {column.links.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
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
