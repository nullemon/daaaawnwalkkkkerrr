import type { Metadata } from 'next'
import { Kanit, Rubik } from 'next/font/google'
import { themeBootScript } from '@/lib/appearance'
import { getAppearance } from '@/lib/appearance-settings'
import { RunProvider } from '@/components/RunProvider'
import { AccountProvider } from '@/components/AccountProvider'
import { UiStringsProvider } from '@/components/UiStrings'
import { Beacon } from '@/components/Beacon'
import { getSiteSettings, siteUrl } from '@/lib/payload'
import { getUiMaps } from '@/lib/ui'
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
 * Kanit is the display face and it is only ever set italic, heavy and in
 * capitals — the broadcast-graphics register the whole visual layer is built
 * on, where a heading reads as a lower-third rather than a line of text. It
 * carries wordmarks, page titles, section heads, labels and figures and never
 * body copy. Rubik does the body: round enough to sit beside a slanted
 * display face without fighting it, dense enough for a data table at 13px.
 *
 * Both weights of the italic are loaded because the two do different jobs:
 * 900 is a title, 800 is a label or a figure, and a label set in the title
 * weight reads as a second title.
 */
const kanit = Kanit({
  subsets: ['latin'],
  weight: ['500', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-kanit',
  display: 'swap',
})

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-rubik',
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
const fontVars = `${kanit.variable} ${rubik.variable}`

/*
 * The interface-text overrides are read here and nowhere else.
 *
 * This is the one layout above the hub, all eight wikis and the companies host,
 * so one read covers every page in the network and the cached global is fetched
 * once per render rather than once per component. The provider sits outside
 * `AccountProvider` because that one says things to the reader too — "Could not
 * reach the server" is a registry string, and a provider cannot use a context
 * mounted below it.
 */
export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const ui = await getUiMaps()
  const { defaultTheme, lock, accent } = await getAppearance()
  const boot = themeBootScript(defaultTheme, lock)

  /*
    The page-view beacon, and whether it is sent at all.

    This is the one layout above the hub, all eight wikis, the companies host
    and the people host, so mounting it here is what makes the measurement
    cover the network rather than whichever routes somebody remembered. It
    renders nothing — see `components/Beacon.tsx` for why a static site has to
    be counted from the browser.

    The switch is Site settings → SEO & analytics → Measure page views. Off
    means the component is not rendered and no request is made, rather than a
    request that is made and discarded: "loads nothing while off" is a sentence
    the privacy policy is entitled to rely on.

    `!== false` rather than `=== true`, because a global nobody has ever saved
    hands back `undefined` for a checkbox and a fresh install must measure
    rather than silently not.
  */
  const settings = await getSiteSettings()
  const measuring =
    (settings.analytics as { firstParty?: boolean } | undefined)?.firstParty !== false

  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        {/*
          A bare <script>, rendered by this server component, and it has to be.

          It used to be `next/script` at `beforeInteractive`, with a comment
          claiming that avoided React's "scripts inside React components are
          never executed" warning. Both halves were wrong. next/script is
          itself a client component rendering a <script> of its own, which is
          what the warning was about - and what that script contained was not
          this code. It was `(self.__next_s=self.__next_s||[]).push([...])`, a
          queue Next's own runtime drains once the bundle has loaded, which is
          after first paint. The one thing this script exists to do before
          anything is drawn was happening after it, so a reader whose toggle
          is set against their system preference got a flash of the other
          theme on every cold load, on every page.

          React only warns when it *creates* a script element during a client
          render. A server component's script is in the HTML, hydrated rather
          than created, so this form both runs before paint and says nothing.

          suppressHydrationWarning on <html> above is what lets it: the
          attribute this sets is on the element React is hydrating.
        */}
        <script id="theme-before-paint" dangerouslySetInnerHTML={{ __html: boot }} />
        {/*
          The accent override, when there is one. Empty string when there is
          not, and then nothing is emitted at all - the shipped red is in
          globals.css and a blank field must fall back to it rather than to
          nothing. Generated from a validated hex; nothing an editor typed
          reaches the document as anything but a colour.
        */}
        {accent ? <style dangerouslySetInnerHTML={{ __html: accent }} /> : null}
      </head>
      <body>
        <UiStringsProvider value={ui}>
          <AccountProvider>
            <RunProvider>{children}</RunProvider>
            {measuring ? <Beacon /> : null}
          </AccountProvider>
        </UiStringsProvider>
      </body>
    </html>
  )
}
