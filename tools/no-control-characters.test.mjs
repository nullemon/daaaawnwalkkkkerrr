import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * No source file contains a control character.
 *
 * Four regexes in the two entity harvesters shipped with a literal backspace
 * byte (0x08) where `\b` was meant. A regex requiring an actual backspace
 * either side of its alternation matches nothing, ever — so the filter meant
 * to keep real people, other studios, novels and soundtracks out of the
 * harvest had never once fired, and fifty-six records were live that it was
 * written to reject.
 *
 * Nothing errors. The file looks right in most editors, `node --check` passes,
 * the regex compiles, and the only symptom is a filter that silently agrees
 * with everything.
 *
 * The cause is environmental rather than anybody's carelessness: writing a
 * file through a shell heredoc in this project's tooling collapses `\\` to `\`
 * and then interprets the escape, so `\b` in a heredoc becomes 0x08. It has
 * happened at least four times, in four different files, to different authors.
 * A convention nobody can see is not a defence, so this is a test instead —
 * and the fix is to build backslashes with `String.raw`, or in a script with
 * `chr(92)`, rather than typing them into a heredoc.
 */

const ROOTS = ['src', 'tools']
const SKIP = new Set(['node_modules', '.next', 'media', 'assets', 'raw'])
const TEXT = /\.(ts|tsx|mjs|js|css|json|md)$/

/* Tab, newline and carriage return are the only ones that belong in source. */
const CONTROL = new RegExp(
  '[' +
    [0, 8, 11, 12, 14, 31, 127]
      .map((code) => String.fromCharCode(code))
      .join('') +
    ']',
)

/**
 * The characters that are not controls and are just as invisible.
 *
 * Same failure, one step along, and it has now happened here: a module written
 * to describe zero-width characters had its escapes interpreted on the way to
 * disk and shipped the characters themselves — in a file whose whole job is to
 * find them in somebody else's data. A zero-width joiner in a string literal
 * is a string that will never match, and a replacement character in source is
 * a byte that was lost before the file was saved.
 *
 * The repair is the same one this file's header names: build them from
 * `String.fromCharCode`, so there is no escape left to interpret.
 */
const INVISIBLE = new RegExp(
  '[' +
    [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x00ad, 0xfffd]
      .map((code) => String.fromCharCode(code))
      .join('') +
    ']',
)

/**
 * The one place they belong, and why the exemption is a list rather than a
 * rule.
 *
 * `src/lib/moderation.ts` strips the invisible characters comment spam hides
 * links inside, so it has to be able to name them; its test has to be able to
 * write one. Everything else that "needs" one is a mistake, so the exemption
 * is two file names an author has to add themselves rather than a pattern a
 * third file can drift into.
 */
const MAY_NAME_INVISIBLES = new Set([
  path.join('src', 'lib', 'moderation.ts'),
  path.join('src', 'lib', 'moderation.test.ts'),
])

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return []
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return TEXT.test(entry.name) ? [full] : []
  })

describe('source files', () => {
  it('contain no control characters', () => {
    const bad = []
    for (const root of ROOTS) {
      if (!fs.existsSync(root)) continue
      for (const file of walk(root)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, index) => {
          const match = CONTROL.exec(line)
          if (match) {
            const code = match[0].codePointAt(0).toString(16).padStart(2, '0')
            bad.push(`${file}:${index + 1} contains U+00${code.toUpperCase()}`)
          }
        })
      }
    }
    expect(bad).toEqual([])
  })

  it('contain no zero-width or replacement characters', () => {
    const bad = []
    for (const root of ROOTS) {
      if (!fs.existsSync(root)) continue
      for (const file of walk(root)) {
        if (MAY_NAME_INVISIBLES.has(file)) continue
        const lines = fs.readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, index) => {
          const match = INVISIBLE.exec(line)
          if (match) {
            const code = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
            bad.push(`${file}:${index + 1} contains U+${code}`)
          }
        })
      }
    }
    expect(bad).toEqual([])
  })
})
