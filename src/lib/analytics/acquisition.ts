/**
 * How a reader arrived — and the honest account of what "direct" means.
 *
 * ## Direct is "no referrer", not "we did not look"
 *
 * `document.referrer` is the empty string for a typed URL, a bookmark, a link
 * out of a native app, a link out of most mail clients, an `https` page linking
 * to `http`, and any site whose referrer policy says `no-referrer`. All of
 * those land in the same bucket, and the bucket is therefore **"the browser
 * sent nothing"** rather than **"they came from nowhere"**. The admin view
 * prints that sentence next to the number, because a Direct share that reads
 * as "our brand is strong" when it actually reads as "modern referrer policies
 * strip a lot" is the kind of confident fiction this whole project exists to
 * avoid.
 *
 * A second thing modern browsers do: `strict-origin-when-cross-origin` is the
 * default policy, so a cross-site referrer arrives as an origin with no path.
 * That is why only the host is ever stored — the path is usually not there to
 * store, and where it is there it is more personal data than this needs.
 *
 * Kept free of Payload types and of I/O so it can be unit-tested, the same
 * reason `lib/reachability.ts` is.
 */

export type Channel = 'direct' | 'search' | 'ai' | 'social' | 'referral' | 'internal' | 'campaign'

export const CHANNELS: readonly { id: Channel; label: string; note: string }[] = [
  {
    id: 'direct',
    label: 'Direct',
    note: 'The browser sent no referrer. A typed URL or a bookmark, but also a link out of an app, out of mail, or from any site whose referrer policy strips it.',
  },
  { id: 'search', label: 'Search', note: 'A search engine’s results page.' },
  {
    id: 'ai',
    label: 'AI assistant',
    note: 'A chat assistant or answer engine citing the page. Counted apart from Search because it is a different kind of arrival and the owner will want to watch it separately.',
  },
  { id: 'social', label: 'Social', note: 'A social network, forum or chat platform.' },
  { id: 'referral', label: 'Referral', note: 'Another site linked to the page.' },
  {
    id: 'internal',
    label: 'Within the network',
    note: 'Another host of this network — the hub, another wiki, the companies or people host. Not an arrival at all, which is why it is never counted as one.',
  },
  {
    id: 'campaign',
    label: 'Campaign',
    note: 'The URL carried a utm_source and no referrer, so the tag is the only account of where it came from.',
  },
]

/** Host suffixes, matched on a label boundary so `notgoogle.com` is not Google. */
const SEARCH = [
  'google.com', 'google.co.uk', 'google.de', 'google.fr', 'google.co.jp', 'google.ca',
  'google.com.au', 'google.co.in', 'google.com.br', 'google.it', 'google.es', 'google.nl',
  'google.pl', 'google.ru', 'google.com.ph', 'bing.com', 'duckduckgo.com', 'yahoo.com',
  'yahoo.co.jp', 'search.yahoo.com', 'yandex.ru', 'yandex.com', 'baidu.com', 'ecosia.org',
  'search.brave.com', 'startpage.com', 'qwant.com', 'naver.com', 'seznam.cz', 'ask.com',
  'search.marginalia.nu', 'mojeek.com', 'lite.duckduckgo.com', 'searx.be', 'kagi.com',
]

const AI = [
  'chat.openai.com', 'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com',
  'perplexity.ai', 'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com',
  'you.com', 'poe.com', 'phind.com', 'grok.com', 'x.ai', 'huggingface.co', 'deepseek.com',
  'mistral.ai', 'meta.ai',
]

const SOCIAL = [
  'reddit.com', 'old.reddit.com', 'x.com', 'twitter.com', 't.co', 'facebook.com', 'fb.com',
  'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'discord.com', 'discordapp.com',
  'threads.net', 'bsky.app', 'mastodon.social', 'linkedin.com', 'lnkd.in', 'pinterest.com',
  'tumblr.com', 'vk.com', 'quora.com', 'medium.com', 'substack.com', 'twitch.tv',
  'steamcommunity.com', 'gamefaqs.gamespot.com', 'resetera.com', 'neogaf.com', 'news.ycombinator.com',
]

/**
 * Does `host` sit at or under `suffix`?
 *
 * The boundary matters: a plain `endsWith` makes `evilgoogle.com` a search
 * engine and `notreddit.com` a social network, which is a misattribution
 * nobody would ever look for. Either the host *is* the suffix, or it ends with
 * a dot and the suffix.
 */
const under = (host: string, suffix: string): boolean =>
  host === suffix || host.endsWith(`.${suffix}`)

const inList = (host: string, list: readonly string[]): boolean =>
  list.some((entry) => under(host, entry))

/**
 * The referrer's host, lowercased, or '' when there is no referrer.
 *
 * Anything that does not parse is treated as no referrer rather than stored as
 * itself. The value arrives from a client that can send whatever it likes, and
 * a column of hostile strings is a column somebody eventually renders.
 */
export const referrerHost = (referrer: string | null | undefined): string => {
  const raw = (referrer ?? '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export type Acquisition = {
  channel: Channel
  /** The referrer host, the campaign source, or 'direct'. Never a full URL. */
  source: string
  campaign: string
}

/**
 * Where this hit came from, given the referrer host, the network's own hosts,
 * and whatever UTM tags were on the URL.
 *
 * `ourHosts` is passed in rather than imported: this module has no business
 * knowing what the network is called, and the set changes when a wiki is
 * added. Getting it wrong in the other direction is the failure worth naming —
 * a reader clicking from the hub to a wiki is not an arrival, and counting it
 * as a referral would inflate every wiki's acquisition with the network's own
 * navigation.
 */
export const acquisitionOf = (args: {
  referrer: string | null | undefined
  ourHosts: ReadonlySet<string>
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
}): Acquisition => {
  const host = referrerHost(args.referrer)
  const campaign = (args.utmCampaign ?? '').trim().slice(0, 64)
  const utmSource = (args.utmSource ?? '').trim().toLowerCase().slice(0, 64)
  const utmMedium = (args.utmMedium ?? '').trim().toLowerCase()

  if (host && args.ourHosts.has(host)) {
    return { channel: 'internal', source: host, campaign }
  }

  if (host) {
    if (inList(host, AI)) return { channel: 'ai', source: host, campaign }
    if (inList(host, SEARCH)) return { channel: 'search', source: host, campaign }
    if (inList(host, SOCIAL)) return { channel: 'social', source: host, campaign }
    return { channel: 'referral', source: host, campaign }
  }

  /*
    No referrer, but the URL was tagged. The tag is then the only account of
    where this came from — and it is an account written by whoever built the
    link rather than observed by anything, which is why it gets its own channel
    instead of being folded into Referral where it would look like evidence.
  */
  if (utmSource) {
    const channel: Channel =
      utmMedium === 'organic' ? 'search' : utmMedium === 'social' ? 'social' : 'campaign'
    return { channel, source: utmSource, campaign }
  }

  return { channel: 'direct', source: 'direct', campaign }
}
