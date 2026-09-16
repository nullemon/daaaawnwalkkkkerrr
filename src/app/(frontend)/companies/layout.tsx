import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/Shell'
import type { FooterColumn } from '@/components/SiteFooter'
import type { RailItem } from '@/components/SiteRail'
import { getPublishedGames, getSiteSettings, gameUrl } from '@/lib/payload'
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
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  const network = settings.siteName ?? 'the network'
  return {
    title: {
      default: `Studios and publishers — ${network}`,
      template: `%s · ${network} Companies`,
    },
    description: `Every developer and publisher behind the games ${network} covers, and which of their games are here.`,
    applicationName: `${network} Companies`,
  }
}

export default async function CompaniesLayout({ children }: { children: ReactNode }) {
  const [settings, games] = await Promise.all([getSiteSettings(), getPublishedGames()])

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
        { label: 'Contact', href: hub('/contact') },
        { label: 'Privacy', href: hub('/privacy') },
        { label: 'Terms', href: hub('/terms') },
      ],
    },
  ]

  return (
    <Shell
      siteName={`${settings.siteName ?? 'Network'} Companies`}
      items={rail}
      footer={{
        blurb:
          'Who made the games this network covers. One page per company, with everything of theirs we cover and a source for each claim.',
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
