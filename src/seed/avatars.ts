import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * Attaches each contributor's monogram, and files them against the wikis they
 * cover.
 *
 * The monograms come from `tools/make-avatars.mjs` — initials on a coloured
 * ground, not a stock portrait. See that file for why a photograph of somebody
 * who is not the author is worse than no photograph.
 *
 * Idempotent: an author who already has an avatar is left alone.
 */

const AVATARS = path.resolve('assets/_library/avatars')

/**
 * Who covers what.
 *
 * Only a default. The relationship is editable in the admin, and the point of
 * seeding it is that a profile showing "writes for four wikis" is evidence in
 * a way an empty one is not.
 */
const COVERS: Record<string, string[]> = {
  'corvin-ashe': ['dawnwalker'],
  'mirela-dunca': ['dawnwalker'],
  'tobias-renn': ['dawnwalker'],
  'ines-valcourt': [
    'onimusha-way-of-the-sword',
    'star-wars-zero-company',
    'resonance-a-plague-tale-legacy',
  ],
  'kwame-adjei': [
    'onimusha-way-of-the-sword',
    'phantom-blade-zero',
    'control-resonant',
    'gears-of-war-e-day',
    'star-wars-zero-company',
    'resonance-a-plague-tale-legacy',
  ],
  'rosa-lindqvist': ['phantom-blade-zero', 'control-resonant', 'gears-of-war-e-day'],
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0 })
  const idFor = new Map(games.docs.map((game) => [game.slug, game.id]))

  const authors = await payload.find({ collection: 'authors', limit: 100, depth: 0 })
  let attached = 0
  let filed = 0

  for (const author of authors.docs) {
    const slug = author.slug as string
    const file = path.join(AVATARS, `${slug}.svg`)

    const update: Record<string, unknown> = {}

    if (!author.avatar && fs.existsSync(file)) {
      const filename = `avatar-${slug}.svg`
      const existing = await payload.find({
        collection: 'media',
        where: { filename: { equals: filename } },
        limit: 1,
        depth: 0,
      })

      const media =
        existing.docs[0] ??
        (await payload.create({
          collection: 'media',
          data: {
            alt: `Monogram for ${author.name}`,
            credit: 'Generated placeholder — replace with a photograph.',
          } as never,
          file: {
            data: fs.readFileSync(file),
            mimetype: 'image/svg+xml',
            name: filename,
            size: fs.statSync(file).size,
          },
        }))

      update.avatar = media.id
      attached += 1
    }

    const covers = (COVERS[slug] ?? [])
      .map((gameSlug) => idFor.get(gameSlug))
      .filter((id): id is number => id !== undefined)

    if (covers.length > 0 && !(author.covers as unknown[] | undefined)?.length) {
      update.covers = covers
      filed += 1
    }

    if (Object.keys(update).length > 0) {
      await payload.update({ collection: 'authors', id: author.id, data: update as never, depth: 0 })
    }
  }

  console.log(`${attached} monograms attached, ${filed} contributors filed against wikis`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
