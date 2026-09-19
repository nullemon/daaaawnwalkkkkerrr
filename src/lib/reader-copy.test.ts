import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * No reader-facing sentence promises a confidence rating.
 *
 * ## Why this is a test and not a note in a document
 *
 * The confidence rating used to print as a badge on every record page. The
 * owner decided it is editorial — `Confidence` in `src/components/Badges.tsx`
 * renders it for a signed-in editor and for nobody else — and the badge was
 * hidden in one three-line change.
 *
 * Then the sentences describing it turned out to be in **fourteen** places,
 * across three kinds of file that nothing connects to each other:
 *
 * - the seeded copy in `src/seed/copy/`, which writes the admin's editable
 *   fields;
 * - the *fallback* wording inside the route files, which is what renders while
 *   those fields are blank — so changing the seeder alone fixes a database
 *   that has been seeded and leaves a fresh one wrong, which is the harder
 *   direction to notice;
 * - and the generated prose in `src/seed/topic-guides.ts`, which had written
 *   "with its sources and its confidence rating" into 193 guide bodies.
 *
 * The worst of them was the terms page: "Every page shows a confidence rating
 * and its sources so you can judge for yourself." A disclaimer's only job is
 * to describe the site accurately, and that one told a reader to judge for
 * themselves using something the page does not give them.
 *
 * Nothing errored, no type was wrong, and every page rendered. The only way to
 * find all fourteen was to fetch sixty-seven pages and read them. This asks the
 * same question of the source, so the fifteenth fails on the commit that adds
 * it.
 *
 * ## What it does not cover, and why that is fine
 *
 * It reads text, so it cannot tell a sentence a reader sees from one only an
 * editor sees. The admin's own files are therefore excluded by name — the
 * field description on `confidenceField` *should* talk about the rating,
 * because the people reading it are the people it is for.
 *
 * Comments are stripped before the search. The modules below explain at length
 * why this copy was removed, and a test that failed on its own explanation
 * would be deleted within the week.
 */

const ROOT = path.resolve(__dirname, '..')

/** Admin-facing, where naming the rating is correct. */
const EDITORIAL = [
  'fields/shared.ts',
  'fields/gameCopy.ts',
  'lib/audit.ts',
  'lib/audit-source.ts',
  'seed/audit.ts',
  'lib/reader-copy.test.ts',
]

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

/**
 * Block and line comments out, string literals kept.
 *
 * Deliberately simple: it does not parse, so a `//` inside a URL string would
 * eat the rest of that line. The consequence of being wrong is a phrase this
 * test fails to see, in a file that also contains a URL, which is a miss rather
 * than a false alarm — and a false alarm is the failure that gets a test
 * deleted.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

/**
 * What a seeder prints to whoever ran it. `correctTermsAccuracy` reports
 * 'terms: rewrote "Accuracy" — it promised a confidence rating on every page',
 * which is a sentence about the fix, addressed to the one person watching the
 * terminal. Nothing here reaches a page.
 */
const withoutConsoleOutput = (source: string): string =>
  source.replace(/console\.(?:log|warn|error)\([\s\S]*?\)\n/g, ' ')

/**
 * Declarations whose whole purpose is to quote wording that is no longer used.
 *
 * `correctPrivacy`, `correctTermsAccuracy`, `correctConfidenceCopy` and the
 * `SUPERSEDED` list in `seed/copy/ui.ts` each hold the exact old sentence so
 * they can recognise a stored field nobody has hand-edited and replace it. The
 * old sentence has to be written down somewhere, and this is the somewhere.
 *
 * Removed from the name to the end of what it is assigned, so the rest of the
 * file is still searched: four of the sentences this test exists to catch were
 * in `seed/copy/`, and exempting those files wholesale would have blinded it
 * to the place the problem was worst.
 */
const STALE_DECLARATIONS = /\b(?:SUPERSEDED|CORRECTIONS|CONFIDENCE_CORRECTIONS|STALE_[A-Z_]+)\b/

/**
 * Where the declaration starting at `from` ends.
 *
 * Brackets are counted across `{}`, `[]` and `()`, and the declaration ends at
 * the first line break where all three are closed again. Counting only braces
 * was not enough: `CONFIDENCE_CORRECTIONS` is typed
 * `{ … }[] = [ … ]`, so the first matching `}` is the end of the *type
 * annotation* and the array of corrections after it stayed in the text.
 *
 * Quoted strings are skipped, because `checkByHand` says things like "(no page
 * prints one)" and an unbalanced bracket inside a sentence would run the scan
 * to the end of the file.
 *
 * A line break at depth zero ends it, unless the line breaks straight after an
 * `=` — `const STALE_META_DESCRIPTION =` puts its sentence on the next line,
 * and stopping at that break would leave the sentence in the text, which is
 * the one outcome that matters here.
 */
const statementEnd = (source: string, from: number): number => {
  let depth = 0

  for (let at = from; at < source.length; at++) {
    const char = source[at]

    if (char === "'" || char === '"' || char === '`') {
      for (at++; at < source.length; at++) {
        if (source[at] === '\\') at++
        else if (source[at] === char) break
      }
      continue
    }

    if (char === '{' || char === '[' || char === '(') depth++
    else if (char === '}' || char === ']' || char === ')') depth--
    else if (char === '\n' && depth <= 0) {
      if (!/[=,]\s*$/.test(source.slice(from, at))) return at
    }
  }

  return source.length
}

const withoutStaleWording = (source: string): string => {
  let out = source
  for (;;) {
    const found = STALE_DECLARATIONS.exec(out)
    if (!found) return out

    const from = found.index
    const end = statementEnd(out, from)
    out = out.slice(0, from) + ' ' + out.slice(end)
  }
}

/**
 * The badge's own words, in `lib/ui-registry.ts`: its three labels and the
 * one-line explanation behind each. They are the text of an editor-only
 * control, so they are not a promise to a reader — the same reason
 * `fields/shared.ts` is exempt.
 */
const BADGE_LABELS = /'confidence(?:-why)?\.[a-z]+':\s*'[^']*'/g

/**
 * Phrases that assert the reader is shown a rating. "confidence" alone is not
 * one: `src/lib/audit.ts` counts low-confidence records and says so to an
 * editor, which is the field working as intended.
 */
const PROMISES = [
  /confidence rating/i,
  /confidence ratings/i,
  /its confidence shown/i,
  /\bHigh\b[^.]{0,40}agreed by multiple independent sources/i,
]

describe('reader-facing copy', () => {
  const files = walk(ROOT).filter((file) => {
    const rel = path.relative(ROOT, file).split(path.sep).join('/')
    return !EDITORIAL.includes(rel) && !rel.endsWith('payload-types.ts')
  })

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('never promises a reader a confidence rating', () => {
    const offenders: string[] = []

    for (const file of files) {
      const text = withoutStaleWording(
        withoutConsoleOutput(withoutComments(fs.readFileSync(file, 'utf8'))),
      ).replace(BADGE_LABELS, ' ')
      for (const phrase of PROMISES) {
        const match = phrase.exec(text)
        if (!match) continue
        const at = Math.max(0, match.index - 60)
        offenders.push(
          `${path.relative(ROOT, file).split(path.sep).join('/')}: …${text
            .slice(at, match.index + match[0].length + 60)
            .replace(/\s+/g, ' ')
            .trim()}…`,
        )
      }
    }

    expect(
      offenders,
      'A reader is not shown a confidence rating. Say what the page does show — the sources — or move the sentence into an editorial file.',
    ).toEqual([])
  })
})
