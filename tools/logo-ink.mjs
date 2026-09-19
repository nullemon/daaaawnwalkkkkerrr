/**
 * Which company logos are dark ink on transparency, and which carry colour.
 *
 *   node tools/logo-ink.mjs          # report
 *   node tools/logo-ink.mjs --write  # and save the map
 *
 * ## Why this has to be measured
 *
 * A logo taken from Commons is usually a trademark drawn as flat shapes, and
 * about half of them are **black on transparency** — which is invisible on a
 * dark surface. The first fix was a white disc behind every mark, and it was
 * correctly called bad: it puts a row of white circles across a dark page and
 * it does it to logos that never needed one.
 *
 * The honest fix is to treat each logo as what it is. A black wordmark can be
 * inverted and is then a white wordmark, which is what the same trademark
 * looks like in its own dark-background lockup. A logo with real colour cannot
 * be inverted — inverting Capcom's blue gives orange, which is a different
 * mark and arguably a misuse of it — so those keep a plate, and only those.
 *
 * Guessing per logo is not possible from the filename, and doing it by eye
 * across a hundred files is how it ends up half-right. So this reads the
 * pixels: the mean lightness and the mean saturation of everything that is not
 * transparent.
 *
 * ## The three answers
 *
 * - `dark`   — low saturation, low lightness. Invert on a dark ground.
 * - `light`  — low saturation, high lightness. Already legible; leave it.
 * - `colour` — real saturation. Never invert; give it a plate.
 *
 * Written to `src/seed/raw/logo-ink.json` as `filename -> answer`, because it
 * is a fact about a file rather than about a company, and because keeping it
 * out of the schema means no column, no migration and no push prompt.
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const MEDIA = path.resolve('media')
const OUT = path.resolve('src/seed/raw/logo-ink.json')
const WRITE = process.argv.includes('--write')

/** Only the company marks; game art and photographs are not this question. */
const IS_LOGO = /^company-/i

/* Above this, the mark has a colour worth preserving. Set from the measured
   spread rather than picked: the monochrome files here cluster under 0.10 and
   the coloured ones start around 0.30. */
const COLOURFUL = 0.18
/* A mid-grey mark is legible on both grounds and is left alone. */
const DARK = 0.42
const LIGHT = 0.62

const classify = async (file) => {
  const image = sharp(file).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels

  let n = 0
  let sumL = 0
  let sumS = 0

  for (let i = 0; i < data.length; i += channels) {
    const alpha = channels === 4 ? data[i + 3] : 255
    /* Anti-aliased edges are mostly the background's colour and would drag
       every measurement towards the middle. Only solid pixels count. */
    if (alpha < 200) continue
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const s = max === min ? 0 : (max - min) / (l > 0.5 ? 2 - max - min : max + min)
    sumL += l
    sumS += s
    n += 1
  }

  if (n === 0) return { verdict: 'light', lightness: 1, saturation: 0, opaque: 0 }

  const lightness = sumL / n
  const saturation = sumS / n
  const verdict =
    saturation >= COLOURFUL
      ? 'colour'
      : lightness <= DARK
        ? 'dark'
        : lightness >= LIGHT
          ? 'light'
          : 'colour' /* mid-grey: safe on either ground, treat as needing no invert */

  return { verdict, lightness, saturation, opaque: n }
}

if (!fs.existsSync(MEDIA)) {
  console.error(`No media directory at ${MEDIA}.`)
  process.exit(1)
}

const files = fs.readdirSync(MEDIA).filter((name) => IS_LOGO.test(name) && /\.(png|jpe?g|webp)$/i.test(name))
console.log(`${files.length} company marks in media/\n`)

const map = {}
const tally = { dark: 0, light: 0, colour: 0, failed: 0 }

for (const name of files) {
  try {
    const { verdict, lightness, saturation } = await classify(path.join(MEDIA, name))
    map[name] = verdict
    tally[verdict] += 1
    if (process.argv.includes('--verbose')) {
      console.log(`  ${verdict.padEnd(7)} L=${lightness.toFixed(2)} S=${saturation.toFixed(2)}  ${name}`)
    }
  } catch (error) {
    tally.failed += 1
    console.log(`  ?       could not read ${name}: ${String(error?.message ?? error).slice(0, 60)}`)
  }
}

console.log(
  `\n  dark (invert on a dark ground): ${tally.dark}` +
    `\n  light (leave alone):            ${tally.light}` +
    `\n  colour (never invert):          ${tally.colour}` +
    (tally.failed ? `\n  unreadable:                     ${tally.failed}` : ''),
)

if (WRITE) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, `${JSON.stringify(map, null, 2)}\n`)
  console.log(`\nWritten to ${path.relative(process.cwd(), OUT)}`)
} else {
  console.log('\nRe-run with --write to save the map.')
}
