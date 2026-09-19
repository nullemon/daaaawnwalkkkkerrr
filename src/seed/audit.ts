import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { auditNetwork, type Finding } from '../lib/audit'
import { auditSource } from '../lib/audit-source'

/**
 * Is this network actually ready to launch?
 *
 *   pnpm check:launch
 *
 * Not `pnpm audit` — that is pnpm's own command, which prints a CVE report for
 * the dependency tree and never runs a line of this file.
 *
 * Checks the things that do not fail loudly. A wiki with no favicon still
 * renders; a record with no meta description still serves; an image with no
 * alt text still displays. None of them errors, no test catches them, and each
 * one is only noticed by somebody who was going to be a reader.
 *
 * Exits non-zero if anything in the BLOCKING list is wrong, so it can gate a
 * deploy. Everything else is reported and left to judgement — a wiki for a
 * game that is not out has empty sections by design, and an audit that calls
 * that a failure is an audit people learn to ignore.
 *
 * ## Where the checks went
 *
 * `src/lib/audit.ts`, because the admin dashboard needs the same answers and
 * was computing two of them itself, in its own words, from its own queries.
 * Two implementations of "does this wiki have a Search Console token" is one
 * implementation too many: the day they disagree, the owner cannot tell which
 * is lying, and the reassuring one wins. This file is now the report — the
 * tiers, the column widths and the exit code — and nothing else.
 *
 * `src/lib/audit-source.ts` holds the two checks that read the repository
 * instead of the database, so the admin never imports `fs`.
 *
 * `auditBlockedGaps` is deliberately **not** printed here. Those gaps are
 * blocked on sources nobody has published — CLAUDE.md's Outstanding section is
 * the list — and a launch checklist that reports work nobody can do is a
 * checklist people stop reading. The admin shows them under their own heading,
 * labelled blocked.
 */

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  /*
    Database findings first, then source findings, which is the order the
    report has always printed in. The tiers below sort the two together, so a
    source finding lands at the end of whichever tier it belongs to rather
    than after everything — which is right: a host that serves no verification
    tag is worth reading next to the wikis that have no token, not three
    sections below them.
  */
  const snapshot = await auditNetwork(payload)
  const findings: Finding[] = [...snapshot.findings, ...auditSource()]

  // --- Report --------------------------------------------------------------
  const order: Finding['level'][] = ['blocking', 'warn', 'note']
  const LABEL = { blocking: 'BLOCKING', warn: 'worth fixing', note: 'for information' }

  console.log('')
  for (const level of order) {
    const rows = findings.filter((finding) => finding.level === level)
    if (rows.length === 0) continue
    console.log(`${LABEL[level]} (${rows.length})`)
    for (const row of rows) console.log(`  ${row.area.padEnd(32)} ${row.detail}`)
    console.log('')
  }

  const blocking = findings.filter((finding) => finding.level === 'blocking').length
  console.log(
    blocking === 0
      ? 'Nothing blocking. Anything above is a judgement call.'
      : `${blocking} blocking issue${blocking === 1 ? '' : 's'}.`,
  )
  process.exit(blocking === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
