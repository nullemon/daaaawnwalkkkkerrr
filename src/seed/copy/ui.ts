import type { Payload } from 'payload'
import type { UiString } from '../../payload-types'
import { LABEL_DEFAULTS, UI_DEFAULTS } from '../../lib/ui-registry'

/**
 * Write the registry into the override table, so an editor opening Interface
 * text scrolls a list of real sentences.
 *
 * The table is empty on a fresh database, and every key in it falls back to the
 * code. That is safe and it is useless: what an editor sees is a blank array
 * with an "Add override" button, no way to discover that `run.floor-title`
 * exists, and no way to find out what it currently says without reading the
 * source. Same failure as the noindex checkbox that read as ticked and did
 * nothing — a control that is present, reachable and no help.
 *
 * So every key is written in with the wording it is already showing. After this
 * runs, changing a row changes the page.
 *
 * **It does not overwrite.** A row whose key is already in the table is left
 * exactly as it is, whether or not an editor has changed the text, because
 * there is no way to tell those two apart: a row that still matches the default
 * may be one somebody deliberately typed back. That is what lets this sit in
 * `db:reset` without quietly reverting somebody's work, and `db:reset` is the
 * one command in this project people run without thinking hard about it.
 *
 * The cost of seeding rather than leaving it empty is worth naming: once a key
 * has a row, that row wins, so changing the default in the registry no longer
 * changes the site. The wording lives in the admin from here on, which is the
 * point of the pass.
 */

/** The array row Payload generates for both tables. */
type Row = NonNullable<UiString['strings']>[number]

const merge = (existing: Row[] | null | undefined, defaults: Record<string, string>) => {
  const rows = (existing ?? []).filter((row) => typeof row?.key === 'string' && row.key !== '')
  const taken = new Set(rows.map((row) => row.key))
  const added: Row[] = Object.entries(defaults)
    .filter(([key]) => !taken.has(key))
    .map(([key, text]) => ({ key, text }))
  return { rows: [...rows, ...added], written: added.length }
}

const seed = async (payload: Payload): Promise<number> => {
  const global = await payload.findGlobal({ slug: 'ui-strings', depth: 0 })

  const strings = merge(global?.strings, UI_DEFAULTS)
  const labels = merge(global?.labels, LABEL_DEFAULTS)

  const written = strings.written + labels.written
  if (written === 0) return 0

  await payload.updateGlobal({
    slug: 'ui-strings',
    data: { strings: strings.rows, labels: labels.rows },
  })

  return written
}

export default seed
