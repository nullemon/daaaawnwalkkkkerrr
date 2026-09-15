import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'

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

  if (orphans > 0) {
    console.error('\nRecords with no game are invisible on every page. Fix before deploying.')
    process.exit(1)
  }
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
