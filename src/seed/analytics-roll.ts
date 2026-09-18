import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { runMaintenance } from '../lib/analytics/maintain'
import { RAW_RETENTION_DAYS } from '../lib/analytics/shape'

/**
 * Summarise the days that need it, then delete what is past retention.
 *
 *   pnpm analytics:roll
 *
 * This is the pass that belongs in a scheduler — once a day, any time, and it
 * does not matter if a run is missed because the next one catches up. It is
 * idempotent: a day is deleted and rewritten rather than added to, so running
 * it twice produces the same rollups and running it after a gap fills the gap.
 *
 * `/api/hit` runs the same function after a response, at most once an hour per
 * process, so a deployment with no scheduler still keeps its history. That is a
 * floor rather than the plan: a site with no traffic never rolls, which is
 * harmless, and a site behind two instances rolls twice, which is also
 * harmless for the reason above.
 *
 * **Not in `pnpm db:reset`.** Everything in that chain rebuilds content from
 * `src/seed/`, and analytics is not content — it is a record of what readers
 * did, it is not reproducible from the repository, and `db:reset` deletes the
 * database that holds it. Putting this in the chain would imply a rebuild
 * restores traffic history, which it cannot.
 */
async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const report = await runMaintenance(payload)

  if (report.daysRolled.length === 0) {
    console.log('\nNo page views recorded yet — nothing to roll.\n')
    process.exit(0)
  }

  const first = report.daysRolled[0]
  const last = report.daysRolled[report.daysRolled.length - 1]

  console.log(`\nRolled ${report.daysRolled.length} day(s), ${first} to ${last}.`)
  console.log(`  ${report.rollupRows} rollup rows written`)
  console.log(
    `  ${report.rawDeleted} raw page view(s) deleted, older than ${RAW_RETENTION_DAYS} days`,
  )
  console.log(`  ${report.ms}ms\n`)

  /*
    The newest day is always re-rolled, because it was almost certainly rolled
    while it was still in progress. Said here rather than left to be inferred
    from the day count, which otherwise looks like the pass redoing work.
  */
  console.log(`Today (${last}) is rolled again on every run, because it is still happening.\n`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
