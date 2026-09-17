import { getSiteSettings } from './payload'
import { getUi } from './ui'
import { fill } from './copy'
import { hub } from './urls'

/**
 * The rail's way back to the network, built once for the nine hosts that need
 * one.
 *
 * Every wiki, the companies host and the people host is its own origin, so `/`
 * on any of them is that site's own front page. A reader who arrived on a
 * Gears page from a search had no route to the other nine except by editing
 * the address bar: the footer carried "All wikis", which is the sitemap rather
 * than the navigation, and nobody scrolls to a footer to go up a level.
 *
 * It is a function rather than four lines copied into three layouts because
 * the three would drift — one would keep the old wording, or the hub link
 * would be written as a literal on one host and as `hub('/')` on the others,
 * and the literal is right in dev or in production but never in both.
 *
 * The hub does not call it. A link from the network's home to the network's
 * home is a row that does nothing, and `Shell` renders nothing when it is not
 * given one, so opting out is not a thing anybody has to remember.
 */
export const networkHome = async (): Promise<{ label: string; href: string }> => {
  const [settings, ui] = await Promise.all([getSiteSettings(), getUi()])
  return {
    /*
      "Vellum" is a working title and will not survive launch, so the name is
      read from Site settings rather than typed here — otherwise the day it
      changes, ten rails keep saying the old one and nothing errors. The
      fallback is deliberately generic for the same reason: a blank settings
      record should render the site the code does, not a name the owner never
      chose.
    */
    label: fill(ui.t('nav.network-home'), { network: settings.siteName ?? 'Network' }),
    href: hub('/'),
  }
}
