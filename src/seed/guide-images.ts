import 'dotenv/config'
import { mediaCredit } from '../lib/credit'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'

/**
 * Give every guide a picture.
 *
 *   pnpm seed:guide-images
 *
 * The four guide passes attach a screenshot as they write, but the oldest of
 * them predates that and the compilation pages never had one: `all-regions`,
 * `what-is-documented`, `characters-known` and their siblings came out as a
 * heading and a list on a white page. Fifty-two of them, which is enough that
 * a reader clicking through a wiki hits one often.
 *
 * ## Where the picture comes from
 *
 * That game's own store screenshots, and nothing else. This is the same rule
 * the section art follows and for the same reason: a Capcom screenshot on a
 * Bandai Namco page is a misattribution rather than a decorative liberty, and
 * a reader could reasonably take it for a claim about the game they are
 * reading about. Dawnwalker draws from its own press library instead, because
 * it has no store page in `assets/_games`.
 *
 * The choice is a hash of the slug, so it is stable between runs — a page that
 * changes its illustration every time the seed runs looks broken — and spread,
 * so a section index and the page below it are not the same frame twice.
 *
 * Nothing here is attached to a *record*. An image above the words "Laslea
 * Glen" reads as a claim that it is Laslea Glen; a guide is about a topic
 * rather than a thing, which is why it can carry one.
 */

const GAME_ART = path.resolve('assets/_games')
const LIBRARY = path.resolve('assets/_library/screenshots')

/** Stable, well-spread index for a slug. */
const pick = (name: string, count: number) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % count
}

const shotsFor = (slug: string): string[] => {
  const dir = path.join(GAME_ART, slug)
  if (fs.existsSync(dir)) {
    const shots = fs
      .readdirSync(dir)
      .filter((name) => /^screenshot-\d+\.(jpg|jpeg|png)$/i.test(name))
      .sort()
      .map((name) => path.join(dir, name))
    if (shots.length > 0) return shots
  }

  // Dawnwalker: no store listing here, but its own press library is in the repo.
  if (fs.existsSync(LIBRARY)) {
    return fs
      .readdirSync(LIBRARY)
      .filter((name) => /\.(jpg|jpeg|png)$/i.test(name))
      .sort()
      .map((name) => path.join(LIBRARY, name))
  }
  return []
}

const attach = async (
  payload: Payload,
  file: string,
  filename: string,
  alt: string,
  credit: string,
): Promise<number | string | null> => {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) return existing.docs[0].id

  try {
    const created = await payload.create({
      collection: 'media',
      data: { alt, credit } as never,
      file: {
        data: fs.readFileSync(file),
        mimetype: file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
        name: filename,
        size: fs.statSync(file).size,
      },
    })
    return created.id
  } catch {
    return null
  }
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const guides = await payload.find({
    collection: 'guides',
    limit: 1000,
    depth: 1,
    pagination: false,
  })

  const missing = guides.docs.filter((guide) => !(guide as { image?: unknown }).image)
  if (missing.length === 0) {
    console.log('Every guide has an image.')
    process.exit(0)
  }

  console.log(`${missing.length} guides with no image\n`)

  const shotCache = new Map<string, string[]>()
  const perGame = new Map<string, number>()
  let done = 0

  for (const guide of missing) {
    const game = (guide as { game?: { slug?: string; title?: string; publisher?: string } }).game
    const slug = game?.slug
    if (!slug) continue

    if (!shotCache.has(slug)) shotCache.set(slug, shotsFor(slug))
    const shots = shotCache.get(slug) as string[]
    if (shots.length === 0) {
      console.log(`  ${slug}: no art available, skipped`)
      continue
    }

    const source = shots[pick(String(guide.slug), shots.length)]
    const filename = `${slug}-guide-${guide.slug}${path.extname(source)}`.slice(0, 90)

    const image = await attach(
      payload,
      source,
      filename,
      `${game?.title ?? slug} — ${guide.title}`,
      // Name them. The record has the publisher, and "copyright its
      // publisher" is a credit that credits nobody.
      mediaCredit(game?.title ?? slug, game?.publisher),
    )
    if (!image) continue

    await payload.update({
      collection: 'guides',
      id: guide.id,
      data: { image, _status: 'published' } as never,
      depth: 0,
    })
    perGame.set(slug, (perGame.get(slug) ?? 0) + 1)
    done += 1
  }

  for (const [slug, count] of [...perGame.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug.padEnd(34)} ${String(count).padStart(3)} illustrated`)
  }
  console.log(`\n${done} guides given a picture`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
