/**
 * Draws a monogram for every contributor.
 *
 *   node tools/make-avatars.mjs
 *
 * ## Why a monogram and not a photograph
 *
 * A profile with no picture at all looks unfinished, and an unfinished profile
 * undermines the byline it is attached to — which is the whole point of having
 * one.
 *
 * The obvious fix is a stock portrait, and it is the wrong one twice over. A
 * stranger's face attached to a name that is not theirs is a small lie told on
 * every page that person signs, and it is precisely the pattern search
 * guidance about authorship exists to catch. A generated face is worse: it is
 * the same lie with nobody to complain.
 *
 * So: initials on a coloured ground. Obviously not a photograph, deliberate
 * rather than missing, and replaced the moment somebody uploads a real one.
 *
 * Writes SVG, which `seed:avatars` uploads. Deterministic — the same name
 * always produces the same colour, so re-running changes nothing.
 */
import fs from 'fs'
import path from 'path'

const OUT = path.resolve('assets/_library/avatars')

/**
 * The site's own accent range rather than arbitrary colours, so six avatars in
 * a row read as one set instead of a paint chart.
 */
const HUES = [352, 12, 28, 268, 208, 158]

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

/** Same name, same colour, every run. */
const hueFor = (name) => {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return HUES[hash % HUES.length]
}

const svgFor = (name) => {
  const hue = hueFor(name)
  const text = initials(name)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="${text}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 42% 26%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 18) % 360} 38% 15%)"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" fill="url(#g)"/>
  <circle cx="160" cy="160" r="118" fill="none" stroke="hsl(${hue} 46% 62%)" stroke-opacity="0.34" stroke-width="2"/>
  <text x="160" y="160" fill="hsl(${hue} 52% 82%)"
        font-family="Georgia, 'Times New Roman', serif" font-size="118" font-weight="600"
        letter-spacing="4" text-anchor="middle" dominant-baseline="central">${text}</text>
</svg>
`
}

/*
  Read from the roster rather than retyped.

  This was a hardcoded list with a comment asking whoever came next to keep it
  in step with `authors` in src/seed/data.ts by hand — an arrangement that
  survives exactly until somebody adds a name, and then leaves a contributor
  whose profile renders an empty frame. One file, two readers.
*/
const ROSTER = path.resolve('src/seed/raw/contributors.json')
const NAMES = JSON.parse(fs.readFileSync(ROSTER, 'utf8')).contributors.map((c) => c.name)

fs.mkdirSync(OUT, { recursive: true })

for (const name of NAMES) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const file = path.join(OUT, `${slug}.svg`)
  fs.writeFileSync(file, svgFor(name))
  console.log(`  ${initials(name).padEnd(3)} ${slug}.svg`)
}

console.log(`\n${NAMES.length} monograms in assets/_library/avatars/`)
console.log('Run `pnpm seed:avatars` to attach them.')
