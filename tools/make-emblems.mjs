/**
 * Draws an abstract emblem for every perk, ending, build, court, court
 * activity and skill tree.
 *
 *   node tools/make-emblems.mjs [--accent=#d13a44] [--size=512]
 *
 * ## Why a generated emblem is allowed where a photograph is not
 *
 * docs/ASSETS.md forbids putting an unidentified screenshot on a record page,
 * and the reason is a claim, not a licence: a forest above the words "Laslea
 * Glen" reads as a claim that it *is* Laslea Glen, whatever the alt text says.
 * Nothing in any press pack names its own subjects, so no record page can
 * carry one.
 *
 * An emblem makes no such claim. It is flat geometry in this site's own
 * palette, derived from the record's slug and nothing else — decoration and
 * identification, the way a colour-coded tab is. Nobody looking at the
 * hexagon over "Walking Fortress" can read it as a picture of Walking
 * Fortress, because there is nothing depicted in it to read.
 *
 * That only holds while the output stays obviously synthetic, so it is kept
 * that way on purpose: hard-edged vector shapes, strict radial symmetry, no
 * texture, no gradient noise, no figurative element, and a visible plate frame
 * around every one. If a future edit ever makes these look like rendered
 * art — depth, lighting, anything organic — it has quietly turned decoration
 * back into a claim, and the rule above starts applying again.
 *
 * These six collections have no art at all and no `assets/` folder, which is
 * why they are the ones that get emblems. A collection whose records can have
 * a real, sourced, identified picture should get that instead.
 *
 * ## Deterministic, or the site reshuffles itself
 *
 * Every choice below comes from a hash of the slug. A reader who bookmarks a
 * perk should find the same emblem next week, and a rebuild must not hand out
 * a fresh set of icons across a hundred pages for no reason anybody could
 * explain. There is no randomness here and none may be added: seed anything
 * new off `hash(slug, salt)` the same way.
 *
 * Output is `assets/<folder>/<slug>.png`, the layout `pnpm assets` and
 * `pnpm seed:emblems` both read. Square PNG, sized for the 64px card
 * thumbnail as much as for the record page — which is why the shapes are few
 * and large and every stroke is wide enough to survive the downscale.
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { createRequire } from 'module'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

const OUT_ROOT = path.resolve('assets')
const DB = path.resolve('dawnwalker.db')

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const SIZE = Number(arg('size', 512))

/**
 * The plate the emblem sits on, straight from the `--ground` and `--rule`
 * tokens at the top of src/app/(frontend)/globals.css. Hard-coded rather than
 * parsed: this writes PNGs, so whatever it reads is baked in at generation
 * time anyway, and a silent mismatch is easier to spot in one list than in a
 * regex over a stylesheet.
 */
const GROUND = '#070720'
const SUNKEN = '#11112a'
const RULE = '#2d2d5e'

/**
 * The halo on the plate, tinting every emblem toward the wiki it belongs to.
 *
 * All six collections are game-scoped and every record in them currently
 * belongs to one game, so the default is the network `--accent`. `theme.accent`
 * lives on the Game record and a generator has no business opening Payload to
 * read it, so a second wiki's set is produced by passing its colour in rather
 * than by teaching this file about the database.
 */
const ACCENT = arg('accent', '#d13a44')

/**
 * One silhouette and one colour per collection, so a perk emblem and an ending
 * emblem are told apart before either is read.
 *
 * Both signals are carried at once on purpose. Colour alone fails for a reader
 * who cannot separate the two blues, and shape alone fails at 64px on a busy
 * index; together they hold in either case. Every hue is a token from
 * globals.css, named here so a palette change has somewhere to land.
 */
const KINDS = {
  perks: { table: 'perks', folder: 'perks', shape: 'hexagon', hue: 37, sat: 72, light: 52, token: '--legendary' },
  endings: { table: 'endings', folder: 'endings', shape: 'circle', hue: 356, sat: 62, light: 50, token: '--accent' },
  builds: { table: 'builds', folder: 'builds', shape: 'diamond', hue: 210, sat: 80, light: 54, token: '--rare' },
  courts: { table: 'courts', folder: 'courts', shape: 'pentagon', hue: 218, sat: 16, light: 58, token: '--common' },
  'court-activities': {
    table: 'court_activities',
    folder: 'court-activities',
    shape: 'tablet',
    hue: 147,
    sat: 50,
    light: 48,
    token: '--good',
  },
  // `skills`, not `skill-trees`: the folder name is the one `pnpm assets`
  // already maps onto this collection (see FOLDERS in src/seed/assets.ts).
  // Inventing a second spelling would make `pnpm assets` warn and skip.
  'skill-trees': {
    table: 'skill_trees',
    folder: 'skills',
    shape: 'triangle',
    hue: 222,
    sat: 60,
    light: 76,
    token: '--ink-soft',
  },
}

/**
 * Same slug, same number, every machine and every run.
 *
 * Salted, because the five choices below are all taken from this one function
 * and an unsalted hash would move them in lockstep — every slug that landed on
 * the same device would land on the same rotation and the same hue with it,
 * and the set would look far smaller than it is. The non-zero start is for
 * short slugs, which otherwise cluster in the low bits.
 */
const hash = (slug, salt) => {
  let value = 2166136261
  for (const char of `${salt}:${slug}`) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

const C = SIZE / 2
const R = SIZE * 0.365

const points = (sides, rotation) =>
  Array.from({ length: sides }, (_, index) => {
    const angle = ((index / sides) * 360 + rotation - 90) * (Math.PI / 180)
    return `${(C + R * Math.cos(angle)).toFixed(1)},${(C + R * Math.sin(angle)).toFixed(1)}`
  }).join(' ')

/** The collection's silhouette, as one SVG element with whatever paint is
 *  handed to it. Drawn twice — filled, then stroked over the device — so the
 *  rim reads as an edge rather than an outline sitting behind the pattern. */
const silhouette = (shape, paint) => {
  switch (shape) {
    case 'circle':
      return `<circle cx="${C}" cy="${C}" r="${R.toFixed(1)}" ${paint}/>`
    case 'tablet': {
      const side = R * 1.72
      return `<rect x="${(C - side / 2).toFixed(1)}" y="${(C - side / 2).toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" rx="${(SIZE * 0.085).toFixed(1)}" ${paint}/>`
    }
    case 'diamond':
      return `<polygon points="${points(4, 0)}" ${paint}/>`
    case 'triangle':
      return `<polygon points="${points(3, 0)}" ${paint}/>`
    case 'pentagon':
      return `<polygon points="${points(5, 0)}" ${paint}/>`
    case 'hexagon':
    default:
      return `<polygon points="${points(6, 0)}" ${paint}/>`
  }
}

/**
 * The inner device — what makes two perks different from each other.
 *
 * Six patterns, each with a count and a rotation, all cut from the same dark
 * ground colour so the body stays the collection's. Deliberately a small
 * vocabulary of unambiguous shapes: the largest collection here is 41 records,
 * and 6 × 6 counts × 12 rotations is far more than that without reaching for
 * anything fiddly enough to turn to mush at 64px.
 */
const DEVICES = ['spokes', 'rings', 'bars', 'orbit', 'chevrons', 'lattice']

/**
 * How much of the plate each silhouette actually encloses.
 *
 * The device is drawn to a circle and then clipped, so on a triangle — whose
 * inscribed circle is half its radius — most of the pattern lands outside the
 * shape and gets thrown away, leaving three near-empty emblems that read as
 * unfinished rather than plain. Shrink the device to what the shape can hold.
 */
const DEVICE_SCALE = {
  circle: 1,
  hexagon: 0.94,
  tablet: 0.94,
  pentagon: 0.86,
  diamond: 0.76,
  triangle: 0.58,
}

const device = (name, count, ink) => {
  const w = SIZE * 0.035
  const stroke = `fill="none" stroke="${ink}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"`

  switch (name) {
    case 'rings':
      return Array.from({ length: Math.min(count, 4) }, (_, index) => {
        const r = R * (0.3 + index * 0.23)
        return `<circle cx="${C}" cy="${C}" r="${r.toFixed(1)}" ${stroke}/>`
      }).join('')

    case 'bars':
      return Array.from({ length: count }, (_, index) => {
        const y = C + (index - (count - 1) / 2) * (SIZE * 0.105)
        return `<line x1="${(C - R).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(C + R).toFixed(1)}" y2="${y.toFixed(1)}" ${stroke}/>`
      }).join('')

    case 'orbit':
      return (
        `<circle cx="${C}" cy="${C}" r="${(R * 0.26).toFixed(1)}" fill="${ink}"/>` +
        Array.from({ length: count }, (_, index) => {
          const angle = ((index / count) * 360 - 90) * (Math.PI / 180)
          const x = C + R * 0.66 * Math.cos(angle)
          const y = C + R * 0.66 * Math.sin(angle)
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(R * 0.13).toFixed(1)}" fill="${ink}"/>`
        }).join('')
      )

    case 'chevrons':
      return Array.from({ length: count }, (_, index) => {
        const y = C - R * 0.62 + index * (SIZE * 0.1)
        const reach = R * 0.62
        return `<polyline points="${(C - reach).toFixed(1)},${y.toFixed(1)} ${C},${(y + SIZE * 0.085).toFixed(1)} ${(C + reach).toFixed(1)},${y.toFixed(1)}" ${stroke} stroke-linejoin="round"/>`
      }).join('')

    case 'lattice': {
      const n = Math.max(2, Math.min(count, 4))
      const step = (R * 1.3) / (n - 1)
      const dots = []
      for (let row = 0; row < n; row += 1) {
        for (let col = 0; col < n; col += 1) {
          const x = C - (R * 1.3) / 2 + col * step
          const y = C - (R * 1.3) / 2 + row * step
          dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(SIZE * 0.038).toFixed(1)}" fill="${ink}"/>`)
        }
      }
      return dots.join('')
    }

    case 'spokes':
    default:
      return Array.from({ length: count }, (_, index) => {
        const angle = ((index / count) * 360 - 90) * (Math.PI / 180)
        const x1 = C + R * 0.24 * Math.cos(angle)
        const y1 = C + R * 0.24 * Math.sin(angle)
        const x2 = C + R * 0.88 * Math.cos(angle)
        const y2 = C + R * 0.88 * Math.sin(angle)
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${stroke}/>`
      }).join('')
  }
}

/**
 * Twelve slots around the rim, on or off by one bit of the hash each.
 *
 * This is the tiebreaker, and it exists because the five choices above pick
 * from small ranges — six devices, six counts, twenty-four angles — and two
 * slugs landing on all five is not rare enough to ignore. The first run of
 * this file gave `lethal-crescendo` and `shapeshift` byte-identical emblems.
 * Widening those ranges only makes that less likely; a 4,096-state ring makes
 * it vanishingly unlikely, and `signature()` below still refuses to ship one.
 *
 * It also earns its place visually: a machine-read index mark is the last
 * thing anybody mistakes for concept art.
 */
const TICKS = 12

const tickRing = (slug, on, off) => {
  const bits = hash(slug, 'ticks')
  const inner = SIZE * 0.4
  const outer = SIZE * 0.435
  return Array.from({ length: TICKS }, (_, index) => {
    const angle = ((index / TICKS) * 360 - 90) * (Math.PI / 180)
    const lit = (bits >>> index) & 1
    const paint = lit ? `stroke="${on}" stroke-opacity="0.9"` : `stroke="${off}" stroke-opacity="0.85"`
    return `<line x1="${(C + inner * Math.cos(angle)).toFixed(1)}" y1="${(C + inner * Math.sin(angle)).toFixed(1)}" x2="${(C + outer * Math.cos(angle)).toFixed(1)}" y2="${(C + outer * Math.sin(angle)).toFixed(1)}" ${paint} stroke-width="${(SIZE * 0.022).toFixed(1)}" stroke-linecap="round"/>`
  }).join('')
}

/**
 * Every choice the drawing makes, in one object.
 *
 * Pulled out so `signature()` below compares what actually gets drawn rather
 * than the hashes behind it. The distinction is the whole value of the check:
 * `lethal-crescendo` and `shapeshift` have six different hashes each and still
 * rendered the same file, because every one of them reduced to the same small
 * number. A guard on the raw hashes would have passed them.
 */
const paramsFor = (kind, slug) => ({
  device: DEVICES[hash(slug, 'device') % DEVICES.length],
  count: 3 + (hash(slug, 'count') % 6),
  spin: (hash(slug, 'spin') % 24) * 15,
  // A drift, not a free hue. Wider and the collection stops reading as one
  // set, which is the thing the shared colour is there to do.
  hue: (kind.hue + ((hash(slug, 'hue') % 33) - 16) + 360) % 360,
  light: kind.light + ((hash(slug, 'light') % 15) - 7),
  bits: hash(slug, 'ticks') & ((1 << TICKS) - 1),
})

/** Two records with the same signature draw the same picture. */
const signature = (kind, slug) => Object.values(paramsFor(kind, slug)).join('.')

const svgFor = (kind, slug) => {
  const { device: deviceName, count, spin, hue, light } = paramsFor(kind, slug)
  const scale = DEVICE_SCALE[kind.shape] ?? 1

  const body = `hsl(${hue} ${kind.sat}% ${light}%)`
  const deep = `hsl(${hue} ${kind.sat}% ${Math.max(10, light - 24)}%)`
  const rim = `hsl(${hue} ${Math.min(100, kind.sat + 10)}% ${Math.min(94, light + 22)}%)`
  const inset = SIZE * 0.055

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="Abstract emblem">
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SUNKEN}"/>
      <stop offset="1" stop-color="${GROUND}"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${body}"/>
      <stop offset="1" stop-color="${deep}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.46" r="0.62">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="sil">${silhouette(kind.shape, '')}</clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#plate)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#halo)"/>
  <rect x="${inset.toFixed(1)}" y="${inset.toFixed(1)}" width="${(SIZE - inset * 2).toFixed(1)}" height="${(SIZE - inset * 2).toFixed(1)}" rx="${(SIZE * 0.03).toFixed(1)}" fill="none" stroke="${RULE}" stroke-width="${(SIZE * 0.012).toFixed(1)}"/>
  ${silhouette(kind.shape, 'fill="url(#body)"')}
  <g clip-path="url(#sil)" opacity="0.62">
    <g transform="rotate(${spin} ${C} ${C})">
      <g transform="translate(${(C * (1 - scale)).toFixed(1)} ${(C * (1 - scale)).toFixed(1)}) scale(${scale})">
        ${device(deviceName, count, GROUND)}
      </g>
    </g>
  </g>
  ${silhouette(kind.shape, `fill="none" stroke="${rim}" stroke-width="${(SIZE * 0.022).toFixed(1)}" stroke-linejoin="round"`)}
  ${tickRing(slug, rim, RULE)}
</svg>
`
}

if (!fs.existsSync(DB)) {
  console.error(`No ${path.basename(DB)} — run \`pnpm db:reset\` first.`)
  process.exit(1)
}

/*
  Slugs come from the database read-only, the way tools/make-guide-images.mjs
  takes its guide list. Nothing is written here, so this is safe to run
  alongside a dev server; only `pnpm seed:emblems` touches the database.
*/
const db = new DatabaseSync(DB, { readOnly: true })

let total = 0
const perKind = []
const collisions = []

for (const [collection, kind] of Object.entries(KINDS)) {
  const rows = db.prepare(`select slug from ${kind.table} where slug is not null order by slug`).all()
  const dir = path.join(OUT_ROOT, kind.folder)
  fs.mkdirSync(dir, { recursive: true })

  /*
    Two records in one collection drawing the same emblem is a quiet failure —
    both pages look finished and the set looks smaller than it is. Nothing
    downstream can catch it, so it is caught here.
  */
  const seen = new Map()

  for (const row of rows) {
    const mark = signature(kind, row.slug)
    if (seen.has(mark)) collisions.push(`${collection}: ${seen.get(mark)} and ${row.slug} draw the same emblem`)
    seen.set(mark, row.slug)

    const out = path.join(dir, `${row.slug}.png`)
    await sharp(Buffer.from(svgFor(kind, row.slug))).png({ compressionLevel: 9 }).toFile(out)
    total += 1
  }

  perKind.push(`  ${collection.padEnd(17)} ${String(rows.length).padStart(3)}  ${kind.shape.padEnd(9)} ${kind.token}  -> assets/${kind.folder}/`)
}

console.log(perKind.join('\n'))
console.log(`\n${total} emblems at ${SIZE}x${SIZE}, accent ${ACCENT}`)

if (collisions.length > 0) {
  console.error(`\n${collisions.length} collision(s) — two records would share a picture:`)
  collisions.forEach((line) => console.error(`  ${line}`))
  console.error('Widen a range in svgFor(); do not special-case a slug, which would not survive a rename.')
  process.exitCode = 1
} else {
  console.log('Run `pnpm seed:emblems` to attach them.')
}
