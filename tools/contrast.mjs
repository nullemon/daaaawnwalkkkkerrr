/**
 * Every text-on-background pair in the palette, measured.
 *
 *   node tools/contrast.mjs
 *   node tools/contrast.mjs --candidate light
 *
 * ## Why this exists
 *
 * This stylesheet already carries measured ratios in comments — `--muted` says
 * "5.46 on ground, 4.94 on sunken; #6b7489 was 4.10 and 3.71" — which is the
 * right instinct and is written by hand, so it goes stale the first time a
 * token moves and nobody re-checks the one below it.
 *
 * The contrast rule this project has to hold is AA for body text: **4.5:1**.
 * The smallest type on the page is 11.5px `--muted`, which is the pair most
 * likely to fail and least likely to be noticed, because a muted line looks
 * like it is meant to be faint.
 *
 * Reports both themes so a change to one can be checked against the other.
 */
import fs from 'fs'

const CSS = fs.readFileSync('src/app/(frontend)/globals.css', 'utf8')

const hex = (value) => {
  const clean = value.trim().replace('#', '')
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

/** WCAG relative luminance. */
const luminance = ([r, g, b]) => {
  const channel = (value) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const ratio = (a, b) => {
  const la = luminance(hex(a))
  const lb = luminance(hex(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Read one `:root…{ }` block's tokens. */
const block = (selector) => {
  const start = CSS.indexOf(selector)
  if (start === -1) return null
  const open = CSS.indexOf('{', start)
  const close = CSS.indexOf('\n}', open)
  const body = CSS.slice(open, close)
  const tokens = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) tokens[m[1]] = m[2]
  return tokens
}

/** Ink tokens paired against every ground they are painted on. */
const INKS = ['--ink', '--ink-soft', '--muted', '--accent', '--accent-hot', '--good', '--danger']
const GROUNDS = ['--ground', '--surface', '--raised', '--sunken']

const report = (name, tokens) => {
  if (!tokens) return console.log(`  ${name}: not found`)
  console.log(`\n${name}`)
  console.log('  ' + 'text'.padEnd(14) + GROUNDS.map((g) => g.replace('--', '').padStart(9)).join(''))

  let worst = { pair: '', value: Infinity }
  for (const inkToken of INKS) {
    const ink = tokens[inkToken]
    if (!ink) continue
    const cells = GROUNDS.map((groundToken) => {
      const ground = tokens[groundToken]
      if (!ground) return '        —'
      const value = ratio(ink, ground)
      /* --muted is the 11.5px one; everything here is body text or smaller. */
      const flag = value < 4.5 ? '!' : ' '
      if (value < worst.value) worst = { pair: `${inkToken} on ${groundToken}`, value }
      return (value.toFixed(2) + flag).padStart(9)
    })
    console.log('  ' + inkToken.replace('--', '').padEnd(14) + cells.join(''))
  }
  console.log(`  weakest: ${worst.pair} at ${worst.value.toFixed(2)}:1${worst.value < 4.5 ? '  <-- below AA' : ''}`)
}

report('dark (bare :root)', block(':root {'))
report("light (:root[data-theme='light'])", block(":root[data-theme='light']"))

console.log('\n  ! marks a pair under 4.5:1, which is AA for body text.')
console.log('  The smallest type on the page is 11.5px in --muted.')
