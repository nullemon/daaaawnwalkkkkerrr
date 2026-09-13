import type { Metadata } from 'next'
import { Archivo, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { themeScript } from '@/components/ThemeToggle'
import { getSiteSettings, siteUrl } from '@/lib/payload'
import './globals.css'

// Self-hosted through next/font: no render-blocking request to a font host,
// and no layout shift, both of which show up directly in Core Web Vitals.
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
})

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
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
    openGraph: {
      siteName: settings.siteName,
      type: 'website',
      locale: 'en',
    },
    robots: { index: true, follow: true },
  }
}

export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  const nav = settings.primaryNav ?? []

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${instrument.variable} ${archivo.variable} ${plexMono.variable}`}>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SiteHeader siteName={settings.siteName} nav={nav} />
        <main id="main">{children}</main>
        <SiteFooter siteName={settings.siteName} note={settings.footerNote} />
      </body>
    </html>
  )
}
