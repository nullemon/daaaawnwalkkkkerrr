/**
 * What sent the request, read off the user-agent — and whether it was a person.
 *
 * ## Why the bot rules are a list with reasons rather than one regular expression
 *
 * Analytics is the easiest place on a site to produce confident fiction, and
 * the bot filter is where most of that fiction is made. A number that has not
 * had crawlers taken out of it is not a readership; a number that has had too
 * much taken out of it is worse, because it is wrong in the reassuring
 * direction and nothing says so.
 *
 * This repository has already paid for the second mistake once. The entity
 * harvester's first "is this a real thing" rule rejected any Title Case name
 * ending in a digit and deleted Antar 4, a real moon. A filter written to stop
 * bad records is still a filter, and an over-broad one throws away the good
 * ones just as silently. So every rule below carries the reason it exists and
 * the admin view prints the list — the rule that excluded a hit is stored on
 * the row, so "why is this number lower than my host's log" has an answer that
 * does not require reading this file.
 *
 * The obvious rule — "user-agent contains bot" — is exactly the Antar 4
 * mistake. `CUBOT_NOTE_20` is an Android phone, `Abbott` is a surname that has
 * appeared in a corporate proxy's agent string, and both contain it. Every
 * rule here is anchored on a token boundary or on a name, never on a substring
 * that a word can contain by accident.
 *
 * ## What this filter cannot do, and the admin view says so
 *
 * Collection is a client beacon, so a crawler that does not execute JavaScript
 * never reaches the endpoint at all and is not in these numbers to be filtered
 * — it is not in them at any point. What arrives here and needs excluding is
 * the smaller set that does run scripts: Googlebot's renderer, link previewers
 * and chat unfurlers, headless Chrome, synthetic monitoring, and the AI
 * crawlers that drive a real engine. The excluded fraction is reported for
 * that reason: it is a floor on crawler traffic, not a measure of it.
 *
 * Kept free of Payload types and of any I/O so it can be unit-tested without a
 * database, the same reason `lib/reachability.ts` is.
 */

export type Device = 'desktop' | 'mobile' | 'tablet' | 'unknown'

export type BotRule = {
  /** Stored on the row and shown in the admin, so an exclusion can be traced. */
  id: string
  /** Why this is not a reader. Printed in the admin next to the rule. */
  why: string
  match: RegExp
}

/**
 * Ordered, and the order is the answer: the first rule that matches is the one
 * recorded. Specific names come before the generic token rule so a row says
 * `googlebot` rather than `crawler-token`, which is more use to somebody
 * asking what the filter took out.
 */
export const BOT_RULES: readonly BotRule[] = [
  {
    id: 'no-user-agent',
    why: 'No user-agent header at all. Every browser sends one; scripts and probes often do not.',
    match: /^$/,
  },
  {
    id: 'search-crawler',
    why: 'A named search engine crawler. This network invites them — sitemaps, IndexNow, an open robots.txt — so they are expected traffic and simply are not readers.',
    match:
      /(googlebot|google-inspectiontool|storebot-google|google-site-verification|bingbot|adidxbot|microsoftpreview|yandex(bot|images|mobilebot)|duckduckbot|duckduckgo-favicons|baiduspider|sogou|exabot|applebot|petalbot|seznambot|naver|yeti\/|qwantify|mojeekbot|marginalia)/,
  },
  {
    id: 'ai-crawler',
    why: 'A crawler that collects pages for a language model or an answer engine. Several of these render JavaScript, so they do reach a client beacon.',
    match:
      /(gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|claude-searchbot|anthropic-ai|perplexitybot|perplexity-user|ccbot|google-extended|bytespider|amazonbot|meta-externalagent|meta-externalfetcher|facebookbot|cohere-ai|diffbot|imagesiftbot|omgili|timpibot|youbot|ai2bot|firecrawl|scrapy)/,
  },
  {
    id: 'link-preview',
    why: 'A chat or social unfurler fetching a page to draw a card. One share can produce several of these and not one reader.',
    match:
      /(facebookexternalhit|twitterbot|slackbot|slack-imgproxy|discordbot|telegrambot|whatsapp|linkedinbot|pinterest(bot)?|redditbot|embedly|quora link preview|skypeuripreview|vkshare|iframely|snapchat|nuzzel|outbrain|flipboard|bitlybot|viber|line-podcast|googleother)/,
  },
  {
    id: 'seo-crawler',
    why: 'A commercial backlink or site-audit crawler. Nobody on this network asked for these and none of them is a reader.',
    match:
      /(ahrefsbot|semrushbot|mj12bot|dotbot|rogerbot|blexbot|dataforseo|serpstat|sitebulb|screaming frog|seokicks|linkdexbot|megaindex|netcraftsurveyagent|zoominfobot|barkrowler|awariobot|paloaltonetworks|internet-?measurement)/,
  },
  {
    id: 'monitoring',
    why: 'Uptime checks and synthetic performance runs. They load the page on a timer with a real engine, so without this rule the busiest reader on the site is a robot pinging it every minute.',
    match:
      /(uptimerobot|pingdom|statuscake|better ?uptime|site24x7|newrelicpinger|gtmetrix|chrome-lighthouse|google page speed|pagespeed|webpagetest|datadog|checkly|updown\.io|hetrixtool|freshping|cron-job\.org)/,
  },
  {
    id: 'headless',
    why: 'A browser engine driven by a script. It renders and runs JavaScript exactly like a reader, which is why it has to be named rather than hoped about.',
    match: /(headlesschrome|phantomjs|puppeteer|playwright|selenium|electron\/|cypress|jsdom|happy-dom)/,
  },
  {
    id: 'http-client',
    why: 'A programming library or a command-line fetcher, not a browser.',
    match:
      /(curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx\/|go-http-client|java\/[0-9]|okhttp|axios\/|node-fetch|undici|got \(|libwww-perl|lwp::|php\/[0-9]|guzzlehttp|httpclient|postmanruntime|insomnia|restsharp|apache-httpclient)/,
  },
  {
    id: 'archiver',
    why: 'An archiving or mirroring agent.',
    match: /(ia_archiver|archive\.org_bot|wayback|heritrix|httrack|webcopier|webzip|teleport ?pro)/,
  },
  {
    id: 'crawler-token',
    why: 'The agent calls itself a bot, crawler or spider as a whole word or as a versioned product token. Anchored on token boundaries: “CUBOT_NOTE_20” is an Android phone and must not match.',
    /*
      Three shapes, and the boundaries in each are the whole point.

        (^|[^a-z0-9])(bot|crawler|spider|slurp|scraper)([^a-z0-9]|$)
          the word standing alone: "MyAgent bot 1.0", "; spider)"
        [a-z0-9](bot|crawler|spider)\/
          the product-token convention every crawler follows: "Foobot/2.1"
        \+https?:\/\/
          a URL in parentheses, which is the convention for "here is who I am
          and how to block me". No consumer browser does this.

      A lone "bot" glued to a preceding letter with no version — the "cubot"
      case — matches none of the three, which is the behaviour being bought.
    */
    match:
      /((^|[^a-z0-9])(bot|crawler|spider|slurp|scraper)([^a-z0-9]|$))|([a-z0-9](bot|crawler|spider)\/)|(\+https?:\/\/)/,
  },
]

/**
 * The first rule this agent trips, or null for a reader.
 *
 * Lowercased once here rather than by each rule, so every pattern above can be
 * written in lower case and none of them needs the `i` flag — a flag that is
 * easy to leave off one line of a long list and impossible to see missing.
 */
export const botRuleFor = (userAgent: string | null | undefined): BotRule | null => {
  const ua = (userAgent ?? '').trim().toLowerCase()
  return BOT_RULES.find((rule) => rule.match.test(ua)) ?? null
}

/** The reason text for a stored rule id, for the admin. Unknown ids read as themselves. */
export const botReason = (id: string): string =>
  BOT_RULES.find((rule) => rule.id === id)?.why ?? 'Recorded by a rule that no longer exists.'

/**
 * Desktop, mobile or tablet — **as the browser claims**.
 *
 * The user-agent is a string the client chooses to send and can be anything at
 * all. It is not evidence, it is a claim, and the admin view labels the whole
 * column that way rather than presenting it as a measurement. Every honest
 * thing that can be done with it is done here: read it, believe it, and say
 * that is what happened.
 *
 * Tablet before mobile. An iPad sends "iPad" and no "Mobile"; an Android
 * tablet sends "Android" *without* "Mobile", which is the only thing
 * separating it from a phone — so the phone test has to be the narrower one.
 */
export const deviceFor = (userAgent: string | null | undefined): Device => {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return 'unknown'
  if (/ipad|tablet|playbook|silk|kindle|nexus (7|9|10)/.test(ua)) return 'tablet'
  if (/android(?!.*mobile)/.test(ua)) return 'tablet'
  if (/iphone|ipod|android|windows phone|blackberry|iemobile|opera mini|mobile/.test(ua))
    return 'mobile'
  if (/windows nt|macintosh|x11|linux|cros/.test(ua)) return 'desktop'
  return 'unknown'
}

/**
 * The browser family, coarsely, and in the order the tokens lie about each
 * other.
 *
 * Every Chromium browser claims to be Chrome and Safari; Edge claims to be
 * Chrome; Chrome on iOS claims to be Safari because it is. So the specific
 * names have to be tested before the generic ones or everything on the chart
 * reads "Chrome". Coarse on purpose — a version number is a fingerprinting bit
 * and answers no question the owner has.
 */
export const browserFor = (userAgent: string | null | undefined): string => {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return 'unknown'
  if (/edg[ae]?\//.test(ua)) return 'Edge'
  if (/opr\/|opera/.test(ua)) return 'Opera'
  if (/samsungbrowser/.test(ua)) return 'Samsung Internet'
  if (/vivaldi/.test(ua)) return 'Vivaldi'
  if (/brave/.test(ua)) return 'Brave'
  if (/ucbrowser/.test(ua)) return 'UC Browser'
  if (/yabrowser/.test(ua)) return 'Yandex Browser'
  if (/firefox\/|fxios/.test(ua)) return 'Firefox'
  if (/crios/.test(ua)) return 'Chrome'
  if (/chrome\/|chromium/.test(ua)) return 'Chrome'
  if (/safari\//.test(ua)) return 'Safari'
  return 'unknown'
}

/** The operating system family, equally coarsely, and iOS before macOS for the same reason. */
export const osFor = (userAgent: string | null | undefined): string => {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return 'unknown'
  if (/windows nt/.test(ua)) return 'Windows'
  if (/iphone|ipad|ipod|ios/.test(ua)) return 'iOS'
  if (/android/.test(ua)) return 'Android'
  if (/cros/.test(ua)) return 'ChromeOS'
  if (/mac os x|macintosh/.test(ua)) return 'macOS'
  if (/linux|x11/.test(ua)) return 'Linux'
  return 'unknown'
}
