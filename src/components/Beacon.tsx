'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * The only thing on this network that knows a page was read.
 *
 * ## Why a client beacon, rather than counting on the server
 *
 * Every public page here prerenders to static HTML and is served from a file.
 * There is no per-request render to hook into, and giving the site one so it
 * could count visits would trade the thing that makes it fast for a number. So
 * the page tells the server it was opened, once, after it has painted.
 *
 * This is stated plainly in the admin because it changes what the numbers
 * *are*. A reader with JavaScript off is not counted. A crawler that fetches
 * HTML and does not execute it is not counted — which is most of them, and is
 * why the bot filter's excluded fraction is a floor on crawler traffic rather
 * than a measure of it. The host's access log will always be the bigger number
 * and this will always be the more useful one.
 *
 * ## What it sends, and nothing else
 *
 * The path, the referrer, the URL's own query string (read for UTM tags only
 * and never stored), and whether `navigator.webdriver` is set. That is the
 * whole payload. It does not send an identifier, a country or a device class:
 * the route derives those from things the page cannot forge, because a client
 * that could supply its own visitor key could be as many readers as it liked.
 *
 * ## Global Privacy Control and Do Not Track are honoured
 *
 * Both are a reader saying, in the one place a browser gives them to say it,
 * that they would rather not be counted. Honouring them costs a handful of
 * page views and the admin says the numbers exclude them, which is a smaller
 * price than a privacy policy that has to explain why the signal was ignored.
 *
 * ## Once per page, and the first one is the only arrival
 *
 * `document.referrer` does not change across a client-side navigation — it
 * stays whatever brought the tab to the site. Sending it on every view would
 * credit the whole session to one search result and make the acquisition
 * breakdown a count of sessions multiplied by their depth. So only the first
 * view of a page load carries it; every later one reports this site as its own
 * referrer, which the route files as "within the network" — which is what it
 * is.
 */
export function Beacon() {
  const pathname = usePathname()
  /* The last path actually sent. React 19 runs effects twice in development;
     without this every page view in dev is two. */
  const sent = useRef<string | null>(null)
  const first = useRef(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sent.current === pathname) return
    sent.current = pathname

    const nav = window.navigator as Navigator & {
      globalPrivacyControl?: boolean
      msDoNotTrack?: string
      webdriver?: boolean
    }
    if (nav.globalPrivacyControl === true) return
    if (nav.doNotTrack === '1' || nav.msDoNotTrack === '1') return

    const isFirst = first.current
    first.current = false

    const body = JSON.stringify({
      p: window.location.pathname,
      r: isFirst ? document.referrer : window.location.origin,
      q: window.location.search,
      w: nav.webdriver === true,
    })

    /*
      `keepalive`, so a view recorded as the reader clicks away still leaves.
      A plain fetch is cancelled when the document goes, which loses exactly
      the page views of people who read one page and left — the ones a bounce
      figure is made of.

      Caught and dropped. They came here to read about a quest; a failed count
      is our problem and must never be a red line in their console.
    */
    void fetch('/api/hit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      /*
        Same-origin only. `/api` is in PASS_THROUGH in proxy.ts, so this
        resolves on whichever of the ten hosts is serving and the Host header
        it arrives with is the one thing that knows which site the reader was
        on — the reader's URL has had the game prefix hidden from it.
      */
      credentials: 'omit',
    }).catch(() => {})
  }, [pathname])

  return null
}
