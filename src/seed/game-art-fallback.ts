import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { getPayload } from 'payload'

import config from '../payload.config'
import { mediaCredit } from '../lib/credit'
import { attachImage } from './game-art-pool'

/**
 * Key art for a wiki whose game has no store page.
 *
 *   pnpm seed:art-fallback
 *
 * `pnpm seed:art` takes the hero and the capsule from `assets/_games/<slug>/`,
 * which is a Steam listing's own art. Two games here have no Steam listing at
 * all — GTA 6 has no PC version and Fire Emblem is a Switch exclusive — so
 * their wiki homes opened on a flat background and the hub rail fell back to a
 * generic icon, which `pnpm check:launch` reports in those words.
 *
 * ## Where it looks instead, and why that is safe
 *
 * `assets/_wiki/<slug>/`, which holds only what was fetched from the wiki
 * configured for that slug. The directory is the safety: there is no path by
 * which one game's folder holds another game's art, which is the same
 * structural argument `src/seed/game-art-pool.ts` makes at length and for the
 * same reason — the fallback that did not have it put one studio's press kit
 * on two other studios' wikis under a third party's copyright line.
 *
 * ## Widest wins, and there is a floor
 *
 * A hero is a band across the top of a page, so it wants landscape. These
 * folders are mostly character portraits, and a 3:4 portrait stretched across
 * a 1340px band is worse than the flat background it replaced. So every
 * candidate is measured with `sharp` and only genuine landscape is
 * considered; a game whose folder holds nothing wide enough keeps its flat
 * background, which is the honest outcome.
 *
 * ## The capsule is the cover
 *
 * `theme.logo` is the capsule — the portrait tile in the hub rail — and box
 * art is exactly that shape and exactly that job. `profile.poster` already
 * holds a licensed cover for fourteen of the fifteen games, so the capsule
 * reuses it rather than inventing a second crop of something else.
 *
 * Idempotent, and it never overwrites: a game that already has hero or capsule
 * art is left alone, so this can sit in `db:reset` after `seed:art` and only
 * ever fills what that pass could not.
 */

const WIKI_ART = path.resolve('assets/_wiki')

/** Landscape enough to be a band rather than a stretched portrait. */
const MIN_RATIO = 1.5
const MIN_WIDTH = 900

const widestIn = async (dir: string): Promise<{ file: string; width: number } | null> => {
  if (!fs.existsSync(dir)) return null

  let best: { file: string; width: number } | null = null
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(jpe?g|png|webp)$/i.test(name)) continue
    const file = path.join(dir, name)
    try {
      const { width, height } = await sharp(file).metadata()
      if (!width || !height) continue
      if (width < MIN_WIDTH) continue
      if (width / height < MIN_RATIO) continue
      if (!best || width > best.width) best = { file, width }
    } catch {
      /* Not an image this build of sharp can read. Not a reason to stop. */
    }
  }
  return best
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'games',
    depth: 1,
    limit: 0,
    pagination: false,
  })

  let heroes = 0
  let capsules = 0
  const skipped: string[] = []

  for (const game of docs as unknown as Record<string, unknown>[]) {
    const slug = String(game.slug)
    const theme = (game.theme ?? {}) as Record<string, unknown>
    const profile = (game.profile ?? {}) as Record<string, unknown>
    const title = String(game.title ?? slug)
    const publisher = typeof game.publisher === 'string' ? game.publisher : undefined

    const wantsHero = !theme.hero
    const wantsCapsule = !theme.logo
    if (!wantsHero && !wantsCapsule) continue

    const next: Record<string, unknown> = { ...theme }
    let changed = false

    if (wantsHero) {
      const widest = await widestIn(path.join(WIKI_ART, slug))
      if (widest) {
        const id = await attachImage(
          payload,
          widest.file,
          `${slug}-hero${path.extname(widest.file)}`.slice(0, 90),
          /* Names the game, claims nothing about what is in the picture. */
          `Key art for ${title}`,
          mediaCredit(title, publisher),
        )
        if (id) {
          next.hero = id
          changed = true
          heroes += 1
          console.log(`  ${slug.padEnd(32)} hero from ${path.basename(widest.file)} (${widest.width}px wide)`)
        }
      } else {
        skipped.push(`${slug}: nothing landscape enough in assets/_wiki/${slug}/`)
      }
    }

    if (wantsCapsule && profile.poster) {
      /*
        The cover, reused. A capsule is a portrait tile and box art is a
        portrait tile; making a second one would mean cropping something that
        was never composed for it.
      */
      next.logo =
        typeof profile.poster === 'object'
          ? (profile.poster as { id: number | string }).id
          : profile.poster
      changed = true
      capsules += 1
      console.log(`  ${slug.padEnd(32)} capsule from its cover art`)
    }

    if (!changed) continue
    await payload.update({
      collection: 'games',
      id: game.id as string | number,
      data: { theme: next } as never,
      depth: 0,
    })
  }

  console.log(`\n${heroes} hero, ${capsules} capsule`)
  for (const line of skipped) console.log(`  ${line}`)
  if (skipped.length > 0) {
    console.log('  A flat background is the honest outcome for those — better than a stretched portrait.')
  }
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
