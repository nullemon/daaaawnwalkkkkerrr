import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'
import { encodingFaults, repairText } from '../lib/text-encoding'

/**
 * Repair stored text that a harvester never finished decoding.
 *
 *   pnpm seed:normalise
 *
 * ## Why this exists rather than a one-time cleanup
 *
 * Two of the five harvesters decode HTML entities and three do not, and
 * nothing about the difference is visible in their output: a `&ndash;` in an
 * infobox value is a perfectly ordinary string, it imports cleanly, it passes
 * `pnpm verify`, it renders, and what a reader sees in the middle of a
 * sentence is the eight literal characters `&ndash;` — because React escapes
 * what it renders, which is the same protection that makes the fault
 * invisible. One `&ndash;` in one Star Wars entity reached four different
 * collections through the seeders that fan a harvest out.
 *
 * So the harvest will do it again, and a cleanup done by hand today is a
 * cleanup somebody has to notice is needed again in six months.
 * `src/lib/text-encoding.ts` holds the rules, a unit test pins them,
 * `src/lib/text-encoding.test.ts` fails on a raw harvest that carries any of
 * them, `pnpm verify` fails on a database that does, and this is the pass that
 * makes the database pass again. It is in `pnpm db:reset` for the reason
 * `seed:prune-entities` and `seed:publish` are: a pass that only ever runs by
 * hand is a pass that is missing the next time somebody rebuilds.
 *
 * ## What it will not do
 *
 * It never repairs a replacement character. `U+FFFD` means the byte is gone,
 * and putting a letter in its place would be this site deciding how somebody's
 * name is spelled — the invented fact the whole project exists to avoid. Those
 * are printed for a person to look up in the source, and `pnpm verify` keeps
 * failing until one does.
 */

/** Every collection whose rows carry reader-visible prose. */
const COLLECTIONS = [
  ...GAME_SCOPED,
  'companies',
  'people',
  'authors',
  'media',
  'games',
] as const

/**
 * Keys never touched, because they are identity rather than prose.
 *
 * A slug is what a URL and a relationship are matched on, so a slug that
 * changed under a repair would move a page and break every link into it. None
 * of them has ever carried a fault — `slugify` builds them from a character
 * class — but "has never happened" is not a reason to let a repair pass have
 * the option.
 */
const NEVER = new Set(['id', 'slug', '_status', 'createdAt', 'updatedAt', 'filename', 'url'])

type Json = unknown

/** Repair every string under a value, and say whether anything moved. */
const repairTree = (node: Json, path: string, changes: string[]): Json => {
  if (typeof node === 'string') {
    if (encodingFaults(node).length === 0) return node
    const fixed = repairText(node)
    if (fixed === node) return node
    changes.push(`${path}: ${JSON.stringify(node.slice(0, 90))} -> ${JSON.stringify(fixed.slice(0, 90))}`)
    return fixed
  }
  if (Array.isArray(node)) return node.map((value, index) => repairTree(value, `${path}[${index}]`, changes))
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, Json>).map(([key, value]) =>
        NEVER.has(key) ? [key, value] : [key, repairTree(value, path ? `${path}.${key}` : key, changes)],
      ),
    )
  }
  return node
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  let repaired = 0
  let unrepairable = 0
  const lost: string[] = []

  for (const collection of COLLECTIONS) {
    /*
      `depth: 0`, so a relationship comes back as an id and cannot be walked
      into. A repair that reached through a relationship would rewrite the
      related record's fields onto this one — the row would look right and the
      relationship would be gone.
    */
    const all = await payload.find({
      collection: collection as 'quests',
      limit: 5000,
      depth: 0,
      pagination: false,
    })

    for (const doc of all.docs as unknown as Record<string, Json>[]) {
      const changes: string[] = []
      const patch: Record<string, Json> = {}

      for (const [key, value] of Object.entries(doc)) {
        if (NEVER.has(key)) continue
        const before = changes.length
        const fixed = repairTree(value, key, changes)
        if (changes.length > before) patch[key] = fixed
        /*
          A fault nothing can repair is reported rather than written. The byte
          behind a replacement character is gone; only somebody with the source
          open can say what it was.
        */
        if (typeof value === 'string' && encodingFaults(value).some((f) => f.rule === 'replacement')) {
          lost.push(`${collection} #${String(doc.id)} ${key}: ${JSON.stringify(value.slice(0, 90))}`)
          unrepairable++
        }
      }

      if (Object.keys(patch).length === 0) continue

      await payload.update({
        collection: collection as 'quests',
        id: doc.id as number,
        data: patch as never,
        depth: 0,
        // `guides` is versioned, and an update without this writes a new draft
        // and leaves the published row exactly as wrong as it was.
        draft: false,
      })
      repaired++
      console.log(`${collection} #${String(doc.id)}`)
      for (const change of changes) console.log(`    ${change}`)
    }
  }

  console.log(`\n${repaired} records repaired`)
  if (lost.length > 0) {
    console.log(`\n${unrepairable} values carry a lost byte and were left alone:`)
    for (const line of lost) console.log(`  ${line}`)
    console.log('\nLook each one up in its source. Guessing the character is inventing a fact.')
  }
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
