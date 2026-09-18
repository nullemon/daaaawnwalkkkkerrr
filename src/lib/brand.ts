/**
 * The network's mark, as geometry rather than as a picture.
 *
 * ## Why this is a module and not five PNGs in `public/`
 *
 * The name is a working title. `siteName` lives in Site settings → Identity
 * precisely so a rename is one edit and ten hosts pick it up, and every string
 * on the site already reads it from there — but an icon set and a share card
 * are *pixels*, and pixels do not read a settings field. A hand-drawn favicon
 * would be the one place in this project where the old brand survives a
 * rename, silently, inside a binary nobody can grep.
 *
 * So the mark is coordinates here, `tools/make-brand.mjs` rasterises every
 * size from them, and `Logo.tsx` renders the same numbers into the DOM. One
 * `pnpm make:brand` after the rename and there is nothing left to hunt. The
 * failure this avoids is not an error — it is a share card still carrying the
 * old name two years later because no check looks inside a PNG.
 *
 * ## What the mark is
 *
 * Vellum is a writing surface: prepared skin, what durable records were kept
 * on before paper. The mark is a leaf of it — trimmed corner, ruled margin,
 * three lines of writing. No gamepad and no letter in a circle: this network's
 * argument is that it is the sourced one, so a written record is the subject
 * rather than decoration over it.
 *
 * Two details carry that and are the first things to check if the mark ever
 * stops reading:
 *
 * - **The margin rule.** A leaf of vellum was pricked and ruled before it was
 *   written on, and the ruled margin is what separates a manuscript leaf from
 *   a sheet of notepaper — which is to say, from the document icon every
 *   operating system already ships. It is the one element in the accent, so
 *   the colour is structural rather than a dab.
 * - **The short last line.** It is the only thing that makes three bands read
 *   as *writing* rather than as a striped box.
 *
 * The margin rule is separated from the lines by a full pixel at 16px. Butted
 * up against them it joins into a bold capital E, which is what the first
 * version did.
 *
 * ## The four-unit grid, which is load-bearing
 *
 * A favicon is seen at 16 and 32 pixels and almost nowhere else. The viewBox
 * is 64 units, so one device pixel at 16px is **four units** and at 32px is
 * two. Every number below is a multiple of four, which means every edge lands
 * on a whole pixel at both sizes and the ruling stays three crisp lines rather
 * than one grey smear.
 *
 * This is not theory: the margin rule was first drawn at x=18, one unit off
 * the grid, and rendered at 16px as a pink blur while looking perfect at
 * 512px. Nothing errors and no test fails at the large end, so `brand.test.ts`
 * pins the grid. If a shape genuinely needs a finer step, change `GRID` and
 * the test with it on purpose, rather than leaving a number off it by mistake.
 */

/** The design box. Shared by the plate, the glyph and every raster size. */
export const VIEW = 64

/**
 * One device pixel at the smallest size the mark is used at.
 *
 * 64 / 16 = 4. A named constant because the test asserts against it, and
 * because the number means nothing without the paragraph above.
 */
export const GRID = 4

/** Charcoal ground and paper ink: the `--ground` and `--ink` tokens. */
export const PLATE = '#131211'
export const LEAF = '#f7f4f1'

/**
 * The accent, defaulting to the network `--accent`.
 *
 * `appearanceAccent` on Site settings overrides it network-wide, so the
 * generator passes whatever that field holds and only falls back to this. A
 * second hard-coded red further down the pipeline would be a second opinion
 * about the brand colour, which is the shape of bug this repo keeps finding.
 */
export const ACCENT = '#d13a44'

type Box = { x: number; y: number; w: number; h: number }

/**
 * The leaf: a portrait sheet with the top-right corner cut away.
 *
 * `corner` is the length of the cut along each edge — three pixels at 16px,
 * small enough to stay a corner and large enough to survive the raster. It is
 * the only part of the outline that says "sheet" with no colour at all, which
 * is what the monochrome requirement rests on.
 */
export const SHEET: Box & { corner: number } = { x: 12, y: 8, w: 40, h: 48, corner: 12 }

/** The ruled margin. One pixel wide at 16px, and the element that carries the accent. */
export const MARGIN: Box = { x: 20, y: 24, w: 4, h: 28 }

/**
 * The writing. Four units tall is exactly one pixel at 16px and two at 32px.
 *
 * Three lines with one-pixel gaps, the last one half length. Cut as holes in
 * the leaf rather than stroked over it, so the whole mark is a single path
 * that reads in one colour — see `markPath`.
 */
export const RULES: Box[] = [
  { x: 28, y: 28, w: 16, h: 4 },
  { x: 28, y: 36, w: 16, h: 4 },
  { x: 28, y: 44, w: 8, h: 4 },
]

/** The plate's corner radius: 3px at 16px, which is the platform convention. */
export const PLATE_RADIUS = 12

/** Every box the mark is built from, for the grid test to walk. */
export const BOXES: Box[] = [SHEET, MARGIN, ...RULES]

const rect = ({ x, y, w, h }: Box) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`

/** The leaf outline, trimmed corner included. */
export const sheetPath = () => {
  const { x, y, w, h, corner } = SHEET
  return `M${x} ${y}H${x + w - corner}L${x + w} ${y + corner}V${y + h}H${x}Z`
}

/** The margin rule on its own, so the badge can ink it in the accent. */
export const marginPath = () => rect(MARGIN)

/**
 * The whole mark as one path: the leaf, with the margin and the three lines as
 * holes in it.
 *
 * One path with `fill-rule="evenodd"` rather than a mask or a clip, because
 * this is what `Logo.tsx` renders and a mask needs an `id`. The rail and the
 * footer both render a Logo, so two masks with the same id would go into one
 * document — invalid, and resolved differently by different browsers. A single
 * evenodd path has no ids to collide, inherits `currentColor`, and *is* the
 * monochrome silhouette rather than being a second copy of the artwork that
 * somebody has to keep in step with the first.
 */
export const markPath = () => [sheetPath(), marginPath(), ...RULES.map(rect)].join('')

/**
 * The glyph's own viewBox: the leaf's bounds plus two units of air.
 *
 * The badge needs the margin of plate around the leaf; a glyph sitting in a
 * 21px rail slot beside icons that fill theirs does not, and handing it the
 * full 64-unit box would render it at 62% of the size of everything next to
 * it. Same coordinates, tighter window — so there is no second set of numbers
 * to drift out of step with the first.
 */
export const glyphBox = () => {
  const pad = 2
  return `${SHEET.x - pad} ${SHEET.y - pad} ${SHEET.w + pad * 2} ${SHEET.h + pad * 2}`
}

/**
 * The badge: the mark on its plate, with colours baked in.
 *
 * This is `public/icon.svg` and the source every PNG in the set is rasterised
 * from, so the SVG one browser picks and the PNG another one picks are the
 * same picture by construction rather than by anybody remembering.
 *
 * The margin is painted back over its own hole. That is the only reason the
 * accent can be structural in the badge and still be part of the silhouette in
 * the glyph, from one set of coordinates.
 *
 * Deliberately **not** theme-aware. An SVG favicon can carry a
 * `prefers-color-scheme` block and flip its plate; a PNG cannot. So a browser
 * taking `icon.svg` and one taking `favicon-32.png` would show different marks
 * on the same machine with nothing anywhere to explain it. A charcoal plate
 * reads on a light tab strip and a dark one, which is why platform icons are
 * plates in the first place.
 */
export const badgeSvg = ({
  accent = ACCENT,
  /*
    The raster size, written onto the root element so the renderer draws the
    vector at the size wanted. Left at 64 it rasterises to 64 pixels and the
    caller upscales a bitmap — which is how an icon set can be blurry at 512
    while the SVG it came from is perfect.
  */
  size = VIEW,
  /*
    Square for the Apple touch icon, which iOS masks and rounds itself: a
    plate that is already rounded leaves transparent corners for the platform
    to composite its own colour into. Rounded everywhere else.
  */
  radius = PLATE_RADIUS,
}: { accent?: string; size?: number; radius?: number } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}" role="img" aria-label="A ruled leaf of vellum">
  <rect width="${VIEW}" height="${VIEW}" rx="${radius}" fill="${PLATE}"/>
  <path d="${markPath()}" fill="${LEAF}" fill-rule="evenodd"/>
  <path d="${marginPath()}" fill="${accent}"/>
</svg>
`

/**
 * The glyph: one path, `currentColor`, no plate.
 *
 * The form the site itself uses — the rail and the footer render it inside
 * `color: var(--accent)` — and the form that has to survive being 17 pixels
 * tall in a footer. Written here as well as in `Logo.tsx` so
 * `public/logo.svg` is the same artwork rather than an export of it that
 * somebody forgets to redo.
 */
export const glyphSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${glyphBox()}" role="img" aria-label="A ruled leaf of vellum">
  <path d="${markPath()}" fill="currentColor" fill-rule="evenodd"/>
</svg>
`
