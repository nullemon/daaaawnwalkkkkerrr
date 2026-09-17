import type { CollectionConfig } from 'payload'

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
    No `verify`, and no `forgotPassword` template, and both are gaps rather
    than decisions somebody should tidy away.

    Payload exposes `POST /api/players/forgot-password` whether or not anything
    links to it, and nothing does: `AccountPanel` offers sign in and register
    and no third option. If it were reached, the email Payload composes points
    at `/admin/reset/<token>` — the *editor* admin, whose reset view resolves
    tokens against `users` — so a reader following it would be told the token
    was invalid, on a page they cannot sign into. There is no player-facing
    reset page to point it at instead, and writing a template that links to one
    that does not exist would be a worse lie than the silence.

    This has been harmless only because there was no email adapter: nothing was
    ever delivered. Now that there is one, a reader who finds the endpoint gets
    a real message with a dead link. Finishing it means a `/account/reset`
    page and a template here; until then it is written down in docs/EMAIL.md
    rather than half-built.
  */
  auth: {
    tokenExpiration: 60 * 60 * 24 * 90, // 90 days: this is a 30-day playthrough companion
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
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
