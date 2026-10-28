/**
 * WebSub: telling a hub that a feed has changed.
 *
 * Both feeds on every wiki name a hub in a `rel="hub"` link. A feed reader
 * that supports WebSub subscribes at the hub once and is then *told* about a
 * new entry rather than polling for it, which is the difference between a
 * guide appearing in somebody's reader in seconds and appearing some time in
 * the next day. Google's public hub is the one every reader already knows;
 * it is a plain open endpoint and needs no account.
 *
 * ## It is the IndexNow posture, exactly
 *
 * This is called from the same `afterChange` hook that queues an IndexNow
 * submission, under the same guard, and it never throws and never delays a
 * save: an editor's publish is the thing that matters and a hub's opinion of
 * it is not. One POST per publish — the hub de-duplicates and fetches the
 * feed itself, so there is nothing to batch.
 *
 * ## Why the page URL is the argument
 *
 * The hook knows the page it just announced, and the feeds live at the root
 * of that page's host. Deriving them from the page rather than from
 * `NEXT_PUBLIC_SITE_URL` directly keeps the one place that composes a wiki's
 * host (`recordUrl`) the one place, so a wiki on a custom `subdomain` is
 * announced at the host it actually serves on.
 */

export const WEBSUB_HUB = 'https://pubsubhubbub.appspot.com/'

/** The two feeds on the host a page is served from. */
export const feedUrls = (pageUrl: string): string[] => {
  const { origin } = new URL(pageUrl)
  return [`${origin}/feed.xml`, `${origin}/atom.xml`]
}

/** The form body a hub's publish endpoint takes: one `hub.url` per feed. */
export const publishBody = (feeds: string[]): URLSearchParams => {
  const body = new URLSearchParams()
  body.set('hub.mode', 'publish')
  for (const feed of feeds) body.append('hub.url', feed)
  return body
}

type Fetch = typeof fetch

/**
 * Tell the hub. Resolves to whether the hub accepted it; logs and swallows
 * everything else, because nothing here may fail a publish.
 *
 * `Connection: close`, for the reason every request in this repository
 * carries it: a keep-alive socket still closing when a node process exits
 * trips a libuv assertion on Windows and prints a stack trace over the line
 * that explained what happened.
 */
export const announceFeeds = async (
  pageUrl: string,
  log: (message: string) => void = () => {},
  fetchImpl: Fetch = fetch,
): Promise<boolean> => {
  const feeds = feedUrls(pageUrl)
  try {
    const response = await fetchImpl(WEBSUB_HUB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Connection: 'close' },
      body: publishBody(feeds).toString(),
    })
    /* The hub answers 204 when it has taken the URLs. Anything else is
       reported with its status so a wrong host can be seen in the log. */
    if (response.status === 204) {
      log(`${new URL(pageUrl).host}: hub told about ${feeds.length} feeds`)
      return true
    }
    log(`${new URL(pageUrl).host}: hub answered ${response.status}`)
    return false
  } catch (error) {
    log(`${new URL(pageUrl).host}: hub unreachable — ${(error as Error).message}`)
    return false
  }
}
