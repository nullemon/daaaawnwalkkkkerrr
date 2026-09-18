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
 * ## Two halves, one alphabet, and why half of it is a `.mjs` file
 *
 * This file **finds** faults. `./text-encoding-table.mjs` beside it holds the
 * alphabet, the named-entity table and the repair, because the six harvesters
 * in `tools/` need exactly those and are plain `node tools/x.mjs` with no
 * TypeScript loader. Its header has the full reasoning; the short version is
 * that a second copy of the table for the tools would drift, and **a drifted
 * repair table writes faults in rather than out**. Its basename deliberately
 * differs from this one's — a `text-encoding.mjs` shadows this module in every
 * bundler's resolution order while `tsc` still picks the `.ts`.
 *
 * Nothing about the detection rules changed in that move. They are built from
 * the same exported code points the decoder uses, so a rule can never look for
 * a character the repair does not know how to remove, or miss one it does.
 *
 * Every pattern is built from `String.fromCharCode` rather than from a
 * backslash escape, for the reason the `.mjs` header gives: a file describing
 * invisible characters must not contain any, and escapes have been interpreted
 * on the way to disk in this repository five times now.
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

import {
  CONTROLS,
  ENTITY_NAMES,
  LINE_SEPARATORS,
  MOJIBAKE,
  NBSP_CODE,
  REPLACEMENT,
  SOFT_HYPHEN,
  ZERO_WIDTH,
  ch,
  cls,
} from './text-encoding-table.mjs'

/*
  Re-exported so nothing that imports the repair has to know it moved, and so
  there is exactly one import path for this subject on the TypeScript side:
  `pnpm seed:normalise`, `pnpm verify` and the unit tests all say
  `from './text-encoding'` and always have.
*/
export {
  NAMED,
  decodeEntities,
  harvestText,
  repairText,
  stripInvisible,
} from './text-encoding-table.mjs'

export { ENTITY_NAMES }

export type EncodingFault = {
  /** Which rule fired, for grouping a report. */
  rule: string
  /** Why it is wrong, in words somebody reading a check's output can act on. */
  why: string
  /** Enough of the string either side of the match to recognise the record. */
  excerpt: string
}

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
 *
 * `harvestText` in the `.mjs` is the other end of this: a harvester reading an
 * infobox value collapses it on the way in, because everything downstream of a
 * harvest parses and matches on what it captured.
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
