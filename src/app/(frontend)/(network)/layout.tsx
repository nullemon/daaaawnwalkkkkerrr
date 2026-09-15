import { Shell } from '@/components/Shell'
import type { RailItem } from '@/components/SiteRail'
import type { FooterColumn } from '@/components/SiteFooter'
import { getPublishedGames, getSiteSettings } from '@/lib/payload'

/**
 * The hub: everything that belongs to the network rather than to one game.
 *
 * Its rail lists wikis where a game's rail lists sections, because that is
 * what a reader arriving at the apex domain is looking for. The legal and
 * contact pages live here too — they describe the company, which is the same
 * company on every wiki, so publishing seven copies of a privacy policy would
 * be seven pages competing with each other for the same search.
 */

const railFor = (games: { slug: string; title: string; shortTitle?: string | null }[]): RailItem[] => [
  { label: 'Home', href: '/', icon: 'home' },
  { label: 'All wikis', href: '/wikis', icon: 'book' },
  ...games.slice(0, 10).map((game) => ({
    label: game.shortTitle || game.title,
    // The directory, anchored at this game — not the wiki itself. The rail is
    // the hub's own navigation, so it stays on the hub; the directory card is
    // what carries the cross-origin link to the wiki.
    href: `/wikis#${game.slug}`,
    icon: 'chevron' as const,
  })),
]

export default async function NetworkLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  const games = await getPublishedGames()

  const columns: FooterColumn[] = [
    {
      heading: 'The network',
      links: [
        { label: 'All wikis', href: '/wikis' },
        { label: 'Contributors', href: '/authors' },
        { label: 'Your account', href: '/account' },
      ],
    },
    {
      heading: 'Wikis',
      links: games.slice(0, 8).map((game) => ({
        label: game.shortTitle || game.title,
        href: `/wikis#${game.slug}`,
      })),
    },
    {
      heading: 'This site',
      links: [
        { label: 'About the data', href: '/about' },
        { label: 'Contact', href: '/contact' },
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
      ],
    },
  ].filter((column) => column.links.length > 0)

  return (
    <Shell
      siteName={settings.siteName}
      items={railFor(games)}
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
    </Shell>
  )
}
