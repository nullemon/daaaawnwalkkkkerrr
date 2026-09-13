import type { Metadata } from 'next'
import { Barlow, Barlow_Semi_Condensed, Cinzel } from 'next/font/google'
import { SiteHeader } from '@/components/SiteHeader'
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

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  const nav = settings.primaryNav ?? []

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
          <SiteHeader siteName={settings.siteName} nav={nav} />
          <main id="main">{children}</main>
          <SiteFooter
            siteName={settings.siteName}
            note={settings.footerNote}
            maintainer={settings.maintainer}
          />
          </RunProvider>
        </AccountProvider>
      </body>
    </html>
  )
}
