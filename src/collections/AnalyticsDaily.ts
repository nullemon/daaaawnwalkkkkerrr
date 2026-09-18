import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * A day, a dimension, a value, and what it was worth. The history that outlives
 * the rows it came from.
 *
 * ## Why rollups exist at all
 *
 * One row per page view is the right shape for a filtered question and the
 * wrong shape for a decade. Ten hosts and nineteen hundred pages will,
 * eventually, be a table nobody wants to group by. So raw rows live sixty-two
 * days (`RAW_RETENTION_DAYS`) and `pnpm analytics:roll` summarises each day
 * into this table before deleting them.
 *
 * The saving is the point: a day of this network's traffic collapses to a few
 * hundred rows here whatever the traffic was, because the row count depends on
 * how many distinct values each dimension had, not on how many hits there
 * were. A decade of rollups is smaller than a week of raw.
 *
 * ## What a rollup cannot answer, and why that is said out loud
 *
 * These are **one-dimensional totals**. "Mobile readers" and "readers in the
 * Philippines" are both here; "mobile readers in the Philippines" is not, and
 * cannot be recovered from them. Storing every combination is a cross product
 * that grows faster than the raw table it was meant to replace.
 *
 * So the reading layer takes the honest split: a window that fits inside the
 * raw retention is answered from raw rows and can be filtered on anything; a
 * longer one is answered from here and the filter controls say, on screen, that
 * they do not apply. A dashboard that silently ignored a filter and returned
 * the unfiltered number would be the exact failure this repository keeps
 * finding — nothing errors, the figure looks right, and it is the reassuring
 * one.
 *
 * ## `readers` is a ceiling across days, and only across days
 *
 * The visitor key rotates every UTC day, on purpose — see the note in
 * `lib/analytics/request.ts`. Within one day a distinct count is exact. Summing
 * seven of them counts a reader who came back on Tuesday twice. That is a
 * ceiling rather than a figure, the admin prints it as one, and the alternative
 * — a key that never rotates — is a column that follows a person around for as
 * long as the table exists.
 */
export const AnalyticsDaily: CollectionConfig = {
  slug: 'analytics-daily',
  labels: { singular: 'Analytics rollup', plural: 'Analytics rollups' },
  admin: {
    group: 'Analytics',
    useAsTitle: 'value',
    defaultColumns: ['day', 'dim', 'value', 'views', 'readers'],
    description:
      'Daily totals, one row per dimension value. Written by pnpm analytics:roll and never by hand. These outlive the raw rows and are what the long windows read.',
  },
  access: {
    create: () => false,
    read: isEditor,
    update: () => false,
    delete: isEditor,
  },
  fields: [
    {
      name: 'day',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'YYYY-MM-DD, UTC. Every window in this system is UTC.' },
    },
    {
      name: 'dim',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description:
          'Which breakdown this row belongs to: total, site, host, path, section, channel, source, campaign, device, browser, os, country, or bot.',
      },
    },
    {
      name: 'value',
      type: 'text',
      required: true,
      admin: { description: 'The value within that breakdown. The empty string on a “total” row.' },
    },
    { name: 'views', type: 'number', required: true },
    {
      name: 'readers',
      type: 'number',
      required: true,
      admin: {
        description:
          'Distinct visitor keys on that day. Exact for the day; summing several days counts a returning reader once per day, so a multi-day figure is a ceiling.',
      },
    },
  ],
  indexes: [
    /*
      Unique on the whole key, which is what makes the roll idempotent: running
      it twice for the same day updates the row instead of writing a second one.
      A rollup pass that could double-count on a retry is a pass nobody can ever
      safely re-run, and this one is re-run every time it catches up.
    */
    { fields: ['day', 'dim', 'value'], unique: true },
    { fields: ['dim', 'day'] },
  ],
}
