/**
 * The typefaces the drawn share card is rendered with, and where they came from.
 *
 * ## Why a font has to be a file in this repository
 *
 * The card is drawn by `next/og`, which is satori plus resvg. Satori has no
 * font discovery of any kind: it is handed font *bytes* or it throws. That is
 * the good half of the bargain, and it is the reason this route draws type at
 * all — `tools/make-brand.mjs` records in its own docstring that sharp's SVG
 * renderer resolves fonts through fontconfig, finds neither Barlow nor a
 * system sans-serif on this machine, and silently sets the card in a
 * typewriter face without erroring. A renderer that refuses is better than one
 * that guesses.
 *
 * The site's own faces come from `next/font/google`, which self-hosts them
 * into the build output as **woff2** under hashed filenames. Satori reads
 * `ttf`, `otf` and `woff` and not woff2, and a hashed path is not something a
 * route can name, so those files cannot be the ones the card uses. Hence
 * `pnpm make:og-fonts`, which writes the same families into `public/fonts/`
 * in a format satori reads and under names this module fixes.
 *
 * ## Why `public/fonts/` and not `assets/`
 *
 * `assets/**` is gitignored — it holds game art that is not ours to
 * redistribute. These are ours to redistribute (Barlow ships under the SIL
 * Open Font License), they have to exist on the deployment or no card renders,
 * and `public/` is the one directory that is committed and copied into the
 * build output. `fonts` is therefore an entry at the root of `public/`, which
 * means it is also in `PASS_THROUGH` in `src/proxy.ts` — `src/proxy.test.ts`
 * fails on the commit that adds it otherwise.
 *
 * ## No imports, on purpose
 *
 * `tools/make-og-fonts.mjs` imports this file directly, the way
 * `tools/make-brand.mjs` imports `brand.ts`, so the generator and the renderer
 * cannot disagree about a filename. Node strips the types but resolves the
 * imports, so anything with a path alias in it would not load there.
 */

/** Relative to the repository root, which is `process.cwd()` at runtime. */
export const OG_FONT_DIR = 'public/fonts'

export type OgFont = {
  /** The family name the card's styles ask for, spelled as Google spells it. */
  name: string
  weight: 400 | 600
  /** The file in `OG_FONT_DIR`. */
  file: string
}

/**
 * The one rule that turns a family and a weight into a filename.
 *
 * A function rather than three string literals because the generator reads the
 * family names out of the stylesheet it downloaded and has to land on the same
 * names this file lists — two hand-typed lists is the shape that drifts.
 */
export const ogFontFile = (family: string, weight: number): string =>
  `${family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${weight}.woff`

const face = (name: string, weight: 400 | 600): OgFont => ({
  name,
  weight,
  file: ogFontFile(name, weight),
})

/**
 * Three faces, and each one is on the card for a reason.
 *
 * - **Barlow 600** is the title. It is the face the site sets a guide's `h1`
 *   in, so a card and the page it links to are the same document.
 * - **Barlow Semi Condensed 600** is the brand row: the network's name beside
 *   the mark, and the wiki's name after it. The same face `tools/make-brand.mjs`
 *   sets the network card's own brand row in.
 * - **Barlow Semi Condensed 400** is the credit strip. Condensed because a
 *   rightsholder line is long and must be printed whole — see `og-card.ts` —
 *   and a narrower face is more characters per line before the card has to
 *   give up the photograph.
 *
 * Regular and semibold only. An italic or a third weight is another 40 KB in
 * the route's bundle for something nothing on the card asks for.
 */
export const OG_FONTS: OgFont[] = [
  face('Barlow', 600),
  face('Barlow Semi Condensed', 600),
  face('Barlow Semi Condensed', 400),
]

/**
 * The stylesheet the generator reads the download URLs out of.
 *
 * Asked for by family and weight rather than by pinning `fonts.gstatic.com`
 * paths, which carry a version segment (`/barlow/v13/`) and change without
 * notice.
 */
export const OG_FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@600&family=Barlow+Semi+Condensed:wght@400;600'

/**
 * A user-agent old enough that `css2` answers in woff rather than woff2.
 *
 * Google Fonts serves whichever format the requesting browser supports, and
 * every current one supports woff2 — which satori cannot read. This is not a
 * trick to get something we are not entitled to: it is the same stylesheet,
 * the same files, in the older of the two formats the API publishes.
 */
export const WOFF_ERA_UA =
  'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/20.0.1132.57 Safari/537.36'

/**
 * A downloaded face this small is not a face.
 *
 * The three that ship are 40–42 KB each. The guard is the lesson
 * `tools/fetch-search-queries.mjs` records: an endpoint that starts answering
 * with an error page writes a valid, tiny, useless file over a good one and
 * nothing errors. Here the symptom would be a card that renders with no
 * glyphs.
 */
export const MIN_FONT_BYTES = 8_000
