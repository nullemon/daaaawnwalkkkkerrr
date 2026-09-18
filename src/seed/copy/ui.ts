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
 * point of the pass. `SUPERSEDED` below is the one exception, and the reason
 * it has to exist.
 */

/**
 * Wording that was seeded and then found to be wrong.
 *
 * Correcting a default in the registry fixes a fresh database and does nothing
 * to one that has already been seeded, because the seeded row wins — and after
 * `overridesOnly` the stale row is no longer equal to the default, so it starts
 * being shipped to the browser as though somebody had chosen it. That is the
 * worst of the three outcomes: the bug is now pinned in the database and looks
 * like an editorial decision.
 *
 * So a correction lists the exact text it replaces. A row still holding that
 * text is updated; a row holding anything else is somebody's own wording and is
 * left alone. It is a migration list rather than a clever rule, which is the
 * right shape for something that has to be exactly as long as the number of
 * mistakes actually made.
 */
const SUPERSEDED: Record<string, string> = {
  /*
    "1 quest stand between the start of a run and this one. They have to happen
    in this order." — a plural verb on a singular count, and an instruction
    about ordering a single item. Shipped that way, lifted into the registry
    unchanged by the pass that promised to change no wording, corrected after.
  */
  'unlock.stand-between-one':
    '{count} quest stand between the start of a run and this one. They have to happen in this order.',

  /*
    Both search placeholders named a perk, which only Dawnwalker has. They are
    network-wide, and `search.hero-placeholder` sits in the first control on
    every wiki's home page, so seven of the eight invited a reader to search
    for a kind of thing their game does not contain.
  */
  'search.placeholder': 'A quest, an item, a perk, a character…',
  'search.hero-placeholder': 'Search quests, items, perks, characters…',

  /*
    "there are 1 of them" — the plural-on-a-singular-count failure, inside the
    `.one` key written to prevent it. `UnlockPath` picks the branch correctly;
    the wording in the branch was wrong.
  */
  'unlock.no-total-one':
    'No source publishes a cost for any of the {count} remaining step, so there is no total to give — only that there are {count} of them.',
}

/** The array row Payload generates for both tables. */
type Row = NonNullable<UiString['strings']>[number]

const merge = (existing: Row[] | null | undefined, defaults: Record<string, string>) => {
  let corrected = 0
  const rows = (existing ?? [])
    .filter((row) => typeof row?.key === 'string' && row.key !== '')
    .map((row) => {
      const stale = SUPERSEDED[row.key as string]
      if (stale && row.text === stale && defaults[row.key as string]) {
        corrected += 1
        return { ...row, text: defaults[row.key as string] }
      }
      return row
    })
  const taken = new Set(rows.map((row) => row.key))
  const added: Row[] = Object.entries(defaults)
    .filter(([key]) => !taken.has(key))
    .map(([key, text]) => ({ key, text }))
  return { rows: [...rows, ...added], written: added.length + corrected }
}

/**
 * Drop override rows for keys the registry no longer has.
 *
 * `merge` adds a row for every default and nothing ever removed one, so
 * retiring a key left its override behind for ever. Two were sitting there:
 * `profile.at-a-glance`, retired in 074f145, and `profile.metacritic`, retired
 * when third-party scores were taken off the network.
 *
 * They are not merely untidy. `overridesOnly` keeps a row whose text differs
 * from the registry default, and retiring a key *deletes* the default — so the
 * row stops matching, starts counting as an editor's override, and is
 * serialised into the `UiStringsProvider` props inline in the HTML of every
 * page on the network. A string nothing renders, shipped on 3,227 pages.
 *
 * **Strings only.** `labels` is deliberately open: `ui.label()` supports an
 * enum value the registry does not list, because "the values are data, and a
 * wiki can invent one at any time". An editor's label for such a value has no
 * default by design, and pruning it would silently stop shipping it — which is
 * what the existing test `keeps a row for a key the registry does not have` is
 * there to prevent. Same shape as `pnpm seed:prune`: a pass that stops writing
 * something should take what it wrote with it, but only where it owns the key
 * space.
 */
const retired = <T extends { key?: string | null }>(
  rows: T[],
  defaults: Record<string, string>,
): { rows: T[]; dropped: number } => {
  const kept = rows.filter((row) => typeof row.key === 'string' && row.key in defaults)
  return { rows: kept, dropped: rows.length - kept.length }
}

const seed = async (payload: Payload): Promise<number> => {
  const global = await payload.findGlobal({ slug: 'ui-strings', depth: 0 })

  const merged = merge(global?.strings, UI_DEFAULTS)
  const pruned = retired(merged.rows, UI_DEFAULTS)
  const strings = { rows: pruned.rows, written: merged.written + pruned.dropped }
  if (pruned.dropped > 0) {
    console.log(`  ui strings        ${pruned.dropped} override(s) for retired keys removed`)
  }
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
