import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { slugify } from '../fields/shared'

/**
 * The placeholder contributor roster, and who is credited with what.
 *
 *   pnpm seed:contributors
 *
 * Every one of these seeds with `provisional: true`. That flag puts a
 * placeholder notice on the contributor's own profile page and does nothing
 * else — it does not hide the profile from search (`noindex` is that switch),
 * does not change the Article structured data, and does not swap the byline
 * for the editorial team. This comment asserted all three for as long as
 * thirty-six placeholders carried 394 bylines with no page anywhere saying so;
 * a behaviour that lives only in a comment is a behaviour the site does not
 * have.
 *
 * So the profile is where the roster admits to being scaffolding. Replace the
 * details in the admin and untick the flag one at a time; that switch is what
 * publishes somebody as a real author.
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
  The bio a reader actually sees on the profile, so it has to describe what the
  site does rather than what a comment once said it did. The previous wording
  ended "until then the page credits the editorial team", which was printed on
  36 live profiles and was not true of a single guide: the bylines print the
  name. A placeholder saying the wrong thing about itself is worse than a
  placeholder, because it reads as a deliberate disclosure.
*/
const bioFor = (name: string, role: string): string =>
  `${name} is a placeholder contributor covering ${role.toLowerCase()}. ` +
  `The name, this biography and the role above are scaffolding for a real contributor who has ` +
  `not been added yet, and nothing here is a claim about a person. Guides filed under the byline ` +
  `are compiled and checked to the same editorial rules as every other page on the network.`

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
    'All provisional — each profile page says so; the bylines print the name. Untick the flag once somebody real is behind it.',
  )
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
