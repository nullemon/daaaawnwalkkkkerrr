import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { CAPABILITIES, CAPABILITY_LABEL } from '../lib/remote/policy'
import { SESSION_STATUSES } from '../lib/remote/session'

/**
 * The five boxes, in the order the approval screen shows them.
 *
 * Three fields on this row are the same list at different moments — asked for,
 * ticked, granted — so the options are declared once. A row where the three
 * could not be compared value for value would be a row that cannot answer the
 * question the owner will actually ask: was it allowed to do that?
 */
const CAPABILITY_OPTIONS = CAPABILITIES.map((value) => ({ label: CAPABILITY_LABEL[value], value }))

/**
 * One row per pairing request, and the session it becomes.
 *
 * ## The two strings on this row, and why only one of them is a secret
 *
 * `code` is stored as it is displayed, because being displayed is its entire
 * purpose: the CLI prints it, `/admin/remote` prints it, and the owner
 * comparing the two is what confirms that the session they are approving is
 * the one in their terminal. Nothing in this codebase accepts the code as
 * authorisation for anything — the only place it is ever submitted is the
 * confirm box on the approval form, where it is compared against this field.
 *
 * `tokenHash` is the credential, and it is the hash. The token itself exists
 * for the length of one HTTP response: it is minted when the CLI collects it,
 * returned once, and never stored. It does not pass through the browser at
 * all, which is the point of approval being a status flip rather than a
 * handover — see `docs/REMOTE.md`.
 *
 * ## Why the status is a column and expiry is a comparison
 *
 * `src/lib/remote/session.ts` decides what a row means, without a database, so
 * every clock comparison in the feature is one function with a unit test that
 * walks each state. The routes write the answer back when it changes, because
 * a session that reads as expired on every request but stays `open` in the
 * database is a session this screen reports as live for ever.
 *
 * ## Access
 *
 * Written by the routes, never by the API. An editor can read sessions and can
 * revoke one by deleting it, but cannot create or hand-edit one: a row created
 * by hand would be a session nobody signed for, and an edited `expiresAt`
 * would be a session that outlives the decision that made it. Revocation goes
 * through `/api/remote/decide`, which records who did it.
 *
 * `remote-sessions` is in `DENIED_COLLECTIONS`, so a remote session cannot
 * reach this table through itself.
 *
 * Not game-scoped, and never to be added to `GAME_SCOPED`.
 */
export const RemoteSessions: CollectionConfig = {
  slug: 'remote-sessions',
  labels: { singular: 'Remote session', plural: 'Remote sessions' },
  admin: {
    group: 'Remote control',
    useAsTitle: 'code',
    defaultColumns: ['code', 'status', 'device', 'capabilities', 'createdAt', 'expiresAt'],
    description:
      'Every pairing request and every session. The screen you want is Remote control in the sidebar — this list is the history behind it.',
    pagination: { defaultLimit: 50, limits: [25, 50, 100, 250] },
  },
  access: {
    create: () => false,
    read: isEditor,
    update: () => false,
    delete: isEditor,
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'The sixteen characters the terminal printed. Compared by eye, never accepted as a credential — the token that authorises requests is minted by the server and stored here only as a hash.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'pending',
      options: SESSION_STATUSES.map((value) => ({ label: value, value })),
      admin: { readOnly: true },
    },
    {
      name: 'device',
      type: 'relationship',
      relationTo: 'remote-devices',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'requestedCapabilities',
      type: 'select',
      hasMany: true,
      options: CAPABILITY_OPTIONS,
      admin: { readOnly: true, description: 'What the terminal asked to be allowed to do.' },
    },
    {
      name: 'approvedCapabilities',
      type: 'select',
      hasMany: true,
      options: CAPABILITY_OPTIONS,
      admin: {
        readOnly: true,
        description:
          'What the approver ticked on the approval screen. Their half of the pair, kept so the row says what was offered as well as what was used.',
      },
    },
    {
      /*
        The grant, and **the only field any check reads**. Everything else on
        this row about permissions is a record of how it was arrived at.

        Empty means the session can do nothing but say who it is and close
        itself: `sessionCan` is default-deny, so a column that failed to read
        or was never written refuses rather than widens.
      */
      name: 'capabilities',
      type: 'select',
      hasMany: true,
      options: CAPABILITY_OPTIONS,
      admin: {
        readOnly: true,
        description:
          'What was granted: the intersection of the two lines above, fixed when the terminal collected its token. Ticking a box the terminal did not ask for does not widen a session.',
      },
    },
    {
      name: 'tokenHash',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description:
          'HMAC of the session token, keyed on PAYLOAD_SECRET. The token itself is never stored, so rotating that secret ends every live session.',
      },
    },
    {
      name: 'approvedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description:
          'Every operation this session performs runs as this account, with access control on. A remote session is never more powerful than the editor who approved it.',
      },
    },
    { name: 'approvedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'pairingExpiresAt',
      type: 'date',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        description: 'When this stops being approvable.',
      },
    },
    { name: 'expiresAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'lastUsedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'idleMs',
      type: 'number',
      admin: {
        readOnly: true,
        description: 'Milliseconds of quiet before the session closes itself, fixed at approval.',
      },
    },
    {
      name: 'codeAttempts',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        description: 'Wrong codes typed into the confirm box. Five locks the session permanently.',
      },
    },
    { name: 'ip', type: 'text', admin: { readOnly: true, description: 'Where the pairing request came from.' } },
    {
      name: 'agent',
      type: 'text',
      admin: { readOnly: true, description: 'What the CLI said it was. A claim, like any user-agent.' },
    },
    {
      name: 'writes',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true, description: 'Operations that changed something. The detail is in the Remote log.' },
    },
    {
      name: 'reads',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
        description:
          'Operations that changed nothing. Counted rather than logged row by row — a log nobody can read through is not an audit trail.',
      },
    },
    {
      name: 'endedReason',
      type: 'text',
      admin: { readOnly: true, description: 'Why it is no longer open, in the words the CLI was given.' },
    },
  ],
  indexes: [
    // The two lookups every route makes: by token on an operation, by status
    // on the approval screen. Named from their fields, so this is not the
    // positional renumbering trap `scopedToGame` has.
    { fields: ['tokenHash'] },
    { fields: ['status', 'createdAt'] },
  ],
  versions: false,
}
