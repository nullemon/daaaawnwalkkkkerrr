/**
 * A `developer` or `publisher` field, turned into the companies it names.
 *
 * ## Why it is not `value.split(',')`
 *
 * Silent Hill: Townfall is published by "Konami, Annapurna Interactive" —
 * two companies in one string, because that is what the store page says. The
 * wiki's About page slugified the whole thing and linked
 * `companies.<domain>/konami-annapurna-interactive`, a profile that does not
 * exist and cannot, on every page that renders that block, and in the
 * `publisher` `@id` of its JSON-LD as well. `GameProfile` on the same wiki
 * split on the comma and produced two correct links. **Two implementations of
 * one rule, disagreeing** — and the one that was wrong was wrong silently.
 *
 * And the comma is not safe either. `Atari, Inc.` is a company on this
 * network's own companies host, with a comma inside its name; splitting it
 * gives "Atari" and "Inc." and the second is not a company at all. It is the
 * Antar 4 shape exactly: a rule written to fix bad records that throws away
 * good ones just as quietly.
 *
 * So two rules, in this order:
 *
 * 1. **A comma followed by a corporate suffix is part of the name.** `Inc.`,
 *    `Ltd`, `LLC`, `GmbH`, `S.A.` and the rest of the list below. The list is
 *    small, it is about legal-entity suffixes rather than about company names,
 *    and being wrong about one is caught by rule 2.
 * 2. **A name that does not resolve to a profile is not a link.** That check
 *    lives with the caller, because it needs the database; what this module
 *    guarantees is that the *candidates* are right. A fragment that resolves
 *    to nothing renders as plain text, which is what "Screen Burn" — a studio
 *    with no profile — does today.
 *
 * No I/O and no Payload types, so both rules are unit-tested directly.
 */

import { slugify } from '../fields/shared'

/**
 * Legal-entity suffixes that can follow a comma inside one company's name.
 *
 * Lower-cased and stripped of full stops before comparison, so `Inc.`, `inc`
 * and `INC.` are one entry. Deliberately short: this is the set that actually
 * appears after a comma in a company name, not a directory of abbreviations.
 */
const SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'ltd',
  'limited',
  'co',
  'corp',
  'corporation',
  'company',
  'gmbh',
  'sa',
  'sas',
  'srl',
  'spa',
  'nv',
  'bv',
  'ab',
  'as',
  'oy',
  'oyj',
  'plc',
  'pty',
  'kk',
  'kg',
  'ag',
])

const isSuffix = (fragment: string): boolean =>
  SUFFIXES.has(fragment.trim().replace(/\./g, '').toLowerCase())

/**
 * A company name with its legal suffixes taken off the end.
 *
 * "Valve Corporation" and "Valve" are one company; a store page writes the
 * short name and Wikipedia titles the article with the legal one, so this
 * network had two profiles for several studios — one carrying the games and
 * one carrying the logo. The front page's studio row was the symptom: eleven
 * of the twenty-three companies that made these games appeared to have no
 * logo, and the logo was on a second record a few rows away.
 *
 * **Only suffixes come off, and only from the end.** That is the whole safety
 * of it: "2K" and "2K Australia" stay two companies, because "Australia" is
 * not a legal suffix, and so do "Bandai Namco Entertainment" and "Bandai Namco
 * Holdings". Widening this to a prefix match would merge those, which is a
 * worse failure than the one it fixes — it would put one studio's games on
 * another's profile.
 *
 * Trailing commas go too, since "Unknown Worlds Entertainment, Inc." splits
 * into a name and a suffix rather than reading as one token.
 */
export const withoutLegalSuffix = (name: string): string => {
  let out = (name ?? '').trim()
  for (;;) {
    const trimmed = out.replace(/[\s,]+$/, '')
    const match = trimmed.match(/^(.*?)[\s,]+([^\s,]+)$/)
    if (!match || !isSuffix(match[2])) return trimmed
    /* A name that is *only* a suffix is not a suffix — "Co" alone stays. */
    if (!match[1].trim()) return trimmed
    out = match[1]
  }
}

/**
 * The company names in one field, in the order they were written.
 *
 * Splits on a comma, an ampersand and a standalone "and" — all three appear in
 * these fields — then re-joins any fragment that is only a legal suffix onto
 * the one before it.
 */
export const rightsholderNames = (value: string | null | undefined): string[] => {
  const raw = (value ?? '')
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)

  const out: string[] = []
  for (const fragment of raw) {
    if (out.length > 0 && isSuffix(fragment)) {
      // `Atari, Inc.` — the comma is punctuation inside one name, not a list.
      out[out.length - 1] = `${out[out.length - 1]}, ${fragment}`
      continue
    }
    out.push(fragment)
  }
  return out
}

export type Rightsholder = {
  name: string
  /** The profile slug, whether or not a profile exists at it. */
  slug: string
}

/** Every company a pair of fields names, deduplicated, in order. */
export const rightsholdersIn = (
  ...values: (string | null | undefined)[]
): Rightsholder[] => {
  const seen = new Set<string>()
  const out: Rightsholder[] = []
  for (const value of values) {
    for (const name of rightsholderNames(value)) {
      const slug = slugify(name)
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      out.push({ name, slug })
    }
  }
  return out
}
