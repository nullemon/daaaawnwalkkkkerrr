import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * What every remote session changed, and when.
 *
 * ## Why this exists
 *
 * A super-user credential with no trail is worse than no remote access at all:
 * the day something on a live page is wrong, the question is not "can I fix
 * it" but "what else did that session touch", and a feature that cannot answer
 * it has made the site harder to trust rather than easier to run.
 *
 * So the row is written **before** the response goes back, in the same handler
 * as the operation, and a failure to log is a failure of the operation. A
 * trail that is written on a best-effort basis is a trail with holes exactly
 * where the interesting requests are.
 *
 * ## What is in it, and what is not
 *
 * Writes, all of them, with the fields that changed named. Reads are counted
 * on the session row instead: a `list` of thirty guides is one row here and
 * eight hundred over an afternoon, and a log nobody reads through is not an
 * audit trail, it is a table.
 *
 * `changed` holds the field names and, for short scalars, the values — not the
 * whole document. The document is in the collection, with Payload's own
 * versions where a collection has them; duplicating it here would double the
 * database for the sake of a diff the record already carries.
 *
 * ## Access
 *
 * Read by editors, written by the route, and **not deletable through the API
 * at all** — not even by an admin. Deleting the trail is the one operation a
 * compromised editor account most wants, and the cost of making it a database
 * job instead of a button is a few minutes on a day that will probably never
 * come. `remote-log` is also in `DENIED_COLLECTIONS`, so no remote session can
 * reach it through itself.
 *
 * Not game-scoped. A session is not a wiki, and its log rows span whichever
 * wikis it touched — the `game` here is a plain label so a row can say which,
 * without a required relationship that a `whoami` or a `media` edit could not
 * satisfy.
 */
export const RemoteLog: CollectionConfig = {
  slug: 'remote-log',
  labels: { singular: 'Remote log entry', plural: 'Remote log' },
  admin: {
    group: 'Remote control',
    useAsTitle: 'summary',
    defaultColumns: ['createdAt', 'op', 'targetCollection', 'slug', 'game', 'session'],
    description:
      'Every change a remote session made. Written by the server, read-only everywhere, and not deletable — the trail is the reason the feature is safe to have.',
    pagination: { defaultLimit: 50, limits: [25, 50, 100, 250] },
  },
  access: {
    create: () => false,
    read: isEditor,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'session',
      type: 'relationship',
      relationTo: 'remote-sessions',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'device',
      type: 'relationship',
      relationTo: 'remote-devices',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: 'The editor whose account the session ran as — the one who approved it.',
      },
    },
    { name: 'op', type: 'text', required: true, index: true, admin: { readOnly: true } },
    {
      /*
        `targetCollection` rather than `collection`: Payload puts a `collection`
        key on the objects it hands to hooks and to access control, and a field
        of that name is a collision waiting for the first hook anybody adds
        here. The label is what the admin shows, so nothing is lost.
      */
      name: 'targetCollection',
      type: 'text',
      required: true,
      index: true,
      admin: { readOnly: true },
      label: 'Collection',
    },
    { name: 'docId', type: 'text', label: 'Record id', admin: { readOnly: true } },
    { name: 'slug', type: 'text', index: true, admin: { readOnly: true } },
    {
      name: 'game',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'The wiki, as a label rather than a relationship — not every operation has one.',
      },
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      admin: { readOnly: true, description: 'One line, as the log list shows it.' },
    },
    {
      name: 'changed',
      type: 'json',
      admin: {
        readOnly: true,
        description:
          'The fields the operation set, and short scalar values. Not the whole document — that is in the collection, with its versions.',
      },
    },
    {
      /*
        What the session was *permitted* to do at the moment of this row, not
        only what it did.

        It is on every row rather than only on the session, because the two
        questions an owner asks of a trail are "what happened" and "what else
        could have happened", and the second one is unanswerable from a table
        of operations. A session that was granted deletion and never used it
        reads identically to one that could not delete at all, unless the
        permission is written down beside the act.

        Denormalised on purpose: the session row carries the same list, and
        this copy is the one that cannot change afterwards.
      */
      name: 'granted',
      type: 'text',
      label: 'Permitted',
      admin: {
        readOnly: true,
        description:
          'The capabilities this session held when it made this request — what it was allowed to do, beside what it did.',
      },
    },
    { name: 'ip', type: 'text', admin: { readOnly: true } },
    {
      name: 'outcome',
      type: 'select',
      required: true,
      defaultValue: 'ok',
      options: [
        { label: 'Applied', value: 'ok' },
        { label: 'Refused', value: 'refused' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: {
        readOnly: true,
        description:
          'Refusals are logged too. An attempt to write something a session was not allowed to write is the entry somebody will most want to find.',
      },
    },
    { name: 'detail', type: 'text', admin: { readOnly: true, description: 'Why, when it was not applied.' } },
  ],
  indexes: [{ fields: ['session', 'createdAt'] }],
  versions: false,
}
