import type { Metadata } from 'next'
import { Barlow, Barlow_Semi_Condensed, Cinzel } from 'next/font/google'
import { SiteRail, type RailItem } from '@/components/SiteRail'
import { SiteFooter } from '@/components/SiteFooter'
import { themeScript } from '@/components/ThemeToggle'
import { RunProvider } from '@/components/RunProvider'
import { AccountProvider } from '@/components/AccountProvider'
import { getSiteSettings, siteUrl } from '@/lib/payload'
import './globals.css'

/*
 * Self-hosted through next/font: no render-blocking request to a font host and
 * no layout shift, both of which show up directly in Core Web Vitals.
 *
 * Cinzel is inscriptional Roman capitals — right for a 14th-century setting,
 * and used only on the wordmark and page titles so it never has to carry body
 * text. Barlow does the work: slightly condensed, dense enough for data tables,
 * and readable at 13px where most of this site lives.
 */
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-cinzel',
  display: 'swap',
})

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
})

const barlowCondensed = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  const base = await siteUrl()
  return {
    metadataBase: new URL(base),
    title: {
      default: `${settings.siteName} — ${settings.tagline}`,
      template: `%s · ${settings.siteName}`,
    },
    description: settings.description ?? settings.tagline,
    applicationName: settings.siteName,
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
      images: [{ url: '/og.png', width: 1200, height: 630, alt: settings.tagline }],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/og.png'],
    },
    robots: { index: true, follow: true },
    alternates: {
      types: { 'application/rss+xml': [{ url: '/feed.xml', title: settings.siteName }] },
    },
  }
}

/**
 * These must land on <html>, not <body>.
 *
 * The design tokens that reference them (--f-body and friends) are declared on
 * :root. A custom property whose value references an undefined custom property
 * computes to guaranteed-invalid, so with the classes one level too low every
 * font-family on the site silently fell back to the browser default — which is
 * exactly what was happening until this was caught.
 */
const fontVars = `${cinzel.variable} ${barlow.variable} ${barlowCondensed.variable}`

/**
 * The rail is structural, so it carries an icon per destination. Site settings
 * still own the list and its order; this only says what each one looks like,
 * and anything unrecognised falls back to a generic mark rather than vanishing.
 */
const RAIL_ICONS: Record<string, RailItem['icon']> = {
  '/': 'home',
  '/tools/run-checker': 'hourglass',
  '/run': 'hourglass',
  '/tools/build-planner': 'shield',
  '/quests': 'scroll',
  '/endings': 'book',
  '/items': 'sword',
  '/court': 'crown',
  '/court-activities': 'crown',
  '/characters': 'person',
  '/regions': 'map',
  '/enemies': 'skull',
  '/perks': 'star',
  '/skills': 'spark',
  '/mechanics': 'spark',
  '/builds': 'shield',
  '/guides': 'book',
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  const nav = settings.primaryNav ?? []
  /*
    Home and Your run are appended whatever the CMS says, so the two pages a
    reader always needs cannot be navigated away by an edit. That means the
    list can contain an href twice the moment somebody adds one of them in the
    admin — which happened, and React reported it as a duplicate key rather
     than as the nav bug it is.

    Deduplicating by href fixes it for good: the editor's own entry wins, since
    it carries their label and ordering, and the fallback only fills a gap.
  */
  const candidates: RailItem[] = [
    { label: 'Home', href: '/', icon: 'home' as const },
    ...nav
      .filter((item) => item.href && item.label)
      .map((item) => ({
        label: item.label as string,
        href: item.href as string,
        icon: RAIL_ICONS[item.href as string] ?? ('chevron' as const),
      })),
    { label: 'Your run', href: '/run', icon: 'hourglass' as const },
  ]

  const seen = new Set<string>()
  const rail = candidates.filter((item) => {
    if (seen.has(item.href)) return false
    seen.add(item.href)
    return true
  })

  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AccountProvider>
          <RunProvider>
          <a className="skip" href="#main">
            Skip to content
          </a>
          <div className="shell">
            <SiteRail siteName={settings.siteName} items={rail} />
            <div className="shell-main">
              <main id="main">{children}</main>
              <SiteFooter
                siteName={settings.siteName}
                note={settings.footerNote}
                maintainer={settings.maintainer}
                legalEntity={settings.legalEntity}
                postalAddress={settings.postalAddress}
                contactEmail={settings.contactEmail}
              />
            </div>
          </div>
          </RunProvider>
        </AccountProvider>
      </body>
    </html>
  )
}
