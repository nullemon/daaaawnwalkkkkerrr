/**
 * Gives every wiki its own favicon, touch icon and share card.
 *
 *   node tools/make-wiki-icons.mjs
 *
 * ## The problem this fixes
 *
 * All eight hosts were serving `public/favicon-32.png` and `public/og.png` —
 * one icon and one share image, both cut from Dawnwalker art. So eight browser
 * tabs looked identical, eight bookmarks were indistinguishable, and sharing
 * an Onimusha page put Bandai Namco's key art on a link about a Capcom game.
 * That last one is the same misattribution the section-art rule exists to
 * prevent, arriving through a different door.
 *
 * ## What it makes, per wiki
 *
 *   icon-32.png            the tab
 *   icon-512.png           installable / high-DPI
 *   apple-touch-icon.png   180px, iOS home screen
 *   og.jpg                 1200x630, the link preview
 *
 * Icons are a centre crop of the game's capsule art, which is what a publisher
 * designs to be recognisable at thumbnail size — the job a favicon does. The
 * share card is the wide hero with the game's transparent logo composited over
 * it where Steam publishes one, and a plain crop where it does not.
 *
 * Output goes to `public/wiki-assets/<slug>/`. That prefix is in PASS_THROUGH
 * in `proxy.ts`, so every host serves it unrewritten.
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const RAW_DIR = path.resolve('src/seed/raw/games')
const ART_DIR = path.resolve('assets/_games')
const OUT_ROOT = path.resolve('public/wiki-assets')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Steam publishes these on its CDN but not through the store API, so they are
 * fetched by convention rather than discovered. Not every game has every one —
 * a title still months from release often has none — and a 404 here is
 * expected rather than an error.
 */
const CDN = (appId, file) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${file}`

const fetchIfMissing = async (url, file) => {
  if (fs.existsSync(file)) return true
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!response.ok) return false
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
    await sleep(150)
    return true
  } catch {
    return false
  }
}

const firstExisting = (...files) => files.find((file) => file && fs.existsSync(file))

/**
 * Dawnwalker predates the store-page pipeline and has no Steam app, so its
 * sources are the decorative set `tools/make-art.mjs` already built. Handled
 * first and separately rather than being the one wiki left without an icon.
 */
const dawnwalker = async () => {
  const out = path.join(OUT_ROOT, 'dawnwalker')
  fs.mkdirSync(out, { recursive: true })

  const square = path.resolve('public/icon-512.png')
  const wide = path.resolve('public/art/og-bg.webp')
  if (!fs.existsSync(square)) return

  for (const [name, size] of [
    ['icon-32.png', 32],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ]) {
    await sharp(square)
      .resize(size, size, { fit: 'cover' })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(path.join(out, name))
  }

  if (fs.existsSync(wide)) {
    await sharp(wide)
      .resize(1200, 630, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(out, 'og.jpg'))
  }

  console.log('\nThe Blood of Dawnwalker\n  icons and card from its own art set')
}

await dawnwalker()

const games = fs.existsSync(RAW_DIR)
  ? fs.readdirSync(RAW_DIR).filter((name) => name.endsWith('.json'))
  : []

if (games.length === 0) {
  console.log('No game data. Run `node tools/fetch-game-data.mjs` first.')
  process.exit(0)
}

for (const file of games) {
  const game = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8'))
  const dir = path.join(ART_DIR, game.slug)
  const out = path.join(OUT_ROOT, game.slug)
  fs.mkdirSync(out, { recursive: true })

  process.stdout.write(`\n${game.title}\n`)

  // --- The extra library art, where it exists ----------------------------
  const logoFile = path.join(dir, 'logo.png')
  const portraitFile = path.join(dir, 'library_600x900.jpg')
  const libraryHeroFile = path.join(dir, 'library_hero.jpg')

  const haveLogo = await fetchIfMissing(CDN(game.appId, 'logo.png'), logoFile)
  await fetchIfMissing(CDN(game.appId, 'library_600x900.jpg'), portraitFile)
  const haveLibraryHero = await fetchIfMissing(CDN(game.appId, 'library_hero.jpg'), libraryHeroFile)

  /*
    Source for the icons: the portrait capsule first, then the wide capsule,
    then the header. A publisher designs the capsule to read at thumbnail
    size, which is exactly the job an icon does — a centre crop of a
    screenshot is mush at 32 pixels.
  */
  const iconSource = firstExisting(
    portraitFile,
    path.join(dir, 'capsule.jpg'),
    path.join(dir, 'header.jpg'),
  )

  if (!iconSource) {
    console.log('  no art to work from — skipped')
    continue
  }

  const sizes = [
    ['icon-32.png', 32],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ]

  for (const [name, size] of sizes) {
    await sharp(iconSource)
      .resize(size, size, { fit: 'cover', position: 'attention' })
      // Palette-quantised and fully compressed. These are committed and served
      // on every page load; the first pass produced 11 MB of PNG across seven
      // wikis, which is not a favicon budget.
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(path.join(out, name))
  }

  // --- The share card ----------------------------------------------------
  const cardSource = firstExisting(
    libraryHeroFile,
    path.join(dir, 'background.jpg'),
    path.join(dir, 'header.jpg'),
  )

  const base = sharp(cardSource)
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    // Knocked back so an overlaid logo stays legible, and so the card reads as
    // a link preview rather than as a screenshot we are presenting as our own.
    .modulate({ brightness: 0.72 })

  if (haveLogo) {
    /*
      The transparent logo, composited at a size that leaves margin on a phone
      where link previews are cropped. `contain` rather than `cover` because a
      logo cropped at the edges is worse than a small one.
    */
    const logo = await sharp(logoFile)
      .resize(760, 360, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    await base
      .composite([{ input: logo, gravity: 'centre' }])
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(out, 'og.jpg'))
  } else {
    await base.jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(out, 'og.jpg'))
  }

  const bytes = fs
    .readdirSync(out)
    .reduce((sum, name) => sum + fs.statSync(path.join(out, name)).size, 0)

  console.log(
    `  icons from ${path.basename(iconSource)}, card from ${path.basename(cardSource)}` +
      `${haveLogo ? ' with logo' : ''}${haveLibraryHero ? '' : ' (no library hero)'}` +
      ` — ${(bytes / 1024).toFixed(0)} KB`,
  )
}

console.log(`\nWritten to public/wiki-assets/. These are committed: they are served static.`)
