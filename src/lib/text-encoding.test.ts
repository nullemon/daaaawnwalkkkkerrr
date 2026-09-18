import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  ENTITY_NAMES,
  NAMED,
  decodeEntities,
  encodingFaults,
  harvestText,
  identifierFaults,
  repairText,
  stripInvisible,
} from './text-encoding'

/*
  Every invisible character in this file is built from its number.

  A test about characters that cannot be seen must not contain any, or it
  becomes the thing it is testing for: the first draft of the module beside
  this one wrote its classes as backslash-u escapes, the escapes were
  interpreted on the way to disk, and `tools/no-control-characters.test.mjs`
  failed on the file that describes the fault. Nothing here has an escape to
  interpret.
*/
const ch = (code: number): string => String.fromCharCode(code)
const ZWJ = ch(0x200d)

/** Sony's former names, exactly as Wikipedia's infobox writes the dates. */
const SONY_YEARS = `1946${ZWJ}${ch(0x2013)}${ZWJ}1957`

describe('encodingFaults', () => {
  it('says nothing about text that is sound', () => {
    expect(encodingFaults('Stéphanie Cassignard — Œuvres, 1946–1957')).toEqual([])
    expect(encodingFaults('大神 / Ōkami')).toEqual([])
    expect(encodingFaults('')).toEqual([])
  })

  it('finds UTF-8 that was read as cp1252', () => {
    // The whole family: an accented letter, a curly apostrophe, a stray Â.
    for (const bad of ['StÃ©phanie', 'Coenâ€™s own village', 'Â£59.5 million', 'Ð¡Ð¾Ð½Ð¸']) {
      expect(encodingFaults(bad).map((f) => f.rule)).toContain('mojibake')
    }
  })

  it('does not mistake real Latin text for mojibake', () => {
    /*
      A filter written to stop bad records is still a filter, and an over-broad
      one throws away the good ones just as silently — the lesson Antar 4 left
      on `isNotAnEntity`. `Ã` before a capital is Portuguese; it is `Ã` before
      a continuation byte that is a decoding fault.
    */
    for (const good of ['SÃO PAULO', 'JOÃO PESSOA', 'Émile Reynaud', 'Señor', 'Ökonomie']) {
      expect(encodingFaults(good)).toEqual([])
    }
  })

  it('finds a replacement character', () => {
    expect(encodingFaults(`Ba${ch(0xfffd)}kir`).map((f) => f.rule)).toContain('replacement')
  })

  it('finds an entity that was never decoded', () => {
    // React escapes what it renders, so this reaches the reader as eight
    // literal characters in the middle of a sentence.
    expect(encodingFaults('1982&ndash;present').map((f) => f.rule)).toContain('entity')
    expect(encodingFaults('Hair Styles &#124; Entertainment Weekly').map((f) => f.rule)).toContain(
      'entity',
    )
  })

  it('finds a zero-width character', () => {
    expect(encodingFaults(SONY_YEARS).map((f) => f.rule)).toContain('zero-width')
  })

  it('finds a control character', () => {
    // The same fault `tools/no-control-characters.test.mjs` guards source
    // against, applied to content instead.
    expect(encodingFaults(`a${ch(0x08)}b`).map((f) => f.rule)).toContain('control')
  })

  it('carries an excerpt, because a rule name alone is not actionable', () => {
    const [fault] = encodingFaults('years active: 1982&ndash;present (as actress)')
    expect(fault.excerpt).toContain('&ndash;')
    expect(fault.why).toMatch(/entity/i)
  })
})

describe('identifierFaults', () => {
  it('adds the non-breaking space, which only matters where something matches', () => {
    expect(encodingFaults(`Vale${ch(0xa0)}Sangora`)).toEqual([])
    expect(identifierFaults(`Vale${ch(0xa0)}Sangora`).map((f) => f.rule)).toEqual(['nbsp'])
  })
})

describe('decodeEntities', () => {
  it('decodes what a wiki infobox actually produces', () => {
    expect(decodeEntities('1982&ndash;present')).toBe('1982–present')
    expect(decodeEntities('Producer &amp; Director')).toBe('Producer & Director')
    expect(decodeEntities('Map&hellip;')).toBe('Map…')
    expect(decodeEntities('Hair Styles &#124; EW')).toBe('Hair Styles | EW')
  })

  it('refuses a numeric entity that would introduce a new fault', () => {
    /*
      A general decoder turns `&#0;` into a control character and `&#x2028;`
      into a line separator — faults created by the repair, of exactly the kind
      the rules exist to catch. Left as written instead, so the check still
      reports them and a person decides.
    */
    expect(decodeEntities('a&#0;b')).toBe('a&#0;b')
    expect(decodeEntities('a&#x2028;b')).toBe('a&#x2028;b')
  })

  it('unwinds one layer, never two', () => {
    // `&amp;ndash;` is a value that arrived double-escaped. What the source
    // said is the literal text `&ndash;`, not an en dash.
    expect(decodeEntities('1982&amp;ndash;present')).toBe('1982&ndash;present')
  })

  it('leaves an unknown entity alone', () => {
    expect(decodeEntities('a &frobnicate; b')).toBe('a &frobnicate; b')
  })
})

describe('stripInvisible', () => {
  it('removes what nothing can see and every match trips on', () => {
    // Sony's former names, exactly as Wikipedia's infobox wrote them.
    expect(stripInvisible(SONY_YEARS)).toBe(`1946${ch(0x2013)}1957`)
    expect(stripInvisible(`${ch(0xfeff)}Title`)).toBe('Title')
    expect(stripInvisible(`co${ch(0xad)}operate`)).toBe('cooperate')
  })
})

describe('repairText', () => {
  it('is idempotent, so a pass can run in any order and twice', () => {
    const once = repairText(`Sony &amp; Co. ${SONY_YEARS}${ch(0xfeff)}`)
    expect(repairText(once)).toBe(once)
  })

  it('does not invent a character for one that was lost', () => {
    // The byte behind U+FFFD is gone. Anything put in its place would be this
    // site deciding how a name is spelled.
    expect(repairText(`Ba${ch(0xfffd)}kir`)).toBe(`Ba${ch(0xfffd)}kir`)
  })
})

describe('harvestText', () => {
  /*
    What the harvesters apply, and the one way it differs from `repairText`.

    A harvest captures values that half a dozen later passes parse and compare:
    `{{US$|8.0&nbsp;billion}}` has to reach `revenueValue` as text whose space
    is a space, or the currency check passes and nothing downstream matches.
    `pnpm seed:normalise` leaves a non-breaking space alone on purpose, because
    by then it is somebody's typography in a sentence.
  */
  it('decodes, strips the invisible, and un-sticks a non-breaking space', () => {
    expect(harvestText('US$8.0&nbsp;billion')).toBe('US$8.0 billion')
    expect(harvestText('1992&ndash;present')).toBe(`1992${ch(0x2013)}present`)
    expect(harvestText(SONY_YEARS)).toBe(`1946${ch(0x2013)}1957`)
  })

  it('leaves text that is already sound exactly as it is', () => {
    // A filter written to stop bad values is still a filter.
    for (const good of ['Stéphanie Cassignard', '大神 / Ōkami', 'Q&A; see below']) {
      expect(harvestText(good)).toBe(good)
    }
  })
})

/**
 * The detector and the decoder read one table, and this is what says so.
 *
 * They are two exports of two files — `ENTITY_NAMES` drives the "an entity was
 * never decoded" rule, `NAMED` drives the repair — and the failure when they
 * disagree is silent in both directions. A name the detector knows and the
 * decoder does not is a fault `pnpm verify` reports for ever and
 * `pnpm seed:normalise` cannot repair. A name the decoder knows and the
 * detector does not is a fault nothing reports at all.
 *
 * This is the guard that makes "one table" a fact rather than a comment.
 */
describe('the one table', () => {
  it('has the same names in the detector and in the repair', () => {
    expect([...ENTITY_NAMES].sort()).toEqual(Object.keys(NAMED).sort())
  })

  it('maps every one of them to a character the repair is allowed to write', () => {
    for (const name of ENTITY_NAMES) {
      const decoded = decodeEntities(`&${name};`)
      expect(decoded, name).not.toBe(`&${name};`)
      expect(decoded.length, name).toBe(1)
    }
  })
})

/**
 * The harvest on disk, before any of it becomes a record.
 *
 * This is the cheap end of the problem. Every string on the seven sourced
 * wikis passes through `src/seed/raw/` first, so a fault caught here is caught
 * once instead of in however many collections the seeders fan it out to — the
 * `&ndash;` in one Star Wars entity reached four different collections.
 *
 * It is a test rather than a script for the reason
 * `tools/no-control-characters.test.mjs` is: two of the five harvesters decode
 * entities and three do not, the difference is invisible in every output any
 * of them produces, and a convention nobody can see is not a defence.
 */
describe('the raw harvest', () => {
  const root = path.resolve(__dirname, '..', 'seed', 'raw')

  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) files.push(full)
    }
  }
  if (fs.existsSync(root)) walk(root)

  it('is where this thinks it is', () => {
    // A walk that found nothing would make the check below pass by not running.
    expect(files.length).toBeGreaterThan(20)
  })

  it('carries no mojibake, no lost bytes and no undecoded markup', () => {
    const found: string[] = []

    const visit = (node: unknown, file: string, keyPath: string) => {
      if (typeof node === 'string') {
        for (const fault of encodingFaults(node)) {
          found.push(`${path.relative(root, file)} @ ${keyPath} — ${fault.rule}: ${fault.excerpt}`)
        }
        return
      }
      if (Array.isArray(node)) {
        node.forEach((value, index) => visit(value, file, `${keyPath}[${index}]`))
        return
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          visit(value, file, keyPath ? `${keyPath}.${key}` : key)
        }
      }
    }

    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf8')
      // A BOM parses fine and then turns up as the first character of whatever
      // key happens to be first.
      expect(raw.charCodeAt(0)).not.toBe(0xfeff)
      visit(JSON.parse(raw), file, '')
    }

    expect(found).toEqual([])
  })
})
