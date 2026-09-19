import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { slugify } from '../fields/shared'

/**
 * The contributor roster, and who is credited with what.
 *
 *   pnpm seed:contributors
 *
 * Every one of these seeds with `provisional: true`, and that flag is now an
 * admin-side marker only: it sorts the column, it is what `check:launch`
 * counts, and unticking it is how the owner records that a row has become a
 * real person. It renders nothing on any public page, by the owner's decision.
 *
 * It used to be asserted here that the flag also did three other things, for
 * as long as thirty-six rows carried 394 bylines while nothing rendered it
 * anywhere. A behaviour that lives only in a comment is a behaviour the site
 * does not have; what this one describes is what the code does.
 *
 * The roster lives in `raw/contributors.json` because `tools/make-avatars.mjs`
 * reads it too. It used to carry its own hardcoded copy of the names with a
 * comment asking the next person to keep the two in step by hand, which is the
 * kind of arrangement that survives exactly until somebody adds a name.
 *
 * ## Spreading them across the guides
 *
 * Assignment is by a hash of the guide's slug, not at random. Running this
 * twice gives the same result, so a rebuild does not reshuffle every byline on
 * the site and produce a diff nobody can review — the same reason every other
 * pass here is idempotent on `(game, slug)`.
 */

const ROSTER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'raw',
  'contributors.json',
)

/** Stable, well-spread index for a string. */
const pick = (value: string, count: number): number => {
  let hash = 0
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return hash % count
}

/*
  The bio a reader actually sees on the profile.

  It describes the beat, not the record's status. The roster is scaffolding the
  owner intends to replace and the `provisional` flag says so in the admin,
  where it is useful; a sentence on the public page announcing that the byline
  is not a person is the owner's call and the owner's answer is no. So this
  says what the byline covers and what the guides under it are held to, which
  is what somebody reading a profile came for.
*/
const bioFor = (name: string, role: string): string =>
  `${name} covers ${role.toLowerCase()} across the network. ` +
  `Guides filed under this byline are compiled from published sources, cited on the page, and ` +
  `checked to the same editorial rules as every other record on the site: no fact without a ` +
  `source, and a gap left open rather than filled in.`

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  if (!fs.existsSync(ROSTER)) {
    console.error('No src/seed/raw/contributors.json — nothing to seed.')
    process.exit(1)
  }
  const roster = JSON.parse(fs.readFileSync(ROSTER, 'utf8')) as {
    contributors: { name: string; role: string }[]
  }

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'slug' })
  const gameIds = games.docs.map((game) => game.id)

  let created = 0
  let updated = 0
  const ids: (string | number)[] = []

  for (const [index, person] of roster.contributors.entries()) {
    const slug = slugify(person.name)
    /*
      Two or three wikis each, offset by position so the coverage overlaps
      rather than partitioning the network into private fiefdoms — a
      contributor who appears on one wiki only looks like a different site's
      author to a reader crossing between them.
    */
    const covers = gameIds.length
      ? [0, 1, 2].map((offset) => gameIds[(index + offset * 3) % gameIds.length])
      : []

    const data = {
      name: person.name,
      slug,
      provisional: true,
      role: person.role,
      bio: bioFor(person.name, person.role),
      covers: [...new Set(covers)],
    }

    const existing = await payload.find({
      collection: 'authors',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })

    if (existing.docs[0]) {
      await payload.update({ collection: 'authors', id: existing.docs[0].id, data: data as never })
      ids.push(existing.docs[0].id)
      updated += 1
    } else {
      const made = await payload.create({ collection: 'authors', data: data as never })
      ids.push(made.id)
      created += 1
    }
  }

  // --- spread them across the guides --------------------------------------
  const guides = await payload.find({
    collection: 'guides',
    limit: 10000,
    depth: 0,
    draft: true,
  })

  let assigned = 0
  for (const guide of guides.docs as unknown as { id: string | number; slug: string }[]) {
    const author = ids[pick(String(guide.slug), ids.length)]
    await payload.update({
      collection: 'guides',
      id: guide.id,
      data: { author } as never,
    })
    assigned += 1
  }

  console.log(`\ncontributors: ${created} created, ${updated} updated`)
  console.log(`guides given a byline: ${assigned}`)
  console.log(
    'All flagged provisional for the admin list; nothing about the flag prints on the site. Untick it once somebody real is behind the name.',
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
