import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * Reader scores. One per person per game, no account required.
 *
 * Network-wide rather than game-scoped, like `comments`: it carries a `game`
 * for filtering, but a rating is not wiki content and nothing here is edited
 * by a wiki's editors.
 *
 * ## Why this is not moderated, when comments are
 *
 * A comment is prose and can say anything; a rating is an integer between one
 * and ten and cannot. There is nothing to screen, so ratings publish
 * immediately — which is the only way a star widget feels like anything at all.
 * What has to be defended instead is the *count*, because an average is only
 * worth printing if it is an average of people.
 *
 * ## The voter key, and what it honestly does
 *
 * `voter` is a hash of the reader's IP address and a cookie this site sets,
 * salted with `PAYLOAD_SECRET` so the table cannot be turned back into a list
 * of addresses. A unique index on `(game, voter)` is what makes a second vote
 * an update rather than another row.
 *
 * **This stops casual double-voting and nothing more.** A different browser, a
 * phone on mobile data, or a VPN is a different voter, and anybody who wants to
 * push a number can. That is true of every ratings widget that does not require
 * an account, and the honest response is not to pretend otherwise: the page
 * says how many people voted, so a score built on nine votes reads as a score
 * built on nine votes. `docs/DATA.md` is where that limitation is written down.
 *
 * The raw IP is never stored. It is hashed on arrival and discarded, so this
 * table holds no personal data even before it is aggregated — which is what
 * keeps the privacy policy short and true.
 */
export const Ratings: CollectionConfig = {
  slug: 'ratings',
  admin: {
    group: 'Moderation',
    useAsTitle: 'voter',
    defaultColumns: ['game', 'score', 'createdAt'],
    description:
      'Reader scores, one per person per game. Nothing here is written by hand — delete a row to remove a vote.',
  },
  access: {
    /*
      Created through `/api/rate`, which hashes the voter key server-side. The
      REST endpoint stays closed: a create here would let a caller supply its
      own `voter` and vote as many times as it liked.
    */
    create: () => false,
    read: () => true,
    update: isEditor,
    delete: isEditor,
  },
  fields: [
    {
      name: 'game',
      type: 'relationship',
      relationTo: 'games',
      required: true,
      index: true,
    },
    {
      name: 'score',
      type: 'number',
      required: true,
      min: 1,
      max: 10,
      admin: { description: 'Whole stars, 1 to 10.' },
    },
    {
      name: 'voter',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'A salted hash of the reader’s IP and their cookie. The address itself is never stored, so this table holds no personal data.',
      },
    },
  ],
  indexes: [{ fields: ['game', 'voter'], unique: true }],
}
