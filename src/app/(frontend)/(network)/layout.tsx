import type { Metadata } from 'next'
import { Shell } from '@/components/Shell'
import type { RailItem } from '@/components/SiteRail'
import type { FooterColumn } from '@/components/SiteFooter'
import { getPublishedGames, getSiteSettings, gameUrl } from '@/lib/payload'
import { Analytics } from '@/components/Analytics'
import { resolveTags, verificationMetadata } from '@/lib/tags'
import { analyticsOrigins } from '@/lib/analytics-origins'
import { companyUrl, personUrl } from '@/lib/urls'

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
    // The hub's own. Each wiki overrides these with its game's art.
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-touch-icon.png',
    },
    openGraph: {
      siteName: settings.siteName,
      type: 'website',
      locale: 'en',
      images: [{ url: '/og.png', width: 1200, height: 630, alt: settings.tagline ?? settings.siteName }],
    },
    twitter: { card: 'summary_large_image', images: ['/og.png'] },
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
    games.slice(0, 10).map(async (game) => ({
      label: game.shortTitle || game.title,
      href: await gameUrl(game),
      icon: 'book' as const,
      /*
        Initials on the game's own accent, not its art.

        The art was a square favicon crop, which fixed an earlier problem — a
        2:1 capsule squeezed into a square hole — and left two others. It sat
        24px plus a border inside a 22px slot beside 19px glyphs, so every game
        row was taller than every other row and no left edge lined up; and
        eight photographic crops beside flat monochrome glyphs is two icon sets
        in one column. Initials are one system, and the accent is what already
        distinguishes each wiki everywhere else on the network.
      */
      mark: {
        initials: (game.shortTitle || game.title)
          .replace(/^(the|a)\s+/i, '')
          .split(/[\s:—-]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
          .toUpperCase(),
        accent: game.theme?.accent ?? null,
        /*
          The 1:1 favicon crop `tools/make-wiki-icons.mjs` already produces,
          which is the right image for a square hole — the capsule is roughly
          2:1 and centre-cropping one slices the title off. Served from
          `public/` on every host.
        */
        image: `/wiki-assets/${game.slug}/icon-32.png`,
      },
      external: true,
    })),
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

  /*
    The built-in columns, and now the fallback rather than the last word.

    `SiteFooter` swaps in Site settings → Navigation → Footer columns when an
    editor has filled it in, for this host and the wikis and the companies site
    alike — the wiring is there rather than here so one edit does not have to
    be made three times, which is how the hub came to link to a page the wikis
    do not have.
  */
  const columns: FooterColumn[] = [
    {
      heading: 'The network',
      links: [
        { label: 'All wikis', href: '/wikis' },
        { label: 'Studios and publishers', href: companyUrl('/') },
        { label: 'Cast and crew', href: personUrl('/') },
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
      {/*
        DNS for the analytics host, and only when one is configured.

        These scripts load `afterInteractive`, so the connection is opened well
        after first paint — resolving the name early is free and a `preconnect`
        would not be. Nothing is emitted where no analytics ID is set, which is
        every host on the network today: a hint for an origin the page never
        contacts spends a lookup and buys nothing. `analyticsOrigins` derives
        the list from the same fields `<Analytics>` renders from, so the two
        cannot disagree.

        A bare <link> in a server component: React hoists it into <head>, and
        Next's Metadata API has no field for a resource hint.
      */}
      {analyticsOrigins(tags.analytics).map((origin) => (
        <link key={origin} rel="dns-prefetch" href={origin} />
      ))}
      <Analytics tags={tags} />
    </Shell>
  )
}
