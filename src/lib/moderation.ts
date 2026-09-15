/**
 * Comment screening.
 *
 * Every comment on this network is held for a human. Nothing here decides to
 * publish anything — it decides what a moderator sees first, and it removes
 * the one thing that must never reach a page even by accident: a working link.
 *
 * ## Why links are removed rather than flagged
 *
 * Link spam is not mostly about the click-through. It is about the link
 * existing in HTML on a page with any authority at all, and a queue moderated
 * by a tired person at midnight approves things. Stripping before storage
 * means an approval made by mistake still cannot publish a link, because there
 * is no longer a link in the record to publish. The original is kept verbatim
 * in `original` so a moderator can see what was sent and restore a legitimate
 * one by hand.
 *
 * ## Why the patterns are this paranoid
 *
 * Spammers have been working around naive `https?://` matching for twenty
 * years. `example dot com`, `example[.]com`, `example(.)com`, `hxxp://`,
 * markdown, BBCode and bare domains are all in routine use, and a filter that
 * catches only the first form mostly teaches spammers which form to use.
 *
 * Kept as pure functions with no imports so it can be unit-tested without a
 * database, the same reason `reachability.ts` is shaped that way.
 */

export type Flag =
  | 'link'
  | 'email'
  | 'phone'
  | 'markup'
  | 'shouting'
  | 'repetition'
  | 'spam-vocabulary'
  | 'very-short'
  | 'excessive-emoji'
  | 'invisible-characters'

export type Screening = {
  /** The body as it may be published: links removed, markup neutralised. */
  clean: string
  /** What was taken out, so a moderator can see it without it being live. */
  removed: string[]
  flags: Flag[]
  /** 0–100. Not a verdict — an ordering, so the worst is seen first. */
  score: number
}

/** A placeholder, so a stripped link leaves a visible hole rather than a gap. */
const REDACTION = '[link removed]'

/*
 * Top-level domains common enough in spam to be worth matching bare, without
 * a scheme. Deliberately not the full IANA list: matching every TLD turns
 * ordinary sentences into links, because `.app`, `.dev`, `.zip` and `.day` are
 * all real TLDs and "the final boss.day two" is a sentence, not a domain.
 */
const TLDS =
  'com|net|org|io|co|uk|de|ru|cn|info|biz|xyz|top|site|online|shop|club|live|store|link|click|pw|tk|ml|ga|cf'

const LINK_PATTERNS: RegExp[] = [
  // Markdown and BBCode first: they wrap a URL, so matching them before the
  // bare URL keeps the whole construct from leaving a dangling bracket.
  /\[[^\]]*\]\([^)]*\)/gi,
  /\[url[^\]]*\][\s\S]*?\[\/url\]/gi,
  /\[link[^\]]*\][\s\S]*?\[\/link\]/gi,

  // Schemes, including the ones used to dodge filters.
  /\b(?:h[thxs]{2,4}p?s?|ftp)\s*:\s*\/\/\S+/gi,

  // www.something
  /\bwww\s*[.(\[]+\s*\S+/gi,

  // Bare domains, and the obfuscations of the dot. The separator class covers
  // `example.com`, `example [dot] com`, `example(.)com` and `example -dot- com`.
  new RegExp(
    String.raw`\b[a-z0-9][a-z0-9-]{1,61}\s*(?:\.|\[\s*\.?\s*\]|\(\s*\.?\s*\)|\{\s*\.?\s*\}|[-_\s]*\bd[o0]t\b[-_\s]*)\s*(?:${TLDS})\b(?:\/\S*)?`,
    'gi',
  ),

  // IPv4 with a path, which is how a bare host gets shared.
  /\b\d{1,3}(?:\s*\.\s*\d{1,3}){3}(?:\/\S*)?/g,
]

const EMAIL =
  /\b[a-z0-9._%+-]+\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\s+at\s+)\s*[a-z0-9.-]+\s*(?:\.|\s+dot\s+)\s*[a-z]{2,}\b/gi

/** Long digit runs. Loose on purpose: this flags, it does not remove. */
const PHONE = /(?:\+?\d[\s().-]*){9,}/g

/** HTML and script-ish constructs. Never rendered, but their presence is a signal. */
const MARKUP = /<\s*\/?\s*[a-z][^>]*>|&#x?[0-9a-f]+;|javascript\s*:|data\s*:/gi

/**
 * Zero-width and bidirectional control characters.
 *
 * Used to break up words so a filter does not see them, and to reverse the
 * apparent direction of text. Neither has a legitimate use in a comment about
 * a video game.
 */
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁯﻿]/g

const SPAM_VOCABULARY = [
  'casino', 'betting', 'slot', 'poker', 'crypto', 'bitcoin', 'forex',
  'binary option', 'viagra', 'cialis', 'porn', 'escort', 'loan', 'payday',
  'free robux', 'free v-?bucks', 'generator', 'cheat engine', 'aimbot',
  'seo service', 'backlink', 'guest post', 'buy now', 'limited offer',
  'work from home', 'make money', 'earn \\$', 'click here', 'whatsapp',
  'telegram', 'investment opportunity', 'giveaway',
]

const SPAM_RE = new RegExp(`\\b(?:${SPAM_VOCABULARY.join('|')})\\b`, 'gi')

/** Emoji, roughly. Enough to notice a wall of them. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu

/**
 * Test a pattern without carrying state into the next call.
 *
 * A `/g` regular expression keeps `lastIndex` between calls to `.test()`, and
 * these patterns live at module scope, so a match on one comment left the
 * index part-way along and the *next* comment was tested from the middle of
 * itself. The visible effect was spam vocabulary being detected on every other
 * submission — which is worse than never detecting it, because it looks like
 * the filter works.
 */
const matches = (pattern: RegExp, text: string): boolean => {
  pattern.lastIndex = 0
  const found = pattern.test(text)
  pattern.lastIndex = 0
  return found
}

const countMatches = (text: string, pattern: RegExp): number =>
  (text.match(pattern) ?? []).length

/** Four or more of the same character in a row: "!!!!!", "aaaaaa". */
const hasRunOfSameCharacter = (text: string): boolean => /(.)\1{4,}/.test(text)

/** The share of letters that are capitals, ignoring text with few letters. */
const shoutiness = (text: string): number => {
  const letters = text.replace(/[^a-z]/gi, '')
  if (letters.length < 12) return 0
  const capitals = letters.replace(/[^A-Z]/g, '').length
  return capitals / letters.length
}

/**
 * Screen one comment body.
 *
 * Order matters: invisible characters come out first, because they exist
 * specifically to stop the patterns below from matching.
 */
export const screen = (input: string): Screening => {
  const removed: string[] = []
  const flags = new Set<Flag>()

  let text = input ?? ''

  if (matches(INVISIBLE, text)) {
    flags.add('invisible-characters')
    text = text.replace(INVISIBLE, '')
  }

  // --- Links: removed, not flagged ----------------------------------------
  for (const pattern of LINK_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const trimmed = match.trim()
      // A pattern can fire on something that is not really a link — a sentence
      // ending in a word that happens to precede "co", say. Keep the guard
      // cheap: anything shorter than four characters is not worth redacting.
      if (trimmed.length < 4) return match
      removed.push(trimmed)
      flags.add('link')
      return REDACTION
    })
  }

  text = text.replace(EMAIL, (match) => {
    removed.push(match.trim())
    flags.add('email')
    return '[email removed]'
  })

  // --- Markup: neutralised -------------------------------------------------
  if (matches(MARKUP, text)) {
    flags.add('markup')
    text = text.replace(MARKUP, '')
  }

  // --- Signals: flagged only, the text is left alone ----------------------
  if (matches(PHONE, text)) flags.add('phone')
  if (matches(SPAM_RE, text)) flags.add('spam-vocabulary')
  if (shoutiness(text) > 0.6) flags.add('shouting')
  if (hasRunOfSameCharacter(text)) flags.add('repetition')
  if (countMatches(text, EMOJI) > 8) flags.add('excessive-emoji')

  const clean = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  // A comment that is nothing but a removed link is the classic drive-by.
  const withoutRedactions = clean.replace(/\[(?:link|email) removed\]/g, '').trim()
  if (withoutRedactions.length < 12) flags.add('very-short')

  return { clean, removed, flags: [...flags], score: scoreOf([...flags], removed.length) }
}

/**
 * How suspicious, 0–100.
 *
 * Weighted so that the combinations that actually characterise spam — a link
 * plus almost no text, or a link plus spam vocabulary — score far above the
 * sum of their parts. A real person quoting a wiki URL in an otherwise
 * substantial comment should sort below a moderator's attention, not above it.
 */
export const scoreOf = (flags: Flag[], linkCount = 0): number => {
  const has = (flag: Flag) => flags.includes(flag)

  let score = 0
  if (has('link')) score += 25
  if (linkCount > 1) score += 10 * Math.min(linkCount - 1, 4)
  if (has('email')) score += 20
  if (has('markup')) score += 20
  if (has('invisible-characters')) score += 30
  if (has('spam-vocabulary')) score += 30
  if (has('phone')) score += 15
  if (has('shouting')) score += 10
  if (has('repetition')) score += 5
  if (has('excessive-emoji')) score += 5
  if (has('very-short')) score += 10

  // The tells that rarely occur innocently together.
  if (has('link') && has('very-short')) score += 20
  if (has('link') && has('spam-vocabulary')) score += 20

  return Math.max(0, Math.min(100, score))
}

/** Plain-language reasons, for the moderation queue. */
export const FLAG_LABELS: Record<Flag, string> = {
  link: 'Contained a link — removed before storage',
  email: 'Contained an email address — removed',
  phone: 'Contains a long run of digits, possibly a phone number',
  markup: 'Contained HTML or a script-like construct — stripped',
  shouting: 'Mostly capital letters',
  repetition: 'Repeated characters',
  'spam-vocabulary': 'Uses vocabulary common in spam',
  'very-short': 'Almost no text once links were removed',
  'excessive-emoji': 'Unusually many emoji',
  'invisible-characters': 'Contained zero-width or direction-control characters',
}
