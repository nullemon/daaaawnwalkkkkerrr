/**
 * The characters, the table, and the repair — one copy, for both languages.
 *
 * `text-encoding.ts` beside this file finds encoding faults in stored text;
 * six harvesters in `tools/` have to stop writing them in the first place. Both
 * halves need the *same* alphabet and the *same* named-entity table, and the
 * two sides of the project do not share a module loader: the app and the seed
 * passes are TypeScript run through `tsx`, and the harvesters are plain
 * `node tools/x.mjs` with no loader at all.
 *
 * ## Why this is a `.mjs` file and not a second table
 *
 * Because the obvious answer is the dangerous one. A copy of the table in the
 * tools — generated, or typed out, or "kept in step" by a comment — drifts,
 * and **a drifted repair table writes faults in rather than out**: the
 * detector on the TypeScript side says `&ndash;` is undecoded markup, a
 * harvester's own smaller table has never heard of it, and the fault lands in
 * `src/seed/raw/` on every harvest while `pnpm verify` fails on the database
 * for ever. That is not hypothetical. It is what the six separate tables in
 * this repository were doing: three harvesters decoded nothing at all and
 * three decoded three different subsets, and all 33 faults found in the
 * database came from the three with no table.
 *
 * So there is one table, in the one file format both sides can load with no
 * build step, no loader flag and no generated artefact:
 *
 *   - `node tools/fetch-wiki-entities.mjs` imports it directly, as documented
 *     in its own header, with no `--import=tsx/esm` to remember.
 *   - `src/lib/text-encoding.ts` imports it and adds the typed surface, the
 *     detection rules and the fault reporting. `allowJs` is on in
 *     `tsconfig.json`, and every export here carries a JSDoc type, so `tsc
 *     --noEmit` types the app's callers exactly as it did when this was one
 *     `.ts` file.
 *
 * The alternative considered and rejected was running the harvesters under
 * `tsx` so they could import the `.ts` directly. It works until somebody runs
 * one the way its docstring says to — `node tools/harvest-game.mjs
 * gears-of-war-e-day` — and gets an unknown-file-extension crash, or until
 * `harvest-all.mjs` spawns a child without passing the loader on. One shared
 * file that plain node can read has no such edge.
 *
 * ## Why the basename is not `text-encoding.mjs`
 *
 * Because it was, for about ten minutes, and it silently replaced the module
 * beside it. `tsc` resolves a bare `./text-encoding` to the `.ts`; Vite and
 * Next try `.mjs` **first**. So `tsc --noEmit` was clean while every runtime
 * import of `./text-encoding` — the seed passes, `pnpm verify`, the unit tests
 * — got this file instead and `encodingFaults is not a function`. A typecheck
 * that passes and a runtime that resolves somewhere else is this repository's
 * favourite kind of bug, so the two files do not share a basename. Do not
 * rename this back.
 *
 * ## Why every pattern is built from code points
 *
 * Because a file describing invisible characters must not contain any.
 *
 * The first draft of the module beside this one wrote its character classes as
 * backslash-u escapes, which is the readable form — and the escapes were
 * interpreted on the way to disk, so what landed was the characters
 * themselves. The regexes still worked, every unit test passed, and
 * `tools/no-control-characters.test.mjs` failed on the file that exists to
 * describe the fault it guards against. That test's own header says the cause
 * is environmental and has happened to four different authors.
 * `String.fromCharCode` has no escape to interpret, so it cannot happen here.
 */

// --- the alphabet, by number ----------------------------------------------

/** @type {(code: number) => string} */
export const ch = (code) => String.fromCharCode(code)

/** @type {(from: number, to: number) => string} */
export const range = (from, to) => `${ch(from)}-${ch(to)}`

/** @type {(...parts: string[]) => string} */
export const cls = (...parts) => `[${parts.join('')}]`

/** @type {number} */
export const REPLACEMENT = 0xfffd
/** @type {number} */
export const NBSP_CODE = 0x00a0
/** @type {number} */
export const SOFT_HYPHEN = 0x00ad
/** @type {string} */
export const ZERO_WIDTH = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map(ch).join('')
/** @type {string} */
export const LINE_SEPARATORS = [0x2028, 0x2029].map(ch).join('')

/**
 * Tab, newline and carriage return are the only ones that belong in text.
 * @type {string}
 */
export const CONTROLS = [
  range(0x00, 0x08),
  ch(0x0b),
  ch(0x0c),
  range(0x0e, 0x1f),
  ch(0x7f),
].join('')

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
 *
 * @type {string}
 */
export const CP1252_HIGH = [
  range(0x80, 0xbf),
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
    0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
    0x0153, 0x017e, 0x0178,
  ]
    .map(ch)
    .join(''),
].join('')

/** @type {string} */
export const MOJIBAKE = [
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
 *
 * The detector on the TypeScript side reads this list and the decoder below
 * reads `NAMED`, so the two must hold the same names — which is the whole
 * reason they are in one file. A name in the detector and not in the decoder
 * is a fault `pnpm verify` reports and `pnpm seed:normalise` cannot repair; a
 * name in the decoder and not in the detector is a fault nothing reports.
 * `src/lib/text-encoding.test.ts` pins them against each other.
 *
 * @type {string[]}
 */
export const ENTITY_NAMES = [
  'amp', 'lt', 'gt', 'quot', 'apos', 'nbsp', 'rsquo', 'lsquo', 'ldquo', 'rdquo', 'ndash', 'mdash',
  'hellip', 'eacute', 'egrave', 'uuml', 'ouml', 'auml', 'szlig', 'ccedil', 'oacute', 'aacute',
  'iacute', 'uacute', 'ntilde', 'copy', 'reg', 'trade', 'deg', 'middot', 'bull', 'prime', 'times',
]

// --- the repair -----------------------------------------------------------

/**
 * What each named entity stands for, by code point.
 *
 * Numbers rather than the characters themselves for the reason at the top of
 * this file: a table of characters is a table that can be mangled in transit,
 * and a mangled repair table is worse than no repair at all — it would write
 * the fault in rather than out.
 *
 * @type {Record<string, number>}
 */
export const NAMED = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0x00a0,
  rsquo: 0x2019, lsquo: 0x2018, ldquo: 0x201c, rdquo: 0x201d,
  ndash: 0x2013, mdash: 0x2014, hellip: 0x2026,
  eacute: 0x00e9, egrave: 0x00e8, uuml: 0x00fc, ouml: 0x00f6, auml: 0x00e4,
  szlig: 0x00df, ccedil: 0x00e7, oacute: 0x00f3, aacute: 0x00e1,
  iacute: 0x00ed, uacute: 0x00fa, ntilde: 0x00f1,
  copy: 0x00a9, reg: 0x00ae, trade: 0x2122, deg: 0x00b0,
  middot: 0x00b7, bull: 0x2022, prime: 0x2032, times: 0x00d7,
}

/**
 * Is this code point safe to write into stored prose?
 * @type {(code: number) => boolean}
 */
const printable = (code) => {
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
 * detection rules exist to catch.
 *
 * @type {(text: string) => string}
 */
export const decodeEntities = (text) =>
  String(text ?? '')
    .replace(/&#x([0-9A-Fa-f]{1,6});/g, (whole, hex) => {
      const code = parseInt(hex, 16)
      return printable(code) ? String.fromCodePoint(code) : whole
    })
    .replace(/&#(\d{1,7});/g, (whole, digits) => {
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
    .replace(/&([a-zA-Z]+);/g, (whole, name) => {
      const code = NAMED[String(name).toLowerCase()]
      return code === undefined ? whole : String.fromCharCode(code)
    })

/**
 * Remove what is invisible on the page and fatal to a match.
 * @type {(text: string) => string}
 */
export const stripInvisible = (text) =>
  String(text ?? '').replace(new RegExp(cls(ZERO_WIDTH + ch(SOFT_HYPHEN)), 'g'), '')

/**
 * The repair, for the faults that have one.
 *
 * Decode what was never decoded, drop what is invisible, and leave everything
 * else exactly as the source wrote it. A replacement character is deliberately
 * **not** repaired: the byte behind it is gone, and anything put in its place
 * would be this site inventing a character.
 *
 * @type {(text: string) => string}
 */
export const repairText = (text) => stripInvisible(decodeEntities(text))

/**
 * What a harvester applies to every value it captures.
 *
 * `repairText` plus one thing the stored-text repair deliberately does not do:
 * a non-breaking space becomes an ordinary space.
 *
 * The difference is about *where in the pipeline* this runs. By the time
 * `pnpm seed:normalise` sees a value it is prose on a record, and `10 km` held
 * together with U+00A0 is what the source meant; changing it would be editing
 * somebody's typography. A harvester is reading an infobox *value* that half a
 * dozen downstream passes are about to parse, compare and match on — a
 * revenue, a founding date, a platform list — and there U+00A0 is a space that
 * does not equal a space, which is the fault `identifierFaults` exists to
 * report. `{{US$|8.0&nbsp;billion}}` has to reach `revenueValue` as
 * `US$8.0 billion`, or the currency check passes and the parse does not.
 *
 * This is the behaviour the three harvesters that already decoded had, so
 * adopting it changes none of their output; `tools/fetch-companies.test.mjs`
 * pins it from the other side.
 *
 * @type {(text: string) => string}
 */
export const harvestText = (text) =>
  repairText(text).replace(new RegExp(ch(NBSP_CODE), 'g'), ' ')
