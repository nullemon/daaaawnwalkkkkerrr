/**
 * Is this text what the source actually said?
 *
 * Almost every string on this network was read off somebody else's HTML —
 * Wikipedia, Fandom, a Steam listing — and each of those has its own idea of
 * how a character reaches a scraper. The failures are all silent in the same
 * way: nothing throws, the page renders, the row is counted, verified and
 * committed, and the only symptom is a name spelled wrong on a page about a
 * living person.
 *
 * Deliberately free of Payload types and of any database call, the same way
 * `reachability.ts` and `sitemap-images.ts` are, so the rules can be unit
 * tested without a database and applied to the raw harvest before any of it
 * becomes a record.
 *
 * ## Why every pattern is built from code points
 *
 * Because a file describing invisible characters must not contain any.
 *
 * The first draft of this file wrote its character classes as backslash-u
 * escapes, which is the readable form - and the escapes were interpreted on
 * the way to disk, so what landed was the characters themselves. The regexes
 * still worked, every test here passed, and
 * `tools/no-control-characters.test.mjs` failed on the file that exists to
 * describe the fault it guards against. That test's own header says the cause
 * is environmental and has happened four times to different authors; this is
 * the fifth. `String.fromCharCode` has no escape to interpret, so it cannot
 * happen to this file again.
 *
 * ## What is a fault and what is a judgement
 *
 * Only mechanical faults are listed here. A replacement character is a byte
 * that was lost; UTF-8 read as cp1252 is a decoding that went wrong; an
 * undecoded entity is markup that reaches a reader as those eight literal
 * characters, because React escapes what it renders. Each has exactly one
 * correct repair and no opinion in it.
 *
 * What is **not** here is guessing the right spelling of a name. If a source
 * wrote `Stephanie` where the person spells it with an acute accent,
 * nothing in this file can tell - the text is well-formed, it is simply wrong,
 * and adding the accent is the invented fact this project exists to avoid.
 * Those go on a list for somebody to read.
 */

export type EncodingFault = {
  /** Which rule fired, for grouping a report. */
  rule: string
  /** Why it is wrong, in words somebody reading a check's output can act on. */
  why: string
  /** Enough of the string either side of the match to recognise the record. */
  excerpt: string
}

// --- the alphabet, by number ----------------------------------------------

const ch = (code: number): string => String.fromCharCode(code)
const range = (from: number, to: number): string => `${ch(from)}-${ch(to)}`
const cls = (...parts: string[]): string => `[${parts.join('')}]`

const REPLACEMENT = 0xfffd
const NBSP_CODE = 0x00a0
const SOFT_HYPHEN = 0x00ad
const ZERO_WIDTH = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map(ch).join('')
const LINE_SEPARATORS = [0x2028, 0x2029].map(ch).join('')

/** Tab, newline and carriage return are the only ones that belong in text. */
const CONTROLS = [range(0x00, 0x08), ch(0x0b), ch(0x0c), range(0x0e, 0x1f), ch(0x7f)].join('')

/**
 * The cp1252 signatures: the bytes UTF-8 turns into when something decoded it
 * one byte at a time.
 *
 * A lead byte followed by a *continuation byte*, which is a pair no language
 * writes. Matching on the lead byte alone would reject `SÃO PAULO`, and a
 * filter written to stop bad records is still a filter — the first version of
 * `isNotAnEntity` deleted a real moon for exactly that kind of over-reach.
 *
 * The trailing half is the printable window a continuation byte lands in after
 * cp1252 has had its turn: 0x80 to 0xBF, except that cp1252 maps 0x80 to 0x9F
 * onto typographic characters instead, so both forms are listed.
 */
const CP1252_HIGH = [
  range(0x80, 0xbf),
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
    0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
    0x0153, 0x017e, 0x0178,
  ]
    .map(ch)
    .join(''),
].join('')

const MOJIBAKE = [
  // C3 xx — a Latin-1 letter: "Ã©" for é, "Ã¼" for ü.
  `${ch(0x00c3)}${cls(CP1252_HIGH)}`,
  // E2 80 xx — the typographic punctuation: "â€™" for a curly apostrophe.
  `${ch(0x00e2)}${cls(ch(0x20ac) + ch(0x0080))}`,
  // C2 xx — the stray "Â" that turns up before a nbsp, a £ or a °.
  `${ch(0x00c2)}${cls(CP1252_HIGH)}`,
  // D0/D1 xx — Cyrillic.
  `${ch(0x00d0)}${cls(range(0x81, 0xbf))}|${ch(0x00d1)}${cls(range(0x80, 0x8f))}`,
].join('|')

/**
 * Entities a wiki infobox or a store listing actually produces.
 *
 * Deliberately a list rather than `&\w+;`: an ampersand followed by a word and
 * a semicolon turns up in ordinary prose often enough ("Q&A; see below"), and
 * a check that cries wolf is a check somebody turns off.
 */
const ENTITY_NAMES = [
  'amp', 'lt', 'gt', 'quot', 'apos', 'nbsp', 'rsquo', 'lsquo', 'ldquo', 'rdquo', 'ndash', 'mdash',
  'hellip', 'eacute', 'egrave', 'uuml', 'ouml', 'auml', 'szlig', 'ccedil', 'oacute', 'aacute',
  'iacute', 'uacute', 'ntilde', 'copy', 'reg', 'trade', 'deg', 'middot', 'bull', 'prime', 'times',
]

const RULES: { rule: string; re: RegExp; why: string }[] = [
  {
    rule: 'replacement',
    re: new RegExp(ch(REPLACEMENT)),
    why: 'a replacement character — a byte was lost before this was stored, and no repair can say what it was',
  },
  {
    rule: 'mojibake',
    re: new RegExp(MOJIBAKE),
    why: 'UTF-8 read as cp1252 — the bytes are right and the decoding was not',
  },
  {
    rule: 'entity',
    re: new RegExp(`&#x?[0-9A-Fa-f]{2,6};|&(?:${ENTITY_NAMES.join('|')});`),
    why: 'an HTML entity that was never decoded — React escapes what it renders, so a reader sees the eight characters of "&ndash;"',
  },
  {
    rule: 'zero-width',
    re: new RegExp(cls(ZERO_WIDTH + ch(SOFT_HYPHEN))),
    why: 'a zero-width or soft-hyphen character — invisible on the page and fatal to any match, sort or slug',
  },
  {
    rule: 'control',
    re: new RegExp(cls(CONTROLS)),
    why: 'a control character — the same fault `tools/no-control-characters.test.mjs` guards source against',
  },
  {
    rule: 'line-separator',
    re: new RegExp(cls(LINE_SEPARATORS)),
    why: 'a Unicode line or paragraph separator, which is a line break to a JSON parser and to nothing else',
  },
]

/**
 * A non-breaking space, which is a fault only where something matches on the
 * value.
 *
 * In a sentence it is what the source wrote and often what it meant — "10 km"
 * held together. In a title, a name or a slug it is a space that does not
 * equal a space, so a lookup that should hit misses and reports nothing at
 * all. Kept out of `encodingFaults` for that reason and asked for explicitly.
 */
const NBSP = {
  rule: 'nbsp',
  re: new RegExp(ch(NBSP_CODE)),
  why: 'a non-breaking space in a value something matches on — it is not the space a lookup will use',
}

const excerptAt = (text: string, re: RegExp): string => {
  const match = re.exec(text)
  const at = match ? match.index : 0
  return JSON.stringify(text.slice(Math.max(0, at - 30), at + 40))
}

/** Every mechanical fault in one string. Empty means the text is sound. */
export const encodingFaults = (text: string): EncodingFault[] =>
  RULES.filter(({ re }) => re.test(text)).map(({ rule, why, re }) => ({
    rule,
    why,
    excerpt: excerptAt(text, re),
  }))

/**
 * The same, plus the faults that only matter in a title, a name or a slug.
 *
 * Used for the fields something looks a record up by, where an invisible
 * character is the difference between a match and a silence.
 */
export const identifierFaults = (text: string): EncodingFault[] => {
  const faults = encodingFaults(text)
  if (NBSP.re.test(text)) {
    faults.push({ rule: NBSP.rule, why: NBSP.why, excerpt: excerptAt(text, NBSP.re) })
  }
  return faults
}

// --- the repair -----------------------------------------------------------

/**
 * What each named entity stands for, by code point.
 *
 * Numbers rather than the characters themselves for the reason at the top of
 * this file: a table of characters is a table that can be mangled in transit,
 * and a mangled repair table is worse than no repair at all — it would write
 * the fault in rather than out.
 */
const NAMED: Record<string, number> = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0x00a0,
  rsquo: 0x2019, lsquo: 0x2018, ldquo: 0x201c, rdquo: 0x201d,
  ndash: 0x2013, mdash: 0x2014, hellip: 0x2026,
  eacute: 0x00e9, egrave: 0x00e8, uuml: 0x00fc, ouml: 0x00f6, auml: 0x00e4,
  szlig: 0x00df, ccedil: 0x00e7, oacute: 0x00f3, aacute: 0x00e1,
  iacute: 0x00ed, uacute: 0x00fa, ntilde: 0x00f1,
  copy: 0x00a9, reg: 0x00ae, trade: 0x2122, deg: 0x00b0,
  middot: 0x00b7, bull: 0x2022, prime: 0x2032, times: 0x00d7,
}

/** Is this code point safe to write into stored prose? */
const printable = (code: number): boolean => {
  if (code === 0x09 || code === 0x0a || code === 0x20) return true
  if (code < 0x20 || code === 0x7f) return false
  if (code === 0x2028 || code === 0x2029) return false
  return code <= 0x10ffff
}

/**
 * Decode the entities a harvester left behind, and only those.
 *
 * A table rather than a general decoder on purpose. A general one would
 * happily turn `&#0;` into a control character and `&#x2028;` into a line
 * separator — new faults, introduced by the repair, of exactly the kind the
 * rules above exist to catch.
 */
export const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9A-Fa-f]{1,6});/g, (whole, hex: string) => {
      const code = parseInt(hex, 16)
      return printable(code) ? String.fromCodePoint(code) : whole
    })
    .replace(/&#(\d{1,7});/g, (whole, digits: string) => {
      const code = Number(digits)
      return printable(code) ? String.fromCodePoint(code) : whole
    })
    /*
      Named entities resolve in one pass, which is what keeps `&amp;` from
      unwinding a layer too many.

      A value that arrived double-escaped holds `&amp;ndash;`. Replacing the
      ampersand first turns that into `&ndash;` and a second pass turns it into
      an en dash — a repair that silently decided the source had written
      punctuation when what it wrote was the text of an entity. One pass over
      the table leaves `&ndash;`, which is what the source said.
    */
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => {
      const code = NAMED[name.toLowerCase()]
      return code === undefined ? whole : String.fromCharCode(code)
    })

/** Remove what is invisible on the page and fatal to a match. */
export const stripInvisible = (text: string): string =>
  text.replace(new RegExp(cls(ZERO_WIDTH + ch(SOFT_HYPHEN)), 'g'), '')

/**
 * The repair, for the faults that have one.
 *
 * Decode what was never decoded, drop what is invisible, and leave everything
 * else exactly as the source wrote it. A replacement character is deliberately
 * **not** repaired: the byte behind it is gone, and anything put in its place
 * would be this site inventing a character.
 */
export const repairText = (text: string): string => stripInvisible(decodeEntities(text))
