import type { Metadata } from 'next'
import { Barlow, Barlow_Semi_Condensed, Cinzel } from 'next/font/google'
import { themeScript } from '@/components/ThemeToggle'
import { RunProvider } from '@/components/RunProvider'
import { AccountProvider } from '@/components/AccountProvider'
import { getSiteSettings, siteUrl } from '@/lib/payload'
import './globals.css'

/*
 * The document, and nothing else.
 *
 * Everything that varies between the hub and a game's wiki — the rail, the
 * footer's site map, the titles — moved down into `(network)/layout.tsx` and
 * `[game]/layout.tsx` when the site became a network. What is left here is
 * what every page in the network genuinely shares: the fonts, the theme
 * script, the two client providers, and the metadata defaults a page can
 * override but should not have to restate.
 */

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
    /*
      Deliberately no title here.

      This layout wraps both the hub and all seven wikis, so it cannot know
      which site it is. It used to set `title.template` from the network name,
      and a child's `title.default` augments the closest parent's template —
      which is why every wiki's home read "Onimusha: Way of the Sword guide,
      wiki and database · Dawnwalker Guide". The title belongs to whichever
      layout knows the answer: `(network)` or `[game]`.
    */
    description: settings.description ?? settings.tagline,
    /*
      No icons and no open-graph image here either, for the same reason as the
      title: this layout wraps eight sites and cannot tell which one it is
      rendering. A child's `icons` replaces a parent's outright rather than
      merging, so leaving a set here would only ever have applied to whichever
      site forgot to declare its own — which is the wrong way round.

      The hub sets its own in `(network)/layout.tsx`; each wiki sets its own in
      `[game]/layout.tsx`.
    */
    robots: { index: true, follow: true },
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

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AccountProvider>
          <RunProvider>{children}</RunProvider>
        </AccountProvider>
      </body>
    </html>
  )
}
