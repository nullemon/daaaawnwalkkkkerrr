import Link from 'next/link'
import { SiteLogo } from './SiteLogo'
import { copy } from '@/lib/copy'
import { getSiteSettings } from '@/lib/payload'
import { mergeFooterColumns, type FooterColumn } from '@/lib/footer-columns'

/**
 * The footer, as a site map rather than a row of links.
 *
 * A guide site's footer is where a reader checks two things: that the place is
 * run by somebody real, and that the section they want exists. So it carries
 * the publisher, the office, and every index the site has — grouped the way the
 * content is grouped rather than in one long list.
 */

/*
  Re-exported rather than declared, so the four layouts that build a site map
  and this component that renders one are naming the same type. The merge rule
  lives with the type in `lib/footer-columns.ts` because it is a decision with
  a reason, and a server component is not a place a decision can be tested.
*/
export type { FooterColumn }

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
    One edit, ten hosts, and exactly one place that resolves it.

    The columns are merged here rather than in each layout because there are
    four layouts — hub, wiki, companies, people — and each had its own
    hardcoded list, which is how the hub came to link to a page the wikis do
    not have. `[game]/layout.tsx` also resolved this field a second time and
    then handed the result in as `columns`, so the same decision was made
    twice with two different comments arguing for two different answers. It
    passes its built-in map now and this is the only resolution.

    Why an editor's column is added to the built-in map rather than replacing
    it — nine pages whose only inbound link is here — is in
    `lib/footer-columns.ts`, with the rest of the rule.
  */
  const shown = mergeFooterColumns(columns, settings.footerColumns)

  return (
    <footer className="site-footer">
      <div className="page site-footer-inner">
        <div className="site-footer-brand">
          <p className="wordmark-sm">
            <span className="glyph">
              <SiteLogo size={17} alt={siteName} />
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
