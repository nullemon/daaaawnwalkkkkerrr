import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/Shell'
import type { FooterColumn } from '@/components/SiteFooter'
import type { RailItem } from '@/components/SiteRail'
import { getPublishedGames, getSiteSettings, gameUrl } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { COMPANIES_BUILT_IN, getCompaniesSite } from '@/lib/companies-copy'
import { COMPANIES_ORIGIN, hub, personUrl } from '@/lib/urls'
import { networkHome } from '@/lib/network-home'
import { hostCard } from '@/lib/social'

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
    /*
      This host's own origin, which is the whole reason a canonical is worth
      printing.

      Every page under here writes `alternates.canonical` as a path, and Next
      resolves a relative canonical against the nearest `metadataBase`. Nothing
      set one here, so all 321 profiles inherited the *hub's* — and told every
      crawler that the canonical address of `companies.<domain>/capcom` is
      `<domain>/capcom`, which is not a page: the apex reads an unreserved first
      segment as a wiki slug and 308s it to `capcom.<domain>`, a host that does
      not exist. The index was worse still, naming the network home page as its
      own canonical, which is a request to be dropped from the index and folded
      into a page about something else.

      `[game]/layout.tsx` has always set this per wiki, which is why the eight
      wikis were right and these two hosts were not. Built from
      `COMPANIES_ORIGIN` so it cannot drift from `companyUrl`, which is what
      every inbound link, every `@id` and the sitemap already use.
    */
    metadataBase: new URL(COMPANIES_ORIGIN),
    title: {
      default: `${copy(site.shellTagline, COMPANIES_BUILT_IN.shellTagline)} — ${network}`,
      template: `%s · ${shellName}`,
    },
    description: copy(site.shellDescription, COMPANIES_BUILT_IN.shellDescription, { network }),
    applicationName: shellName,
    /*
      The network's own icon set. The root layout deliberately declares none —
      it wraps eight wikis and two network hosts and cannot tell which it is
      rendering — and says the answer belongs to whichever layout knows. The
      hub answers for itself and each wiki answers with its own key art; this
      host and the people host answered with nothing, so 321 profiles served a
      blank browser tab. These are the network's, because this host is the
      network's rather than any one game's.
    */
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-touch-icon.png',
    },
    /*
      The network's share card, and the same reasoning as the icons above.

      A link to a profile on either of these hosts unfurled in Slack, Discord
      or a search preview as a bare URL with no image and no site name, because
      `openGraph` is not inherited from a parent that never set one — the root
      layout declares none deliberately, since it cannot tell which of the ten
      sites it is wrapping. Each wiki answers with its own key art; these two
      hosts answered with nothing, on every one of their 321 profiles.

      `/og.png` rather than per-record art on purpose. Most of these companies have a logo this network may not
      redistribute, and 127 of them were deliberately left alone and the card
      would be a claim about which one, which is the rule `PageHeader` and
      `ART_GAME` already state: a picture above a name reads as a picture *of*
      that name. The network's own card claims nothing it cannot support.
    */
    ...hostCard({
      siteName: shellName,
      image: { url: '/og.png', width: 1200, height: 630, alt: shellName },
    }),
  }
}

export default async function CompaniesLayout({ children }: { children: ReactNode }) {
  const [settings, games, site] = await Promise.all([
    getSiteSettings(),
    getPublishedGames(),
    getCompaniesSite(),
  ])

  const rail: RailItem[] = [
    /*
      `crown`, not `person`. The people host already words the pair this way —
      Companies is a crown there, People is a person — and the rail collapses
      to icons at rest, so two rows sharing one glyph is not navigation. One
      meaning per glyph across the network, which is what the second row below
      needs to be readable at all.
    */
    { label: 'All companies', href: '/', icon: 'crown' },
    /*
      The people host is the sibling a reader on this one actually wants, and
      the link went one way only: `people.<domain>` carries Companies in its
      rail and its footer, and this host carried nothing back. The only route
      here to 597 profiles was an officer name on the subset of pages that
      have a "Who runs it" section — a whole site of the network reachable by
      accident. Cross-origin, so a plain href rather than a route.
    */
    { label: 'People', href: personUrl('/'), icon: 'person' },
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
        { label: 'People', href: personUrl('/') },
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
      networkHome={await networkHome()}
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
