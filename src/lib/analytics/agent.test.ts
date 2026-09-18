import { describe, expect, it } from 'vitest'
import { BOT_RULES, botReason, botRuleFor, browserFor, deviceFor, osFor } from './agent'

/**
 * The bot filter, pinned in **both** directions.
 *
 * One direction is obvious: a crawler has to be excluded or every number on
 * the analytics screen is inflated by traffic that cannot read.
 *
 * The other direction is the one this repository has already paid for. The
 * entity harvester's first "is this a real thing" rule rejected any Title Case
 * name ending in a digit and deleted Antar 4, a real moon on the Star Wars
 * wiki. A filter written to stop bad records is still a filter, and an
 * over-broad one throws away the good records just as silently — nothing
 * errors, the count simply comes out lower and looks fine.
 *
 * The analytics equivalent is `CUBOT_NOTE_20`, a real Android phone whose
 * user-agent contains the letters "bot". The naive rule excludes every one of
 * those readers and nothing anywhere says so. Both halves are pinned below.
 */

/* Real strings, from real browsers. Every one of these is a reader. */
const READERS = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  edge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipad:
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  /* The Antar 4 of user-agents: a real phone whose model name contains "bot". */
  cubot:
    'Mozilla/5.0 (Linux; Android 11; CUBOT_NOTE_20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.104 Mobile Safari/537.36',
  /* A second one, for the same reason: "Robot" is a product name here. */
  robotName:
    'Mozilla/5.0 (Linux; Android 10; Robot X1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.0.0 Mobile Safari/537.36',
}

const CRAWLERS = {
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  claudebot: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  ahrefs: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  lighthouse:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Chrome-Lighthouse',
  headless:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
  curl: 'curl/8.4.0',
  python: 'python-requests/2.31.0',
  uptime: 'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
  /* No header at all. Every browser sends one; a script often does not. */
  none: '',
}

describe('botRuleFor — crawlers are excluded', () => {
  for (const [name, ua] of Object.entries(CRAWLERS)) {
    it(`${name} matches a rule`, () => {
      expect(botRuleFor(ua)?.id, ua).toBeTruthy()
    })
  }

  it('records which rule matched, so an exclusion can be traced', () => {
    expect(botRuleFor(CRAWLERS.googlebot)?.id).toBe('search-crawler')
    expect(botRuleFor(CRAWLERS.gptbot)?.id).toBe('ai-crawler')
    expect(botRuleFor(CRAWLERS.facebook)?.id).toBe('link-preview')
    expect(botRuleFor(CRAWLERS.uptime)?.id).toBe('monitoring')
    expect(botRuleFor(CRAWLERS.headless)?.id).toBe('headless')
    expect(botRuleFor(CRAWLERS.curl)?.id).toBe('http-client')
    expect(botRuleFor(CRAWLERS.none)?.id).toBe('no-user-agent')
  })

  it('catches an unknown crawler by the conventions crawlers follow', () => {
    // Never seen before, but it uses the product-token form and advertises a
    // URL — the two things no consumer browser does.
    expect(botRuleFor('Mozilla/5.0 (compatible; Quibblebot/0.3; +https://quibble.example)')?.id).toBe(
      'crawler-token',
    )
    expect(botRuleFor('SomeAgent spider 1.0')?.id).toBe('crawler-token')
  })
})

describe('botRuleFor — readers are not', () => {
  for (const [name, ua] of Object.entries(READERS)) {
    it(`${name} is a reader`, () => {
      expect(botRuleFor(ua), ua).toBeNull()
    })
  }

  it('does not exclude a phone whose model name contains “bot”', () => {
    /*
      The Antar 4 case. `ua.includes('bot')` is true for this string, and the
      rule that would have used it would have silently dropped every CUBOT
      owner from every figure on the analytics screen.
    */
    expect(READERS.cubot.toLowerCase()).toContain('bot')
    expect(botRuleFor(READERS.cubot)).toBeNull()
  })
})

describe('botReason', () => {
  it('gives a sentence for every rule, because the admin prints them', () => {
    for (const rule of BOT_RULES) expect(botReason(rule.id).length).toBeGreaterThan(20)
  })

  it('does not pretend to know an id it has never heard of', () => {
    expect(botReason('invented')).toMatch(/no longer exists/)
  })
})

describe('deviceFor', () => {
  it('reads a phone, a tablet and a desktop apart', () => {
    expect(deviceFor(READERS.iphone)).toBe('mobile')
    expect(deviceFor(READERS.androidPhone)).toBe('mobile')
    expect(deviceFor(READERS.ipad)).toBe('tablet')
    /* Android without "Mobile" is the only thing separating a tablet from a
       phone, which is why the tablet test has to come first. */
    expect(deviceFor(READERS.androidTablet)).toBe('tablet')
    expect(deviceFor(READERS.chromeWindows)).toBe('desktop')
    expect(deviceFor(READERS.safariMac)).toBe('desktop')
  })

  it('says unknown rather than guessing', () => {
    expect(deviceFor('')).toBe('unknown')
    expect(deviceFor('something nobody has seen')).toBe('unknown')
  })
})

describe('browserFor and osFor', () => {
  it('does not let every Chromium browser claim to be Chrome', () => {
    expect(browserFor(READERS.edge)).toBe('Edge')
    expect(browserFor(READERS.samsung)).toBe('Samsung Internet')
    expect(browserFor(READERS.chromeWindows)).toBe('Chrome')
    expect(browserFor(READERS.safariMac)).toBe('Safari')
    expect(browserFor(READERS.firefoxLinux)).toBe('Firefox')
  })

  it('puts iOS before macOS, which an iPad claims to be part of', () => {
    expect(osFor(READERS.ipad)).toBe('iOS')
    expect(osFor(READERS.iphone)).toBe('iOS')
    expect(osFor(READERS.safariMac)).toBe('macOS')
    expect(osFor(READERS.androidPhone)).toBe('Android')
    expect(osFor(READERS.chromeWindows)).toBe('Windows')
  })

  it('says unknown rather than guessing', () => {
    expect(browserFor('')).toBe('unknown')
    expect(osFor('')).toBe('unknown')
  })
})
