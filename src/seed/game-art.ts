import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { slugify } from '../fields/shared'

/**
 * Attaches each new wiki's official art, and every achievement's icon.
 *
 *   pnpm seed:art
 *
 * ## Where the images come from, and what that permits
 *
 * All of it is first-party: the header, capsule, background and screenshots a
 * publisher puts on their own store page, downloaded by
 * `tools/fetch-game-data.mjs` into `assets/_games/<slug>/`.
 *
 * `docs/ASSETS.md` governs where these may go, and the rule that matters here
 * is the one about unidentified screenshots: a screenshot nobody has labelled
 * must not sit on a page that names a specific place or person, because the
 * picture reads as a claim about the subject whatever the alt text says.
 *
 * So the screenshots land on the wiki's home and on section headers —
 * decorative placements, where the subject is the game itself and no claim is
 * made. Achievement icons are the exception that proves the rule: those are
 * labelled by the developer, one icon per named achievement, so they go on the
 * record they belong to.
 *
 * Idempotent. An image already attached is left alone unless --force.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const ART_DIR = path.resolve(dirname, '..', '..', 'assets', '_games')
const RAW_DIR = path.join(dirname, 'raw', 'games')
const FORCE = process.argv.includes('--force')

const CREDIT_FOR = (title: string, publisher: string) =>
  `${title} © ${publisher}. Used for identification and commentary.`

type RawGame = {
  slug: string
  title: string
  publishers: string[]
  storeUrl: string
  fetchedAt: string
  achievements: { title: string; icon: string }[]
}

/**
 * Upload a file once and reuse it.
 *
 * Keyed on the filename we give it, so re-running does not fill the media
 * library with copies of the same screenshot — which is what happened the
 * first time an image pipeline was written for this project.
 */
async function uploadOnce(
  payload: Payload,
  file: string,
  filename: string,
  alt: string,
  credit: string,
): Promise<number | string | null> {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) return existing.docs[0].id

  if (!fs.existsSync(file)) return null

  try {
    const created = await payload.create({
      collection: 'media',
      data: { alt, credit } as never,
      file: {
        data: fs.readFileSync(file),
        mimetype: filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
        name: filename,
        size: fs.statSync(file).size,
      },
    })
    return created.id
  } catch (error) {
    console.error(`    upload failed for ${filename}: ${(error as Error).message}`)
    return null
  }
}

async function run(): Promise<void> {
  if (!fs.existsSync(ART_DIR)) {
    console.log(`No ${ART_DIR}. Run \`node tools/fetch-game-data.mjs --art\` first.`)
    process.exit(0)
  }

  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  let heroes = 0
  let icons = 0

  for (const file of fs.readdirSync(RAW_DIR).filter((name) => name.endsWith('.json'))) {
    const game: RawGame = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8'))
    const dir = path.join(ART_DIR, game.slug)
    if (!fs.existsSync(dir)) continue

    const publisher = game.publishers[0] ?? 'its publisher'
    const credit = CREDIT_FOR(game.title, publisher)

    const found = await payload.find({
      collection: 'games',
      where: { slug: { equals: game.slug } },
      limit: 1,
      depth: 0,
    })
    if (found.docs.length === 0) continue
    const record = found.docs[0] as { id: number | string; theme?: { hero?: unknown; logo?: unknown } }

    console.log(game.title)

    // --- The wiki's hero and logo ------------------------------------------
    const heroFile = fs.existsSync(path.join(dir, 'background.jpg'))
      ? 'background.jpg'
      : 'header.jpg'

    const heroId = await uploadOnce(
      payload,
      path.join(dir, heroFile),
      `${game.slug}-hero.jpg`,
      // Names the game, claims nothing about what is in the picture.
      `Key art for ${game.title}`,
      credit,
    )

    const logoId = await uploadOnce(
      payload,
      path.join(dir, 'capsule.jpg'),
      `${game.slug}-capsule.jpg`,
      `${game.title} capsule art`,
      credit,
    )

    if ((heroId && (FORCE || !record.theme?.hero)) || (logoId && (FORCE || !record.theme?.logo))) {
      await payload.update({
        collection: 'games',
        id: record.id,
        data: {
          theme: {
            ...(record.theme ?? {}),
            ...(heroId ? { hero: heroId } : {}),
            ...(logoId ? { logo: logoId } : {}),
          },
        } as never,
        depth: 0,
      })
      heroes += 1
      console.log(`  hero and capsule attached`)
    }

    // --- Achievement icons -------------------------------------------------
    if (game.achievements.length === 0) {
      console.log('  no achievements yet')
      continue
    }

    /*
      Icons are fetched here rather than by the art downloader, because there
      are a hundred and forty of them across three games and they are only
      worth having once the achievements they belong to exist as records.
    */
    let attached = 0
    for (const entry of game.achievements) {
      const slug = slugify(entry.title)
      if (!slug) continue

      const match = await payload.find({
        collection: 'achievements',
        where: { and: [{ slug: { equals: slug } }, { game: { equals: record.id } }] },
        limit: 1,
        depth: 0,
      })
      if (match.docs.length === 0) continue
      const achievement = match.docs[0] as { id: number | string; icon?: unknown }
      if (achievement.icon && !FORCE) continue

      const filename = `${game.slug}-achievement-${slug}.jpg`
      const cached = path.join(dir, 'achievements', `${slug}.jpg`)

      if (!fs.existsSync(cached)) {
        fs.mkdirSync(path.dirname(cached), { recursive: true })
        const response = await fetch(entry.icon)
        if (!response.ok) continue
        fs.writeFileSync(cached, Buffer.from(await response.arrayBuffer()))
        await new Promise((resolve) => setTimeout(resolve, 80))
      }

      const iconId = await uploadOnce(
        payload,
        cached,
        filename,
        `${entry.title} achievement icon`,
        credit,
      )
      if (!iconId) continue

      await payload.update({
        collection: 'achievements',
        id: achievement.id,
        data: { icon: iconId } as never,
        depth: 0,
      })
      attached += 1
    }

    icons += attached
    console.log(`  ${attached} achievement icons`)
  }

  console.log(`\n${heroes} wikis given art, ${icons} achievement icons attached`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
