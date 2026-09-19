import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { NextResponse, type NextRequest } from 'next/server'
import sharp from 'sharp'
import { ACCENT, CARD_LAYOUT, CARD_SIZE, LEAF, PLATE, glyphBox, glyphDataUri } from '@/lib/brand'
import { cardGround, cardRules, cardTitleSize, isOgCardCollection } from '@/lib/og-card'
import { OG_FONTS, OG_FONT_DIR } from '@/lib/og-fonts'
import { getBySlug, getGame, getSiteSettings } from '@/lib/payload'
import { shownImage } from '@/lib/sitemap-images'
import { subdomainOf } from '@/proxy'
import type { Media } from '@/payload-types'

/**
 * A guide's share card: its own photograph, with its own headline, this
 * network's mark and the accent rule drawn on top.
 *
 * ## Why this is drawn on request when nothing else on this network is
 *
 * Every public page here prerenders to static HTML, and that rule is load
 * bearing — it is why the site is fast and why `/api/hit` exists at all. It
 * does not reach this route, for three reasons that are worth writing down
 * because "prerender everything" is otherwise the obvious answer.
 *
 * **An `og:image` is never on a reader's path.** It is fetched by an unfurler
 * — Facebook, Slack, Discord, Reddit, X — once per link, and cached by it for
 * days. Nobody waits on this. The thing prerendering buys is the one thing
 * this response does not need.
 *
 * **A pre-generated card is a second copy of the title.** 410 guides on eight
 * wikis would be 410 PNGs in `public/`, each with a headline baked into it,
 * and an editor renaming a guide in the admin would change the page, the
 * sitemap, the feeds and the `<title>` while the share card kept saying the
 * old thing — silently, inside a binary nobody can grep. That is exactly the
 * failure `src/lib/brand.ts` exists to prevent one level up: the network's
 * name is a working title, so the icon set is geometry rather than committed
 * pixels. The same argument applies to a headline, which changes far more
 * often than a brand does.
 *
 * **A guide created in the admin gets a card immediately.** `[game]` carried
 * `dynamicParams = false` once, and a wiki created in the admin answered 404
 * until somebody rebuilt. A card that only exists after a generator runs is
 * that lesson again, with an unfurl instead of a page.
 *
 * The cost is bounded and paid by crawlers: one sharp resize and one satori
 * render, behind a long `Cache-Control`.
 *
 * ## Why it answers on every host and reads the Host header
 *
 * `/api` is in `PASS_THROUGH` in `proxy.ts`, so this route is never rewritten
 * onto a game prefix and answers identically on all ten hosts. That makes the
 * Host header the only thing that knows which wiki is asking — the same
 * arrangement, and the same reasoning, as `/api/hit`. The alternative would be
 * putting the game slug in the URL, and the internal path scheme is an
 * implementation detail no crawler should ever be shown.
 *
 * ## What it refuses to do
 *
 * The rule about the photograph is in `src/lib/og-card.ts` and it is the whole
 * point of the file: the card prints the picture's credit in full, or it does
 * not use the picture. A screenshot belonging to a publisher, with this
 * network's wordmark over it and no credit, is the `ART_GAME` misattribution
 * with a wider audience than any page has.
 *
 * ## The one dependency fact that is not visible from here
 *
 * `ImageResponse` probes for `sharp` before falling back to its bundled resvg,
 * and this project already has sharp loaded — Payload takes it in
 * `payload.config.ts`. Two *different* sharp versions in one process is a
 * second libvips in the same address space, and on Windows that is
 * `ERR_DLOPEN_FAILED: The specified procedure could not be found`, which took
 * the dev server down with it on the first request to this route rather than
 * returning an error. `next` carries `sharp@^0.35.4` as an optional dependency
 * while this project pins `0.34.2`, so pnpm installed both and the ESM import
 * inside `@vercel/og` resolved to the other one.
 *
 * `pnpm.overrides` in `package.json` pins the tree to the one version this
 * repository has always used, so both resolve to the same native addon and
 * Node loads it once. There is nowhere in a `package.json` to write that down,
 * which is why it is here: **if a share card ever kills the server, check
 * whether something has reintroduced a second `sharp`.**
 *
 * ## What it does when it cannot draw
 *
 * Redirects to the photograph itself, and failing that to the wiki's own
 * share card. Both are exactly what this page served before this route
 * existed, so the worst case of a missing font or an unreadable upload is the
 * previous behaviour rather than a link with no preview at all. A 500 here
 * would be invisible: nobody sees their own unfurl.
 */

/* Reads the Host header and the database: never a static route. */
export const dynamic = 'force-dynamic'

const { width: WIDTH, height: HEIGHT } = CARD_SIZE

/*
  Where the type starts, and where the accent rule stands in front of it.

  From `brand.ts`, so this card and the network's own `public/og.png` cannot
  drift apart. They are meant to read as one family and they were two copies of
  the same three numbers.
*/
const { ruleX: RULE_X, bodyLeft: BODY_LEFT, bodyRight: BODY_RIGHT } = CARD_LAYOUT

/** The glyph's own aspect, so the mark is never squashed beside the name. */
const [, , GLYPH_W, GLYPH_H] = glyphBox().split(' ').map(Number)
const MARK_H = 42
const MARK_W = Math.round((MARK_H * GLYPH_W) / GLYPH_H)

/**
 * A day in a reader's cache, a week in a CDN's, and a month of serving the
 * stale one while a fresh one is drawn.
 *
 * Unfurlers cache far harder than any of these, so the numbers mostly decide
 * how long a re-share after an edit keeps showing the old headline. A week is
 * the compromise: long enough that a popular link costs nothing, short enough
 * that a corrected title reaches the next person who posts it.
 */
const CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'

/**
 * The three faces, read once per process and kept.
 *
 * Lazy and cached rather than a top-level `await readFile`, because a missing
 * file at module scope takes the whole route down for every request including
 * the ones that could have fallen back. A refusal is logged with the command
 * that fixes it, once, and then every card falls back to the page's own
 * picture — which is what it shared before this route existed.
 */
type LoadedFont = { name: string; weight: 400 | 600; style: 'normal'; data: Buffer }
let fontsOnce: Promise<LoadedFont[] | null> | null = null

const cardFonts = () =>
  (fontsOnce ??= Promise.all(
    OG_FONTS.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: 'normal' as const,
      data: await readFile(path.join(process.cwd(), OG_FONT_DIR, font.file)),
    })),
  ).catch((error: unknown) => {
    console.error(
      `[og] no share-card typefaces in ${OG_FONT_DIR}/ (${error instanceof Error ? error.message : error}).\n` +
        '     Run `pnpm make:og-fonts`. Until then every card falls back to the page’s own picture.',
    )
    return null
  }))

/**
 * The picture, cropped to the card and re-encoded.
 *
 * Disk first: `Media` sets no `staticDir`, so Payload writes uploads to
 * `./media` at the repository root, and reading them there costs no request.
 * HTTP second, because that is the only path that still works the day these
 * move behind a storage adapter — `/api/media/file/...` is in `PASS_THROUGH`
 * like this route, so it answers on the same host.
 *
 * Handed to satori as a data URI rather than a URL. Satori will fetch a URL
 * itself, but then the fetch is inside the renderer where a failure is an
 * exception in the middle of a draw rather than a value this function can
 * return null for and fall back from.
 */
const photograph = async (url: string, request: NextRequest): Promise<string | null> => {
  const name = url.split('/').pop()
  const source = await readFile(path.join(process.cwd(), 'media', name ?? ''))
    .catch(async () => {
      const response = await fetch(new URL(url, request.url))
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      return Buffer.from(await response.arrayBuffer())
    })
    .catch((error: unknown) => {
      console.error(`[og] could not read ${url}: ${error instanceof Error ? error.message : error}`)
      return null
    })

  if (!source) return null

  /*
    Cropped here rather than with `objectFit` in the renderer. resvg scales
    whatever it is handed with no resampling worth the name, so a 1920px
    screenshot dropped into a 1200px frame comes out soft — and softness on a
    share card reads as a low-quality site rather than as a scaling artefact.
    `attention` because a 16:9 screenshot losing 40% of its height to a 1.9:1
    card should lose it from wherever the picture is emptiest.
  */
  return sharp(source)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer()
    .then((out) => `data:image/jpeg;base64,${out.toString('base64')}`)
    .catch((error: unknown) => {
      console.error(`[og] sharp refused ${url}: ${error instanceof Error ? error.message : error}`)
      return null
    })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collection: string; slug: string }> },
) {
  const { collection, slug } = await params
  if (!isOgCardCollection(collection)) return new NextResponse(null, { status: 404 })

  /*
    The network's own domain from the environment, never inferred from the
    request — `proxy.ts` says why, and this route resolves a wiki from a Host
    header exactly as it does.
  */
  const root = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').host
  const label = subdomainOf(request.headers.get('host') ?? '', root)
  // A card belongs to a page, and every page this draws for lives on a wiki.
  if (!label) return new NextResponse(null, { status: 404 })

  const wiki = await getGame(label)
  if (!wiki) return new NextResponse(null, { status: 404 })

  const doc = await getBySlug(collection, slug, { game: label, depth: 1 })
  if (!doc) return new NextResponse(null, { status: 404 })

  const media = doc.image && typeof doc.image === 'object' ? (doc.image as Media) : null
  const photoUrl = shownImage(media)

  /** Exactly what this page shared before the card existed. */
  const fallback = () =>
    NextResponse.redirect(
      new URL(photoUrl ?? `/wiki-assets/${label}/og.jpg`, request.url),
      302,
    )

  const fonts = await cardFonts()
  if (!fonts) return fallback()

  const settings = await getSiteSettings()
  const accent = settings.appearanceAccent?.trim() || ACCENT
  const network = settings.siteName?.trim() || ''
  const wikiName = `${wiki.shortTitle || wiki.title} Wiki`

  const ground = cardGround({
    photograph: Boolean(photoUrl),
    credit: media?.credit,
    creditsShown: Boolean(settings.showImageCredits),
  })
  const photo = ground.kind === 'photograph' && photoUrl ? await photograph(photoUrl, request) : null

  /*
    A photograph that would not decode drops the card to the drawn ground
    rather than to a blank frame. `cardGround` has already decided the card is
    *allowed* the picture; this is the separate question of whether there is
    one, and it is answered here so the credit strip below cannot be printed
    over an empty box.
  */
  const showsPhoto = photo !== null

  const titleSize = cardTitleSize(doc.title)
  const brand = {
    fontFamily: 'Barlow Semi Condensed',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.13em',
  }

  const card = new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: PLATE,
          color: LEAF,
          fontFamily: 'Barlow',
        }}
      >
        {showsPhoto ? (
          <img
            src={photo}
            width={WIDTH}
            height={HEIGHT}
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
        ) : (
          /*
            The ruled ground. A leaf of vellum was pricked and ruled before it
            was written on, and it is the backdrop `public/og.png` uses, so a
            card with no photograph is visibly the same object as the
            network's own rather than a second design that shares a colour.
          */
          cardRules(HEIGHT).map((y) => (
            <div
              key={y}
              style={{
                position: 'absolute',
                left: 0,
                top: y,
                width: WIDTH,
                height: 1,
                backgroundColor: '#2a2724',
              }}
            />
          ))
        )}

        {/*
          The scrim, and its strength is set by the type rather than by the
          picture — the lesson the hub hero left. The smallest thing on this
          half of the card is the brand row at 26px, and the type on a
          photograph stays light in either theme because the band *is* a
          photograph, which is the rule `.page-art` states. So the wash is
          heavy where the words are and falls away to nothing on the right,
          which is the part of the picture a reader actually sees.
        */}
        {showsPhoto && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: WIDTH,
              height: HEIGHT,
              backgroundImage:
                'linear-gradient(100deg, rgba(19,18,17,0.95) 0%, rgba(19,18,17,0.92) 44%, rgba(19,18,17,0.55) 72%, rgba(19,18,17,0.30) 100%)',
            }}
          />
        )}

        {/* The ruled margin, in the accent, where the mark itself puts it. */}
        <div
          style={{
            position: 'absolute',
            left: RULE_X,
            top: 56,
            width: 5,
            height: HEIGHT - 112,
            backgroundColor: accent,
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            width: WIDTH - 48,
            height: HEIGHT - 48,
            border: '1px solid #3a3733',
            borderRadius: 6,
          }}
        />

        {/*
          The words. A column that fills whatever the credit strip leaves, so a
          three-line rightsholder line pushes the headline up instead of being
          printed under it — nothing on this card is ever covered by anything
          else on it.
        */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            flexGrow: 1,
            /*
              A shallower foot when the credit strip is there to sit under the
              headline, and a deeper one when it is not — otherwise a drawn
              card's title ends sixteen pixels off the frame and reads as
              having slipped.
            */
            padding: `66px ${BODY_RIGHT}px ${showsPhoto ? 40 : 62}px ${BODY_LEFT}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={glyphDataUri(accent)} width={MARK_W} height={MARK_H} />
            {network ? (
              <span style={{ ...brand, fontSize: 26, marginLeft: 16 }}>{network}</span>
            ) : null}
            <span
              style={{
                ...brand,
                fontSize: 26,
                marginLeft: network ? 16 : 16,
                color: '#7d746b',
              }}
            >
              /
            </span>
            <span style={{ ...brand, fontSize: 26, marginLeft: 16, color: '#b3aaa1' }}>
              {wikiName}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 600,
              lineHeight: 1.06,
              letterSpacing: '-0.022em',
              maxWidth: 800,
            }}
          >
            {doc.title}
          </div>
        </div>

        {/*
          The credit, whole, in a solid strip under the picture rather than an
          overlay on it.

          This is `creditPlacement`'s `below` branch with nowhere else to go: a
          card is 1200×630 and there is no space beneath it, so the strip takes
          the height it needs and the headline moves up. Nothing here clamps,
          fades or scrolls — `4206c56` is what that looks like six months on.
        */}
        {showsPhoto && ground.kind === 'photograph' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: `16px ${BODY_RIGHT}px 18px ${BODY_LEFT}px`,
              backgroundColor: '#0c0b0a',
              borderTop: `1px solid ${accent}`,
            }}
          >
            {/*
              The same mark, in the same place, as `ImageCredit` prints on the
              page — including the fact that a rights credit usually carries a
              `©` in its own text as well. That doubling is the shipped
              behaviour rather than a bug here, and matching it is the point:
              the card and the page credit one picture the same way.
            */}
            {ground.copyright && (
              <span
                style={{
                  fontFamily: 'Barlow Semi Condensed',
                  fontSize: 19,
                  color: '#8d857c',
                  marginRight: 10,
                }}
              >
                ©
              </span>
            )}
            <span
              style={{
                fontFamily: 'Barlow Semi Condensed',
                fontSize: 17,
                lineHeight: 1.3,
                color: '#a49c93',
                maxWidth: WIDTH - BODY_LEFT - BODY_RIGHT - 24,
              }}
            >
              {ground.credit}
            </span>
          </div>
        )}
      </div>
    ),
    { width: WIDTH, height: HEIGHT, fonts },
  )

  return encode(card, showsPhoto)
}

/**
 * `ImageResponse` always answers in PNG, and a PNG of a photograph is enormous.
 *
 * Measured on this card: 842 KB as satori wrote it, 118 KB re-encoded. The one
 * `tools/make-brand.mjs` replaced was 478 KB and its docstring calls that out
 * as a cost paid by "every crawler and every chat client that unfurls a link"
 * — this is the same file being fetched by the same clients, so it gets the
 * same treatment.
 *
 * Which format is decided by what is on the card rather than by preference. A
 * card with a photograph on it is a photograph, and JPEG is what that is for.
 * A drawn card is flat colour, one accent and type, and JPEG would put ringing
 * round every letter for more bytes than a deflated PNG costs — the same split
 * `tools/make-brand.mjs` makes between its palette-quantised icons and its
 * screenshot-backed card.
 *
 * If sharp will not do it, the PNG goes out as it is. A large card is a slow
 * unfurl; no card is a link with no picture at all.
 */
const encode = async (card: ImageResponse, photographic: boolean) => {
  const png = Buffer.from(await card.arrayBuffer())

  const { body, type } = await (photographic
    ? sharp(png).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
    : sharp(png).png({ compressionLevel: 9 }).toBuffer()
  )
    .then((out) => ({ body: out, type: photographic ? 'image/jpeg' : 'image/png' }))
    .catch((error: unknown) => {
      console.error(
        `[og] sharp would not re-encode the card (${error instanceof Error ? error.message : error}); serving satori's PNG.`,
      )
      return { body: png, type: 'image/png' }
    })

  return new NextResponse(new Uint8Array(body), {
    headers: { 'Content-Type': type, 'Cache-Control': CACHE },
  })
}
