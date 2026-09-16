import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/Shell'
import type { FooterColumn } from '@/components/SiteFooter'
import type { RailItem } from '@/components/SiteRail'
import { getPublishedGames, getSiteSettings, gameUrl } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { COMPANIES_BUILT_IN, getCompaniesSite } from '@/lib/companies-copy'
import { hub } from '@/lib/urls'

/**
 * The companies host.
 *
 * `companies.<network domain>` is its own site as far as a reader and a search
 * engine are concerned, exactly like each wiki, so it gets its own shell,
 * title template and footer rather than being a section of the hub. `proxy.ts`
 * needs no special case: the rewrite maps any subdomain label onto the
 * matching first path segment, so this host lands on `/companies/...` the same
 * way `dawnwalker.<domain>` lands on `/dawnwalker/...`.
 *
 * Its wording is the `companies-site` global. The network's name stays a token
 * rather than a stored string — it is still a working title, and one rename
 * should not leave this host introducing itself as the old one.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [settings, site] = await Promise.all([getSiteSettings(), getCompaniesSite()])
  const network = settings.siteName ?? 'the network'
  const shellName = copy(site.shellName, COMPANIES_BUILT_IN.shellName, { network })
  return {
    title: {
      default: `${copy(site.shellTagline, COMPANIES_BUILT_IN.shellTagline)} — ${network}`,
      template: `%s · ${shellName}`,
    },
    description: copy(site.shellDescription, COMPANIES_BUILT_IN.shellDescription, { network }),
    applicationName: shellName,
  }
}

export default async function CompaniesLayout({ children }: { children: ReactNode }) {
  const [settings, games, site] = await Promise.all([
    getSiteSettings(),
    getPublishedGames(),
    getCompaniesSite(),
  ])

  const rail: RailItem[] = [
    { label: 'All companies', href: '/', icon: 'person' },
    { label: 'All wikis', href: hub('/wikis'), icon: 'book' },
  ]

  const wikiLinks = await Promise.all(
    games.slice(0, 8).map(async (game) => ({
      label: game.shortTitle || game.title,
      href: await gameUrl(game),
    })),
  )

  const columns: FooterColumn[] = [
    {
      heading: 'The network',
      links: [
        { label: 'All wikis', href: hub('/wikis') },
        { label: 'Contributors', href: hub('/authors') },
      ],
    },
    { heading: 'Wikis', links: wikiLinks },
    {
      heading: 'This site',
      links: [
        /*
          The three hub links are added to, not replaced by, whatever an editor
          adds below. Contact, privacy and terms are the network's legal pages
          and they are reachable from every other host; a row added here quietly
          taking them off this one is not an edit anybody would mean to make.

          The hrefs are built from the network origin at render time, which is
          also why the seed pass does not write them into the array: storing
          `http://localhost:3000/privacy` would survive the deploy that stops
          being true.
        */
        { label: 'Contact', href: hub('/contact') },
        { label: 'Privacy', href: hub('/privacy') },
        { label: 'Terms', href: hub('/terms') },
        ...(site.footerLinks ?? []).map((link) => ({ label: link.label, href: link.href })),
      ],
    },
  ]

  return (
    <Shell
      siteName={copy(site.shellName, COMPANIES_BUILT_IN.shellName, {
        network: settings.siteName ?? 'Network',
      })}
      items={rail}
      footer={{
        blurb: copy(site.footerBlurb, COMPANIES_BUILT_IN.footerBlurb),
        columns,
        note: settings.footerNote,
        maintainer: settings.maintainer,
        legalEntity: settings.legalEntity,
        postalAddress: settings.postalAddress,
        contactEmail: settings.contactEmail,
      }}
    >
      {children}
    </Shell>
  )
}
