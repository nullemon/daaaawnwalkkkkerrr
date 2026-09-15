import type { Metadata } from 'next'
import { Shell } from '@/components/Shell'
import type { RailItem } from '@/components/SiteRail'
import type { FooterColumn } from '@/components/SiteFooter'
import { getPublishedGames, getSiteSettings, gameUrl } from '@/lib/payload'
import { Analytics } from '@/components/Analytics'
import { resolveTags, verificationMetadata } from '@/lib/tags'

/**
 * The hub's identity and its own verification tokens.
 *
 * The title lives here rather than in the root layout because the root wraps
 * every wiki too and cannot tell which site it is rendering.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  return {
    title: {
      default: `${settings.siteName} — ${settings.tagline}`,
      template: `%s · ${settings.siteName}`,
    },
    applicationName: settings.siteName,
    openGraph: { siteName: settings.siteName, type: 'website', locale: 'en' },
    verification: verificationMetadata(await resolveTags()),
  }
}

/**
 * The hub: everything that belongs to the network rather than to one game.
 *
 * Its rail lists wikis where a game's rail lists sections, because that is
 * what a reader arriving at the apex domain is looking for. The legal and
 * contact pages live here too — they describe the company, which is the same
 * company on every wiki, so publishing seven copies of a privacy policy would
 * be seven pages competing with each other for the same search.
 */
export default async function NetworkLayout({ children }: { children: React.ReactNode }) {
  const [settings, games, tags] = await Promise.all([
    getSiteSettings(),
    getPublishedGames(),
    resolveTags(),
  ])

  /*
    Each wiki carries its own capsule art and links straight to its host.

    The first version did both wrong: seven identical chevrons, every one of
    them pointing at an anchor on the directory page rather than at the wiki.
    The rail collapses to icons at rest, so the icon *is* the label most of the
    time — seven rows sharing one glyph is not navigation, it is a list of
    seven indistinguishable things.
  */
  const wikis = await Promise.all(
    games.slice(0, 10).map(async (game) => {
      const logo = typeof game.theme?.logo === 'object' ? game.theme.logo : null
      return {
        label: game.shortTitle || game.title,
        href: await gameUrl(game),
        icon: 'book' as const,
        image: logo?.url ?? null,
        external: true,
      }
    }),
  )

  const rail: RailItem[] = [
    { label: 'Home', href: '/', icon: 'home' },
    { label: 'All wikis', href: '/wikis', icon: 'map' },
    { label: 'Contributors', href: '/authors', icon: 'person' },
    ...wikis,
  ]

  const footerWikis = await Promise.all(
    games.slice(0, 8).map(async (game) => ({
      label: game.shortTitle || game.title,
      href: await gameUrl(game),
    })),
  )

  const columns: FooterColumn[] = [
    {
      heading: 'The network',
      links: [
        { label: 'All wikis', href: '/wikis' },
        { label: 'Contributors', href: '/authors' },
        { label: 'Your account', href: '/account' },
      ],
    },
    { heading: 'Wikis', links: footerWikis },
    {
      /*
        No "About the data" here. That page belongs to a wiki and describes
        that wiki's sourcing, so on the hub it would have to be about seven
        different databases at once. The house rules are on the hub home
        instead, where they are about the network rather than about one game.
      */
      heading: 'This site',
      links: [
        { label: 'Contact', href: '/contact' },
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
      ],
    },
  ].filter((column) => column.links.length > 0)

  return (
    <Shell
      siteName={settings.siteName}
      items={rail}
      footer={{
        blurb:
          settings.description ||
          'Guides and databases for the games worth playing carefully. Every figure carries a confidence rating, and where sources disagree we say so rather than picking one.',
        columns,
        note: settings.footerNote,
        maintainer: settings.maintainer,
        legalEntity: settings.legalEntity,
        postalAddress: settings.postalAddress,
        contactEmail: settings.contactEmail,
      }}
    >
      {children}
      <Analytics tags={tags} />
    </Shell>
  )
}
