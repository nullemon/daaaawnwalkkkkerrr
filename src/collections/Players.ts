import type { CollectionConfig } from 'payload'
import { networkName } from '../lib/email-copy'
import { HUB_ORIGIN } from '../lib/urls'

/**
 * Where a reader's reset link points, and the one thing about it that matters.
 *
 * `/account/reset` on the **hub**, never `/admin/reset`. These are two auth
 * collections and their tokens are not interchangeable: the admin's reset view
 * resolves a token against `users`, so a reader sent there is told their token
 * is invalid on a page they cannot sign into. That was the live behaviour of
 * `POST /api/players/forgot-password` — Payload exposes it whether anything
 * links to it or not — for as long as this collection had no template.
 *
 * Absolute, and against the hub specifically, for two reasons that both end in
 * a dead link:
 *
 *  - Payload composes this URL from `config.serverURL`, which this config
 *    deliberately does not set (the admin answers on all ten hosts and a fixed
 *    serverURL makes its own API calls cross-origin on nine of them). Unset,
 *    the fallback yields the bare path `/account/reset`, which is not a link
 *    at all in a mail client. `Users.ts` says the same thing at more length.
 *  - `account` is in `APEX_ONLY` in `proxy.ts`, not `PASS_THROUGH`. On a wiki
 *    host `/account/reset` is rewritten to `/<game>/account/reset`, which does
 *    not exist — so a relative link would 404 on nine hosts out of ten even
 *    with an origin in front of it. The hub is the one host the page is on.
 *
 * The token rides in the **fragment**, not the query string. A fragment is
 * never sent to a server, so it stays out of the access log, out of a Referer,
 * and out of `Beacon`, which posts `window.location.search` to `/api/hit` on
 * every page view. A password-reset token in the analytics pipeline is not a
 * disaster, but it is avoidable for the cost of one character. The page still
 * accepts `?token=` as well, because a mail gateway that rewrites links can
 * drop a fragment and a reader in that position would otherwise be stuck: each
 * new link they asked for would lose it the same way.
 */
const resetUrl = (token: string): string =>
  `${HUB_ORIGIN}/account/reset#token=${encodeURIComponent(token)}`

/**
 * Optional reader accounts, kept entirely separate from the `users` collection
 * that owns the admin panel. Nobody needs one: the whole site works
 * anonymously with run state in the browser. An account exists only so a run
 * can follow you between a phone and a desktop.
 *
 * Because it is optional, it collects as little as possible — an email to log
 * in with, and the run itself.
 */
export const Players: CollectionConfig = {
  slug: 'players',
  labels: { singular: 'Player account', plural: 'Player accounts' },
  admin: {
    group: 'Admin',
    useAsTitle: 'email',
    defaultColumns: ['email', 'displayName', 'updatedAt'],
    description:
      'Reader accounts. These are site visitors, not editors — they have no admin access.',
  },
  /*
    Still no `verify`, and that is a decision rather than the gap the reset
    flow was. An account here holds an email and a saved run; nothing is
    published under it and nothing is emailed to it except a reset, so an
    unconfirmed address costs the reader a reset they cannot complete and costs
    us nothing. Making somebody confirm an address before they may sync a run
    between two of their own devices is a step that loses accounts to no end.
  */
  auth: {
    tokenExpiration: 60 * 60 * 24 * 90, // 90 days: this is a 30-day playthrough companion
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
    /*
      The reader-facing reset email. See `resetUrl` above for where it points
      and why that is not the admin.

      Payload's default expiry for one of these tokens is an hour, and the
      sentence below says so rather than being vague: a reader who opens their
      mail the next morning needs to know the link is dead because it aged out,
      not to conclude the site is broken. Nothing here names a game — this
      reaches readers of all eight wikis, and the network's own name comes from
      Site settings or is left out altogether.
    */
    forgotPassword: {
      generateEmailSubject: () => 'Reset your password',
      generateEmailHTML: async (args) => {
        const url = resetUrl(String(args?.token ?? ''))
        const name = args?.req?.payload ? await networkName(args.req.payload) : ''
        const who = name ? `your ${name} reader account` : 'your reader account'
        return [
          `<p>Somebody asked to reset the password on ${who}.</p>`,
          `<p><a href="${url}">${url}</a></p>`,
          '<p>The link is good for one hour. If this was not you, nothing has changed and you can ignore this message — your password is only altered by somebody who opens that link.</p>',
        ].join('')
      },
    },
  },
  access: {
    // Anyone may register. Beyond that a player sees and edits only themselves;
    // editors can read the list for support and abuse handling.
    create: () => true,
    read: ({ req }) => {
      if (req.user?.collection === 'users') return true
      if (req.user?.collection === 'players') return { id: { equals: req.user.id } }
      return false
    },
    update: ({ req }) => {
      if (req.user?.collection === 'users') return true
      if (req.user?.collection === 'players') return { id: { equals: req.user.id } }
      return false
    },
    delete: ({ req }) => {
      if (req.user?.collection === 'users') return true
      if (req.user?.collection === 'players') return { id: { equals: req.user.id } }
      return false
    },
  },
  fields: [
    {
      name: 'displayName',
      type: 'text',
      maxLength: 60,
      admin: { description: 'Optional. Shown only to the player themselves.' },
    },
    {
      name: 'run',
      type: 'json',
      admin: {
        description:
          'The saved run: day, phase, and which quests are ticked. Written by the site, not by hand.',
      },
    },
    {
      name: 'runUpdatedAt',
      type: 'date',
      admin: { description: 'Used to decide whether the browser or the server has the newer run.' },
    },
  ],
}
