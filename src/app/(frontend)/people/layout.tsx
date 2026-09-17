import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/Shell'
import type { FooterColumn } from '@/components/SiteFooter'
import type { RailItem } from '@/components/SiteRail'
import { getPublishedGames, getSiteSettings, gameUrl } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { PEOPLE_BUILT_IN, getPeopleSite } from '@/lib/people-copy'
import { companyUrl, hub } from '@/lib/urls'

/**
 * The people host.
 *
 * `people.<network domain>` is its own site as far as a reader and a search
 * engine are concerned, exactly like each wiki and like the companies host, so
 * it gets its own shell, title template and footer rather than being a section
 * of the hub. `proxy.ts` needs no special case: the rewrite maps any subdomain
 * label onto the matching first path segment, so this host lands on
 * `/people/...` the same way `dawnwalker.<domain>` lands on `/dawnwalker/...`.
 * The label is reserved in `NETWORK_SUBDOMAINS`, so no wiki can shadow it.
 *
 * Its wording is the `people-site` global. The network's name stays a token
 * rather than a stored string — it is still a working title, and one rename
 * should not leave this host introducing itself as the old one.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [settings, site] = await Promise.all([getSiteSettings(), getPeopleSite()])
  const network = settings.siteName ?? 'the network'
  const shellName = copy(site.shellName, PEOPLE_BUILT_IN.shellName, { network })
  return {
    title: {
      default: `${copy(site.shellTagline, PEOPLE_BUILT_IN.shellTagline)} — ${network}`,
      template: `%s · ${shellName}`,
    },
    description: copy(site.shellDescription, PEOPLE_BUILT_IN.shellDescription, { network }),
    applicationName: shellName,
  }
}

export default async function PeopleLayout({ children }: { children: ReactNode }) {
  const [settings, games, site] = await Promise.all([
    getSiteSettings(),
    getPublishedGames(),
    getPeopleSite(),
  ])

  const rail: RailItem[] = [
    { label: 'All people', href: '/', icon: 'person' },
    /*
      The companies host is the sibling a reader on this one actually wants: a
      person's profile links to the studios that named them, and those pages
      link back. Cross-origin, so it is a plain href rather than a route.
    */
    { label: 'Companies', href: companyUrl('/'), icon: 'crown' },
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
        { label: 'Companies', href: companyUrl('/') },
        { label: 'Contributors', href: hub('/authors') },
      ],
    },
    { heading: 'Wikis', links: wikiLinks },
    {
      heading: 'This site',
      links: [
        /*
          Contact, privacy and terms are the network's legal pages and they are
          reachable from every other host. They are built from the network
          origin at render time rather than stored, because a stored
          `http://localhost:3000/privacy` survives the deploy that stops it
          being true.
        */
        { label: 'Contact', href: hub('/contact') },
        { label: 'Privacy', href: hub('/privacy') },
        { label: 'Terms', href: hub('/terms') },
      ],
    },
  ]

  return (
    <Shell
      siteName={copy(site.shellName, PEOPLE_BUILT_IN.shellName, {
        network: settings.siteName ?? 'Network',
      })}
      items={rail}
      footer={{
        blurb: copy(site.footerBlurb, PEOPLE_BUILT_IN.footerBlurb),
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
