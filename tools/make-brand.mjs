/**
 * Draws the network's whole brand set from one source.
 *
 *   node tools/make-brand.mjs        (pnpm make:brand)
 *
 *   public/icon.svg              the tab, vector
 *   public/favicon-32.png        the tab, 32px
 *   public/icon-512.png          installable / high-DPI
 *   public/apple-touch-icon.png  180px, iOS home screen
 *   public/logo.svg              the mark alone, currentColor
 *   public/og.png                1200x630, the network share card
 *
 * Those six filenames are fixed: three `generateMetadata` blocks declare them
 * and `PASS_THROUGH` in `src/proxy.ts` exempts five of them from the
 * host-to-path rewrite so every host can fetch them. Renaming one means
 * editing both and gains nothing.
 *
 * ## Why this exists rather than six committed images
 *
 * The network's name is a working title — `pnpm check:launch` reports it as
 * one — and the owner has said it may change. Every *string* on the site
 * already reads `siteName` from Site settings, so a rename is one edit there.
 * Pixels do not read a settings field, which would have left the icon set and
 * the share card as the one place the old brand survived a rename, silently,
 * inside binaries nobody can grep.
 *
 * So: the geometry is `src/lib/brand.ts`, which `src/components/Logo.tsx`
 * renders too, and the words on the card come out of the database at render
 * time. A rename is the edit in the admin plus this one command.
 *
 * ## Two renderers, and the reason is measured rather than assumed
 *
 * The icons are pure geometry, so sharp rasterises them with no browser, no
 * network and no fonts involved. Anything with type on it goes through
 * Chrome, because sharp's SVG renderer resolves fonts through its own
 * fontconfig, which on this machine finds neither Barlow nor a system
 * sans-serif — both `font-family="Barlow Condensed"` and
 * `font-family="sans-serif"` came back set in a typewriter face. It does not
 * error and the PNG is valid, so a card rendered that way ships in the wrong
 * typeface and nothing says so.
 *
 * The split is deliberate in the other direction as well: the icon set is the
 * part that must not depend on a browser being installed, because it is what
 * every host declares on every page.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import sharp from 'sharp'

import { ACCENT, CARD_LAYOUT, CARD_SIZE, PLATE, LEAF, badgeSvg, glyphSvg } from '../src/lib/brand.ts'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

const OUT = path.resolve('public')
const DB = path.resolve('dawnwalker.db')

/** Bytes under a kilobyte: three of these files are smaller than that, and
 *  "0 KB" beside a filename reads as a failure rather than as a small icon. */
const kb = (file) => {
  const bytes = fs.statSync(file).size
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`
}

// --- Identity, from the one field that owns it -----------------------------

/**
 * The card's words come from Site settings → Identity, read-only.
 *
 * Read from the database rather than from `src/seed/data.ts` because the seed
 * is only the *initial* value: the owner renames the network in the admin, and
 * a generator that read the seed file would keep rendering the name they
 * changed away from while reporting success. Nothing is written here, so this
 * is safe to run beside a dev server.
 */
const identity = () => {
  if (!fs.existsSync(DB)) return null
  const db = new DatabaseSync(DB, { readOnly: true })
  const row = db
    .prepare(
      'select site_name, tagline, description, appearance_accent from site_settings limit 1',
    )
    .get()
  const rules = db
    .prepare('select heading from site_settings_rules order by _order')
    .all()
    .map((rule) => rule.heading)
    .filter(Boolean)
  db.close()
  if (!row) return null
  return {
    name: (row.site_name ?? '').trim(),
    tagline: (row.tagline ?? '').trim(),
    description: (row.description ?? '').trim(),
    accent: (row.appearance_accent ?? '').trim() || ACCENT,
    rules,
  }
}

const site = identity()

/*
  The accent is the only colour the owner can change, so it is the only one
  read from anywhere. With no database the icons still draw — they carry no
  words — in the palette's own accent, and the card is refused further down.
*/
const accent = site?.accent ?? ACCENT
if (!site) console.warn(`! no ${path.basename(DB)} — icons only, in the default accent`)

// --- The icon set: sharp, no browser ---------------------------------------

fs.mkdirSync(OUT, { recursive: true })

fs.writeFileSync(path.join(OUT, 'icon.svg'), badgeSvg({ accent }))
fs.writeFileSync(path.join(OUT, 'logo.svg'), glyphSvg())
console.log(`  icon.svg   ${kb(path.join(OUT, 'icon.svg'))}   the badge, vector`)
console.log(`  logo.svg   ${kb(path.join(OUT, 'logo.svg'))}   the mark alone, currentColor`)

/*
  `radius: 0` on the touch icon only. iOS applies its own mask, so a plate
  that is already rounded hands the platform four transparent corners to
  composite a colour of its own choosing into.

  180 is not a multiple of the 64-unit design box, so the ruling on that one
  file lands on fractional pixels. It is harmless at that size and stated here
  because the four-unit grid `src/lib/brand.ts` describes is exact at 16, 32
  and 512 and only approximate here — somebody comparing the files should know
  which one is which.
*/
for (const [file, size, radius] of [
  ['favicon-32.png', 32, undefined],
  ['icon-512.png', 512, undefined],
  ['apple-touch-icon.png', 180, 0],
]) {
  const target = path.join(OUT, file)
  await sharp(Buffer.from(badgeSvg({ accent, size, radius })))
    // Palette-quantised: these are served on every page of ten hosts, and a
    // four-colour mark has no business being a truecolour PNG.
    .png({ compressionLevel: 9, palette: true })
    .toFile(target)
  console.log(`  ${file.padEnd(21)} ${size}px  ${kb(target)}`)
}

// --- The share card: Chrome, because it has words on it --------------------

/** Settings text reaches this file as HTML. Escaped because an apostrophe in
 *  a tagline should not be able to break the card's markup. */
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  )

/**
 * Everything on the card is a settings field, and that is the whole point.
 *
 * Nothing here is a sentence this file invented. The name, the tagline, the
 * description and the four editorial rules all come out of the admin, so the
 * card cannot drift from what the site says about itself — and nothing on it
 * names a game. What it replaces did both: one screenshot of The Blood of
 * Dawnwalker under the headline "You have 480 segments. Spend them well.",
 * credited "Art © Rebel Wolves / Bandai Namco", served as the share card for
 * the hub, the companies host and the people host. Three hosts about eight
 * games, advertising one of them with another publisher's art.
 */
async function renderCard(copy) {
  await checkFontHost()

  const mark = glyphSvg().replace(/currentColor/g, copy.accent)

  /*
    The backdrop is drawn, not photographed: a leaf of vellum was pricked and
    ruled before it was written on, so the card's ground is that ruling — flat
    hairlines and one accent margin, the mark's own structure at poster scale.
    Generated means there is no licence to honour, no credit line to get wrong,
    and nothing about one game on a card served by three hosts that are not
    about games at all.

    The right two-fifths are left empty on purpose. A faint enlargement of the
    mark went there first and read as three floating dark rectangles: the
    margin and the lines are *holes*, so a low-opacity copy leaves them
    brighter than the paper around them. Whitespace was the better answer, and
    it is also what survives being cropped by a client that wants a square.
  */
  const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@600;700&display=swap">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${CARD_SIZE.width}px;height:${CARD_SIZE.height}px;background:${PLATE};color:${LEAF};
    font-family:Barlow,sans-serif;position:relative;overflow:hidden}
  /* The ruling. 42px apart so it reads as a prepared surface at a glance and
     as nothing at all in a 300px-wide timeline crop. */
  .ruling{position:absolute;inset:0;
    background:repeating-linear-gradient(to bottom,transparent 0 41px,#2a2724 41px 42px)}
  /* The margin, in the accent, exactly where the mark puts it — and running
     the full height of the frame, because a ruled margin that stops halfway
     down reads as a stray line rather than as part of the page. */
  .margin{position:absolute;left:${CARD_LAYOUT.ruleX}px;top:56px;bottom:56px;width:5px;background:${copy.accent}}
  .frame{position:absolute;inset:24px;border:1px solid #3a3733;border-radius:6px}
  .body{position:absolute;inset:0;padding:70px ${CARD_LAYOUT.bodyRight}px 64px ${CARD_LAYOUT.bodyLeft}px;
    display:flex;flex-direction:column;justify-content:space-between}
  .top{display:flex;align-items:center;gap:16px}
  .top svg{height:44px;flex:none}
  .brand{font-family:'Barlow Semi Condensed',sans-serif;font-weight:700;font-size:28px;
    letter-spacing:.13em;text-transform:uppercase}
  h1{font-size:64px;line-height:1.04;letter-spacing:-.026em;font-weight:600;max-width:20ch;
    text-wrap:balance}
  .lede{font-size:24px;line-height:1.42;color:#d2ccc5;max-width:46ch;margin-top:20px}
  /* Sized so the four rules this network actually ships fit on one line, and
     still allowed to wrap: the headings are editable, and a longer set should
     run onto a second row rather than off the edge of the card where nobody
     rendering it would see what was lost. */
  .rules{display:flex;flex-wrap:wrap;gap:10px 22px;
    font-family:'Barlow Semi Condensed',sans-serif;font-size:15px;font-weight:600;
    letter-spacing:.1em;text-transform:uppercase;color:#a49c93}
  .rules b{display:flex;align-items:center;gap:10px;font-weight:600}
  /* Four units of the design grid, so the tick beside a rule is the same
     stroke as the ruling inside the mark. */
  .rules b::before{content:'';width:14px;height:4px;background:${copy.accent};flex:none}
</style>
<div class="ruling"></div>
<div class="margin"></div>
<div class="frame"></div>
<div class="body">
  <div class="top">${mark}<span class="brand">${esc(copy.name)}</span></div>
  <div>
    <h1>${esc(copy.tagline || copy.name)}</h1>
    ${copy.description ? `<p class="lede">${esc(copy.description)}</p>` : ''}
  </div>
  <div class="rules">${copy.rules.map((rule) => `<b>${esc(rule)}</b>`).join('')}</div>
</div>`

  const raw = await shoot(html, CARD_SIZE.width, CARD_SIZE.height)
  const target = path.join(OUT, 'og.png')
  /*
    Recompressed on the way out. Chrome writes a truecolour PNG; the card is
    flat colour and type, so this is lossless and the file lands around a tenth
    of the size. The one it replaces was 478 KB, fetched by every crawler and
    every chat client that unfurls a link.
  */
  await sharp(raw).png({ compressionLevel: 9 }).toFile(target)
  console.log(`  og.png                ${CARD_SIZE.width}x${CARD_SIZE.height}  ${kb(target)}`)
  console.log(`\n  card reads: "${copy.name}" / "${copy.tagline}"`)
}

/**
 * Refuses to render the card if the font host is unreachable.
 *
 * Chrome falls back to a system face when a webfont does not arrive, so an
 * offline run produces a perfectly valid card set in whatever Windows or the
 * CI image happens to have — and there is nothing in the output to notice,
 * because the only symptom is that the type is wrong. This is the check for
 * that, and it is why the request is made from node rather than trusted to
 * `--virtual-time-budget`.
 *
 * `Connection: close` because a keep-alive socket still closing when the
 * process exits trips a libuv assertion on Windows and turns a clear refusal
 * into a C stack trace. Same reason `tools/indexnow.mjs` carries it.
 */
async function checkFontHost() {
  const url = 'https://fonts.googleapis.com/css2?family=Barlow:wght@600&display=swap'
  try {
    const response = await fetch(url, { headers: { Connection: 'close' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await response.text()
  } catch (error) {
    throw new Error(
      `Cannot reach fonts.googleapis.com (${error.message}).\n` +
        'The card would render in a system font and look finished, so it is not written.',
    )
  }
}

/*
  Playwright is the path in CI, where its Chromium is already unpacked. It is
  not a dependency of this project, so on a developer machine the import simply
  fails — fall back to whatever Chrome or Edge is installed and drive it through
  its own headless screenshot flag. The HTML is identical either way.

  Lifted from `tools/make-og.mjs`, which this file replaces.
*/
const LOCAL_CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

async function shoot(html, width, height) {
  try {
    await import.meta.resolve('playwright-core')
  } catch {
    return shootWithLocalChrome(html, width, height)
  }
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
  })
  try {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    return await page.screenshot()
  } finally {
    await browser.close()
  }
}

/**
 * Waits for Chrome to actually write the file.
 *
 * On Windows `chrome.exe` re-launches itself and the process we spawned exits
 * immediately, so `execFileSync` returns successfully with no screenshot on
 * disk yet — a clean exit code and `ENOENT` on the next line. Measured at
 * roughly a second on this machine, and it is a race, so it would pass on a
 * fast run and fail on a loaded one.
 *
 * The size has to settle as well as exist, or a large card is read
 * half-written and sharp refuses a truncated PNG. `tools/make-og.mjs` had
 * neither check and got away with it by taking four screenshots in a row:
 * each launch gave the previous one time, and only the last file was ever
 * really at risk.
 */
const waitForFile = async (file, timeout = 30_000) => {
  const deadline = Date.now() + timeout
  let last = -1
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const size = fs.statSync(file).size
      if (size > 0 && size === last) return
      last = size
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Chrome exited but never wrote ${path.basename(file)} (waited ${timeout / 1000}s)`)
}

async function shootWithLocalChrome(html, width, height) {
  const exe = LOCAL_CHROME.find((candidate) => candidate && fs.existsSync(candidate))
  if (!exe) throw new Error(`No Chrome found — set CHROME_PATH. Tried:\n  ${LOCAL_CHROME.join('\n  ')}`)

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-card-'))
  const page = path.join(work, 'card.html')
  const shot = path.join(work, 'card.png')
  fs.writeFileSync(page, html)
  execFileSync(
    exe,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      // The webfont comes off the network; give it time to land before the
      // shot. `checkFontHost` has already established that it can.
      '--virtual-time-budget=4000',
      // A fresh profile per run: a previous Chrome that has exited does not
      // always release the profile lock, and it fails with status 21.
      `--user-data-dir=${path.join(work, 'profile')}`,
      `--window-size=${width},${height}`,
      `--screenshot=${shot}`,
      `file:///${page.replace(/\\/g, '/')}`,
    ],
    { stdio: 'pipe' },
  )
  await waitForFile(shot)
  const png = fs.readFileSync(shot)

  /*
    Chrome can still hold handles inside its profile after exiting, and Windows
    will not delete a file another process has open. Retry, then let it go:
    this is a directory in the system temp folder, not our problem.
  */
  try {
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  } catch {
    console.warn(`  ! left ${work} behind — Chrome still had it open`)
  }
  return png
}

/*
  Printed rather than asserted, because this file cannot see the eight per-wiki
  sets and must not touch them. `tools/make-wiki-icons.mjs` builds Dawnwalker's
  own icons from `public/icon-512.png` — this file's output — because that wiki
  predates the store-page pipeline and has no capsule art to crop. So the next
  `pnpm refresh` gives the Dawnwalker wiki the *network's* mark, which is a tab
  indistinguishable from the hub's rather than a wrong one, and it is the kind
  of thing that is only ever noticed months later.
*/
// --- Render it, once every helper above exists ----------------------------

/*
  A blank name is refused rather than filled in. `siteName` is what the card is
  *of*, and inventing a stand-in would put a name on ten hosts' share previews
  that the owner never chose — the same reason `networkHome` falls back to the
  generic word "Network" rather than to "Vellum".
*/
if (!site?.name) {
  console.error(
    site
      ? '\nSite settings → Identity has no name. The card is what carries it, so it is not rendered.'
      : '\nNo database, so no name, so no card. `pnpm db:reset` then run this again.',
  )
  process.exitCode = 1
} else {
  /*
    Every refusal below is printed and swallowed, never thrown out of the
    module. A top-level throw prints the sentence and then a stack trace after
    it, and on Windows the trace lands under the message the script just wrote
    — so a clear refusal reads as a crash and the line explaining it scrolls
    away. Same lesson as the `process.exit()` note in CLAUDE.md.
  */
  try {
    await renderCard(site)
  } catch (error) {
    console.error(`\n${error.message}`)
    console.error('og.png was not written. Everything above it was.')
    process.exitCode = 1
  }
}

console.log(
  '\n  note: tools/make-wiki-icons.mjs sources the Dawnwalker wiki icons from' +
    '\n        public/icon-512.png, so `pnpm refresh` will give that wiki this' +
    "\n        mark. It needs art of its own; the other seven crop their game's.",
)

console.log(`\nWritten to public/. Committed: they are served static.`)
