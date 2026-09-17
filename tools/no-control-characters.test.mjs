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
})
