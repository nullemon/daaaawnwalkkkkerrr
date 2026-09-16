import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import seedGameCopy from './copy/games'
import seedGamePageCopy from './copy/game-pages'
import seedHubCopy from './copy/hub'
import seedLegalCopy from './copy/legal'
import seedCompaniesCopy from './copy/companies'
import seedUiCopy from './copy/ui'

/**
 * Put the wording that shipped into the fields that can change it.
 *
 *   pnpm seed:copy
 *
 * Every copy field added in this pass is optional and falls back to the
 * sentence in the code, which is what makes the change safe to deploy. It also
 * means an editor opening the admin finds forty empty boxes and no idea what
 * any of them currently say — a control that is present, reachable and
 * useless, which is the same failure as the noindex checkbox that read as
 * ticked and did nothing.
 *
 * So this writes the current wording in. After it runs, the admin shows the
 * live sentence in an editable box, and changing one is changing the page.
 *
 * **It does not overwrite.** A field an editor has already filled in is left
 * exactly as it is, on every run. That is what lets this sit in `db:reset`
 * next to the other passes without quietly reverting somebody's work the next
 * time the database is rebuilt — and `db:reset` is the one command in this
 * project that people run without thinking hard about it.
 */

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const passes: [string, (p: typeof payload) => Promise<number>][] = [
    ['wiki sections', seedGameCopy],
    ['wiki pages', seedGamePageCopy],
    ['hub', seedHubCopy],
    ['legal pages', seedLegalCopy],
    ['companies site', seedCompaniesCopy],
    ['interface text', seedUiCopy],
  ]

  let total = 0
  for (const [name, pass] of passes) {
    const written = await pass(payload)
    total += written
    console.log(`  ${name.padEnd(16)} ${written} field${written === 1 ? '' : 's'} filled`)
  }

  console.log(`\n${total} fields now hold the wording they were showing anyway.`)
  console.log('Nothing that was already filled in was touched.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
