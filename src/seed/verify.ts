import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'
import { encodingFaults } from '../lib/text-encoding'

/**
 * The collections whose rows carry prose a reader will actually read.
 *
 * The same list `pnpm seed:normalise` repairs, so the check and the fix cannot
 * disagree about what they cover — two implementations of one finding is how
 * the admin dashboard and the launch checklist came to be able to contradict
 * each other.
 */
const TEXT_BEARING = [...GAME_SCOPED, 'companies', 'people', 'authors', 'media', 'games'] as const

/**
 * Does every content record belong to a game?
 *
 * A record with no game does not error anywhere. It simply never appears on
 * any page, because every public query filters on the game — so the symptom is
 * a missing page, weeks later, with nothing in any log. That is the failure
 * this whole design is most exposed to, which earns it a check that can be run
 * after any import.
 *
 *   pnpm verify
 */
async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 100, depth: 0, sort: 'slug' })
  console.log(`\ngames: ${games.totalDocs}`)
  for (const game of games.docs) {
    console.log(`  ${String(game.slug).padEnd(32)} ${game.status}`)
  }
  console.log('')

  let total = 0
  let orphans = 0

  for (const collection of GAME_SCOPED) {
    const all = await payload.count({ collection })
    const loose = await payload.count({ collection, where: { game: { exists: false } } })
    total += all.totalDocs
    orphans += loose.totalDocs
    const flag = loose.totalDocs > 0 ? `${loose.totalDocs} WITH NO GAME` : 'all scoped'
    console.log(`  ${collection.padEnd(18)} ${String(all.totalDocs).padStart(4)}  ${flag}`)
  }

  console.log(`\n${total} records, ${orphans} with no game`)

  /*
    The second way a complete record stays invisible.

    `guides` is the one collection with drafts enabled, and Payload defaults
    a document it creates to `_status: 'draft'`. A draft is a full, correct
    row that no public page will serve, so it looks present to every count
    taken against the database and 404s to a reader. 335 guides shipped that
    way, and the only reason it was caught was somebody opening a URL.

    It belongs next to the orphan check because it is the same failure: a row
    that exists, satisfies every query you thought to run, and is not on the
    site.
  */
  const drafts = await payload.count({
    collection: 'guides',
    where: { _status: { not_equals: 'published' } },
  })

  if (drafts.totalDocs > 0) {
    console.log(`  guides unpublished ${String(drafts.totalDocs).padStart(4)}  WILL 404`)
  }

  /*
    The third way a record is wrong while every count agrees it is fine.

    Nearly every string here was read off somebody else's HTML, and each of
    those has its own idea of how a character reaches a scraper. An entity that
    was never decoded reaches a reader as the eight literal characters
    `&ndash;`, because React escapes what it renders — the same protection that
    makes the fault invisible to everything else. `Ã©` is UTF-8 read as cp1252.
    A zero-width joiner is invisible on the page and fatal to any match.

    None of it errors, none of it is a type error, `pnpm build` is green and
    the page renders. It belongs beside the two checks above because it is the
    same shape of failure: a row that satisfies every query you thought to run
    and is not what the source said.

    `src/lib/text-encoding.ts` holds the rules and
    `src/lib/text-encoding.test.ts` applies them to the raw harvest, which is
    the cheaper end — this is the end that catches what is already stored.
  */
  const faulty: string[] = []
  let lostBytes = 0

  const scan = (node: unknown, where: string) => {
    if (typeof node === 'string') {
      for (const fault of encodingFaults(node)) {
        faulty.push(`  ${where.padEnd(44)} ${fault.rule.padEnd(12)} ${fault.excerpt}`)
        if (fault.rule === 'replacement') lostBytes += 1
      }
      return
    }
    if (Array.isArray(node)) return node.forEach((value, index) => scan(value, `${where}[${index}]`))
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue
        scan(value, `${where}.${key}`)
      }
    }
  }

  for (const collection of TEXT_BEARING) {
    const all = await payload.find({
      collection: collection as 'quests',
      limit: 5000,
      depth: 0,
      pagination: false,
    })
    for (const doc of all.docs as unknown as Record<string, unknown>[]) {
      scan(doc, `${collection} #${String(doc.id)}`)
    }
  }

  if (faulty.length > 0) {
    console.log(`\n${faulty.length} stored values are not what the source said:`)
    for (const line of faulty.slice(0, 40)) console.log(line)
    if (faulty.length > 40) console.log(`  … and ${faulty.length - 40} more`)
  }

  if (orphans > 0 || drafts.totalDocs > 0 || faulty.length > 0) {
    if (orphans > 0) {
      console.error(
        '\nRecords with no game are invisible on every page. Fix before deploying.',
      )
    }
    if (drafts.totalDocs > 0) {
      console.error(
        `\n${drafts.totalDocs} guides are drafts, so every one of them 404s. Run: pnpm seed:publish`,
      )
    }
    if (faulty.length > 0) {
      console.error(
        `\n${faulty.length} values carry a decoding fault. Run: pnpm seed:normalise`,
      )
      if (lostBytes > 0) {
        console.error(
          `${lostBytes} of them hold a replacement character, which no pass can repair — the byte is gone, so look it up in the source rather than guessing the letter.`,
        )
      }
    }
    process.exit(1)
  }
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
