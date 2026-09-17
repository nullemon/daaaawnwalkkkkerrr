/**
 * The third-party origins a page will actually open a connection to, for
 * `rel="dns-prefetch"`.
 *
 * Its own module, with no imports, for the reason `email.ts` is separate from
 * `email-adapter.ts`: `tags.ts` reads the settings global, which drags in the
 * Payload config, which needs a database — and the whole value of this
 * function is that it can be checked without one. What it decides is which
 * hosts the document tells the browser to resolve, and a wrong answer there is
 * invisible in every direction.
 *
 * ## Why the list is this short
 *
 * Measured rather than assumed. The served HTML of twelve page types across
 * five hosts references exactly three external origins —
 * `store.steampowered.com`, `en.wikipedia.org` and one studio's own domain —
 * and every one of them is an `<a href>` in a source citation. A link the
 * reader may never click is not a connection the page makes, and hinting one
 * spends a DNS lookup on every page view to save nothing on almost all of
 * them. The network hotlinks no images, embeds no media and loads no avatars
 * from anywhere else.
 *
 * Fonts are self-hosted through `next/font`, so the `fonts.gstatic.com`
 * preconnect that belongs in most projects' heads would be dead weight here —
 * worth stating, because it is the hint somebody will reach for first.
 *
 * ## Why it is conditional
 *
 * What is left is the analytics scripts, and every one is derived from a value
 * an owner has to paste in. So this returns origins only for the tags that are
 * *configured*: an unconfigured wiki — which is all eight of them today —
 * emits no hint at all, exactly as it ships no third-party script tag. A hint
 * for an origin the page never contacts is worse than no hint; it costs a
 * lookup and buys nothing.
 *
 * `dns-prefetch` and deliberately not `preconnect`. All of these load
 * `afterInteractive` and none is needed for first paint, so `preconnect` would
 * put a TLS handshake on the critical path of a site whose whole advantage is
 * being fast, to hurry along a script that draws nothing.
 *
 * `analytics-origins.test.ts` pins each origin against the `src` in
 * `Analytics.tsx`, so a hint cannot outlive the script it was written for.
 */

/** Structurally the `analytics` group of `Tags`, without importing it. */
export type AnalyticsTags = {
  ga4Id?: string | null
  gtmId?: string | null
  plausibleDomain?: string | null
  clarityId?: string | null
  headHtml?: string | null
}

export const analyticsOrigins = (analytics: AnalyticsTags): string[] => {
  const { ga4Id, gtmId, plausibleDomain, clarityId } = analytics
  const origins = new Set<string>()
  // GTM and GA4 are served from the same host, so configuring both — the
  // classic way to double-count every pageview — still yields one hint.
  if (gtmId || ga4Id) origins.add('https://www.googletagmanager.com')
  if (plausibleDomain) origins.add('https://plausible.io')
  if (clarityId) origins.add('https://www.clarity.ms')
  /*
    `headHtml` is the escape hatch and gets nothing. Whatever an owner pastes
    there could name any origin, and guessing one out of arbitrary markup is
    how a hint ends up pointing at a host the page does not use.
  */
  return [...origins]
}
