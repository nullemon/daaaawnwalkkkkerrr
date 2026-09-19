/**
 * Puts the share card's typefaces in the repository.
 *
 *   node tools/make-og-fonts.mjs        (pnpm make:og-fonts)
 *
 *   public/fonts/barlow-600.woff
 *   public/fonts/barlow-semi-condensed-600.woff
 *   public/fonts/barlow-semi-condensed-400.woff
 *   public/fonts/SOURCE.txt
 *
 * ## Why this is a command and not a `fetch` in the route
 *
 * `src/app/api/og/[collection]/[slug]/route.tsx` draws a guide's share card
 * with `next/og`, which is satori: it is handed font bytes or it throws. Those
 * bytes have to be on the deployment, so they are committed, so something has
 * to put them there.
 *
 * Fetching them at request time instead would put fonts.googleapis.com on the
 * path of every card render — and `tools/make-brand.mjs` already refuses to
 * render its own card when that host is unreachable, for the reason written
 * there: a missing webfont does not error, it just sets the type in something
 * else. Satori's version of that failure is louder (it throws rather than
 * substituting) but a card that 500s on a crawler is still a link with no
 * preview, decided by somebody else's rate limit.
 *
 * The filenames are not this file's opinion. `src/lib/og-fonts.ts` owns them
 * and the route reads the same list, the way `tools/make-brand.mjs` reads the
 * mark out of `src/lib/brand.ts` — there is nowhere for the two to drift.
 *
 * ## Windows
 *
 * Everything here goes through `node:fs`. Nothing shells out, and the process
 * never calls `process.exit()` after a `fetch`: a keep-alive socket still
 * closing at exit trips a libuv assertion on Windows and buries the sentence
 * explaining the refusal under a C stack trace. Every request carries
 * `Connection: close` and failures set `process.exitCode`, same as
 * `tools/indexnow.mjs`.
 */
import fs from 'fs'
import path from 'path'

import {
  MIN_FONT_BYTES,
  OG_FONTS,
  OG_FONT_CSS_URL,
  OG_FONT_DIR,
  WOFF_ERA_UA,
  ogFontFile,
} from '../src/lib/og-fonts.ts'

const OUT = path.resolve(OG_FONT_DIR)

const get = (url, headers = {}) =>
  fetch(url, { headers: { ...headers, Connection: 'close' } })

/**
 * Every `@font-face` in the stylesheet, as family / weight / url.
 *
 * Read block by block rather than with one expression spanning a whole rule.
 * A lazy quantifier in front of an optional group matches the shortest thing
 * that satisfies the *rest* of the pattern, which is how the achievement
 * scraper captured fifty-two null percentages without erroring — the note is
 * in CLAUDE.md and this is the same shape of parse.
 */
const faces = (css) =>
  [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)]
    .map(([, block]) => {
      const family = /font-family:\s*'([^']+)'/.exec(block)?.[1]
      const weight = /font-weight:\s*(\d+)/.exec(block)?.[1]
      const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1]
      return family && weight && url ? { family, weight: Number(weight), url } : null
    })
    .filter(Boolean)

const fail = (message) => {
  console.error(`\n${message}`)
  process.exitCode = 1
}

const css = await get(OG_FONT_CSS_URL, { 'User-Agent': WOFF_ERA_UA })
  .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`))))
  .catch((error) => {
    fail(
      `Cannot read the Google Fonts stylesheet (${error.message}).\n` +
        'Nothing was written, so whatever is already in public/fonts/ still stands.',
    )
    return null
  })

if (css) {
  const available = faces(css)

  /*
    Matched by family and weight rather than by position. `css2` returns the
    faces in the order it feels like, and taking them in order would silently
    save the 400 as the 600 — a card set one weight light, which looks like a
    design decision rather than a bug.
  */
  const missing = OG_FONTS.filter(
    (want) => !available.some((face) => ogFontFile(face.family, face.weight) === want.file),
  )

  if (missing.length > 0) {
    fail(
      `The stylesheet did not offer ${missing.map((font) => `${font.name} ${font.weight}`).join(', ')}.\n` +
        `Asked for: ${OG_FONT_CSS_URL}\nNothing was written.`,
    )
  } else {
    fs.mkdirSync(OUT, { recursive: true })
    const written = []

    for (const want of OG_FONTS) {
      const face = available.find((entry) => ogFontFile(entry.family, entry.weight) === want.file)
      const target = path.join(OUT, want.file)

      const bytes = await get(face.url)
        .then((response) =>
          response.ok
            ? response.arrayBuffer()
            : Promise.reject(new Error(`HTTP ${response.status}`)),
        )
        .then((buffer) => Buffer.from(buffer))
        .catch((error) => {
          fail(`${want.file}: ${error.message}. Left whatever was already there.`)
          return null
        })

      if (!bytes) continue

      /*
        A short answer is not a font. Google answers a throttled client with a
        page rather than a file, and `sharp` and satori both accept whatever
        they are given until they cannot parse it — at which point the card
        fails at render time on the deployment rather than here, where somebody
        is watching.
      */
      if (bytes.length < MIN_FONT_BYTES) {
        fail(
          `${want.file} came back as ${bytes.length} bytes, which is not a typeface.\n` +
            'Refused rather than written over the copy on disk.',
        )
        continue
      }

      fs.writeFileSync(target, bytes)
      written.push({ ...want, url: face.url, bytes: bytes.length })
      console.log(`  ${want.file.padEnd(34)} ${(bytes.length / 1024).toFixed(0)} KB`)
    }

    if (written.length === OG_FONTS.length) {
      /*
        What was taken, from where, and when. The licence is not restated here
        — asserting terms this script did not read would be the same class of
        error as a `©` over a credit line that does not carry one — so the note
        records the facts the run observed and points at the page that states
        the terms.
      */
      fs.writeFileSync(
        path.join(OUT, 'SOURCE.txt'),
        [
          'Typefaces for the drawn share card (src/app/api/og/…).',
          `Written by tools/make-og-fonts.mjs on ${new Date().toISOString().slice(0, 10)}.`,
          '',
          `Stylesheet: ${OG_FONT_CSS_URL}`,
          '',
          ...written.map((font) => `${font.file}  ${font.name} ${font.weight}  ${font.url}`),
          '',
          'Barlow is published through Google Fonts. Its licence is stated at',
          'https://fonts.google.com/specimen/Barlow/license — read it there rather',
          'than trusting this file, which only records where the bytes came from.',
          '',
          'These are served as well as read: `fonts` is in PASS_THROUGH in',
          'src/proxy.ts because every entry at the root of public/ has to be.',
          '',
        ].join('\n'),
      )
      console.log(`  SOURCE.txt                         what was taken, and from where`)
      console.log(`\nWritten to ${OG_FONT_DIR}/. Committed: the card cannot render without them.`)
    } else {
      console.error('\nIncomplete. The card needs all three faces; it will fall back to the')
      console.error('page’s own photograph until this runs cleanly.')
    }
  }
}
