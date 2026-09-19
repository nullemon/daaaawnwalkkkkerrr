import 'dotenv/config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'

/**
 * Bring every record's confidence back in line with what it can prove.
 *
 *   pnpm seed:confidence
 *
 * ## The rule, and how 653 records came to break it
 *
 * `confidenceField` offers three values and states what each means:
 *
 *   High   — agreed by multiple independent sources
 *   Medium — single good source, or minor disagreement
 *   Low    — contested, inferred, or placeholder
 *
 * and `sourcesField` says it in the other direction: "Two independent sources
 * before marking confidence high."
 *
 * The generators do not know that. A pass that writes a record from one wiki
 * infobox has exactly one citation and no way to judge agreement, and several
 * of them set `high` because the *fact* looked unambiguous — a release date, a
 * weapon's damage figure. That is a reasonable thing for a person to think and
 * the wrong thing for a field to say: `high` on this site does not mean "we
 * are sure", it means "two sources agreed", and 653 records were claiming the
 * second while only ever having done the first.
 *
 * Nothing rendered differently, because the badge is editorial and shown only
 * to signed-in editors. That is exactly why it went unnoticed and exactly why
 * it matters: the field is a **work queue**. A record wrongly marked `high`
 * is one nobody will ever be sent back to, and the whole argument of this
 * network is that its figures can be checked.
 *
 * ## Why this demotes rather than researches
 *
 * The honest repair for a single-sourced `high` is a second source, and
 * nothing here can go and find one. So it writes down what is true today:
 * one source is `medium` by the field's own definition. The record keeps its
 * citation, its prose and its picture; only the claim about corroboration
 * changes.
 *
 * ## What it will not touch
 *
 * - A record already at `medium` or `low`. It only ever moves `high` down.
 * - A record with two or more sources, whatever they are. Judging whether two
 *   citations are genuinely *independent* needs a person, and a pass that
 *   guessed would demote correct records — the Antar 4 rule, where an
 *   over-broad filter throws away good rows as silently as a loose one lets
 *   bad ones in.
 *
 * Idempotent: a second run finds nothing, which is what makes it safe in
 * `db:reset`.
 */

/** A row carrying the two fields this pass reads. */
type Record_ = {
  id: string | number
  title?: string | null
  name?: string | null
  confidence?: string | null
  sources?: unknown[] | null
}

export const demoteUnsupportedConfidence = async (
  payload: Payload,
): Promise<{ moved: number; perCollection: Map<string, number> }> => {
  const perCollection = new Map<string, number>()
  let moved = 0

  for (const collection of GAME_SCOPED) {
    const rows = await payload.find({
      collection: collection as Parameters<typeof payload.find>[0]['collection'],
      depth: 0,
      limit: 0,
      pagination: false,
    })

    for (const row of rows.docs as unknown as Record_[]) {
      if (row.confidence !== 'high') continue
      const sources = Array.isArray(row.sources) ? row.sources : []
      if (sources.length >= 2) continue

      await payload.update({
        collection: collection as Parameters<typeof payload.update>[0]['collection'],
        id: row.id,
        data: { confidence: 'medium' } as never,
        depth: 0,
      })
      perCollection.set(collection, (perCollection.get(collection) ?? 0) + 1)
      moved += 1
    }
  }

  return { moved, perCollection }
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const { moved, perCollection } = await demoteUnsupportedConfidence(payload)

  if (moved === 0) {
    console.log('Every record marked high confidence cites at least two sources.')
    process.exit(0)
  }

  for (const [collection, count] of [...perCollection].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${collection.padEnd(20)} ${String(count).padStart(4)} moved high -> medium`)
  }
  console.log(`\n${moved} records demoted: they were claiming corroboration they do not cite.`)
  console.log('The fix for any one of them is a second source, not this pass.')
  process.exit(0)
}

/* Only when run directly — importing this must not start a seed. */
if (process.argv[1] && process.argv[1].includes('confidence-basis')) {
  run().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
