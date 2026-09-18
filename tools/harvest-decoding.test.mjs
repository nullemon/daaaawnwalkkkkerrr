import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { harvestText } from '../src/lib/text-encoding-table.mjs'

/**
 * Every harvester decodes, and every one of them decodes from the same table.
 *
 * Six harvesters read somebody else's HTML into `src/seed/raw/`. Three of them
 * decoded nothing at all and three decoded three different subsets of the same
 * list, and the difference is invisible in every output any of them produces:
 * an undecoded `&ndash;` is a perfectly ordinary string that imports cleanly,
 * passes every count, renders, and reaches a reader as those eight literal
 * characters because React escapes what it renders. All 33 encoding faults
 * found in the database came from the three with no table.
 *
 * `pnpm verify` and the raw-harvest case in `src/lib/text-encoding.test.ts`
 * catch a fault that is already written. This is the other end: it catches a
 * harvester that would write one, which is the end where the fault is cheap.
 *
 * ## Why it reads source text
 *
 * Because these files run their sweep at the top level, so importing one
 * starts a harvest. Two of them cannot be imported at all and the value
 * cleaners inside them are therefore untestable in the ordinary way — the
 * reason `fetch-companies.mjs` grew a main guard and its resolver became
 * importable was this same problem, one function along.
 *
 * So: the first case reads each file and insists the shared module is the only
 * decoder in it, which is robust and is the property that must never stop
 * being true. The second lifts the shipped source of the three value cleaners
 * and runs it, which is precise — it proves the call site is *reached*, not
 * merely that the table works. Both fail loudly rather than quietly if the
 * code they are reading moves: the extraction asserts it found something
 * before it asserts anything about the result.
 */

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

/** Every tool that turns somebody else's markup into a stored value. */
const HARVESTERS = [
  'fetch-companies.mjs',
  'fetch-company-games.mjs',
  'fetch-game-data.mjs',
  'fetch-wiki-entities.mjs',
  'fetch-people.mjs',
  'harvest-game.mjs',
]

const read = (file) => fs.readFileSync(path.join(HERE, file), 'utf8')

describe('the harvesters', () => {
  it.each(HARVESTERS)('%s decodes from the one shared table', (file) => {
    const src = read(file)
    expect(src, `${file} does not import the shared table`).toContain(
      "from '../src/lib/text-encoding-table.mjs'",
    )
    expect(src, `${file} imports the table and never calls it`).toMatch(/\bharvestText\b\s*[(\n]/)
  })

  /*
    A table of its own is the failure this replaced, and it comes back as a
    plausible-looking local `replace` chain rather than as anything obviously
    wrong. `&amp;` is the name every one of the six old copies had, so it is
    the one worth watching for.

    Not `&\w+;` in general: these files talk *about* entities in their comments
    and their docstrings, which is where "&ndash;" appears most often and where
    it is not a fault. A replacement call is the thing that decodes.
  */
  it.each(HARVESTERS)('%s has no decoder of its own left in it', (file) => {
    const src = read(file)
    const own = src.match(/\.replace\(\s*\/[^/]*&(?:amp|nbsp|ndash|mdash|quot|#)[^/]*\//g) ?? []
    expect(own, `${file} still decodes entities by hand`).toEqual([])
  })
})

/**
 * The three that stripped wikitext and decoded none of it.
 *
 * Each is `const <name> = (value) => harvestText(String(value ?? '')…)`, so
 * the shipped source can be lifted out and called. The cases are the exact
 * values that shipped: `&#124;` was live on the Padawan braid entity for the
 * whole Star Wars harvest, and `1992&ndash;present` is how Wikipedia writes
 * every `years_active` field in the people harvest.
 */
const CLEANERS = [
  ['harvest-game.mjs', 'cleanValue'],
  ['fetch-wiki-entities.mjs', 'cleanValue'],
  ['fetch-people.mjs', 'clean'],
]

describe('the value cleaners', () => {
  it.each(CLEANERS)('%s: %s runs what it captured through the table', (file, name) => {
    const src = read(file)
    const opening = `const ${name} = (value) =>`
    const start = src.indexOf(opening)
    expect(start, `${file} no longer declares ${name} as a one-expression arrow`).toBeGreaterThan(-1)

    /*
      The closing `\n  )\n` is `harvestText(`'s own bracket, at the indentation
      these files use. If the shape changes this finds the wrong end and the
      `new Function` below throws, which is the loud failure wanted here — a
      test that silently extracted nothing would report that a harvester
      decodes when it does not.
    */
    const end = src.indexOf('\n  )\n', start) + 4
    expect(end, `${file}: could not find the end of ${name}`).toBeGreaterThan(start)

    const fn = new Function('harvestText', `${src.slice(start, end)}; return ${name}`)(harvestText)

    expect(fn('Hair Styles &#124; Entertainment Weekly')).toBe('Hair Styles | Entertainment Weekly')
    expect(fn('1992&ndash;present')).toBe(`1992${String.fromCharCode(0x2013)}present`)
    expect(fn('Sony &amp; Co.')).toBe('Sony & Co.')
    // A zero-width joiner is invisible on the page and fatal to every match.
    expect(fn(`1946${String.fromCharCode(0x200d)}-1957`)).toBe('1946-1957')
  })
})
