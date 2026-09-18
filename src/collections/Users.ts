import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { HUB_ORIGIN } from '../lib/urls'
/*
  The network's own name, for the two sentences an editor reads in an inbox.

  Read from Site settings rather than written here, and falling back to nothing
  rather than to a name. A sentence about one game does not belong in shared
  code - this email is sent to editors of all ten hosts, and hardcoding
  "Dawnwalker Guide" here is the same bug as the Regions index headed "Vale
  Sangora", just delivered to an inbox instead of a page.

  It moved to `lib/email-copy.ts` when `players` grew a reset email of its own.
  Two collections composing the same sentence out of two private copies of this
  helper is how the editors' mail and the readers' mail come to disagree about
  what the network is called, and nothing would have compared them.
*/
import { networkName } from '../lib/email-copy'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    group: 'Admin',
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role', 'games'],
  },
  /*
    API keys, as well as the email/password login the admin uses.

    This is what lets content be added to a *running* site from outside the
    browser — a script, a terminal, a scheduled job — without SSH, a redeploy,
    or a database connection string. `tools/remote.mjs` is the client.

    A key is issued per user and carries exactly that user's permissions, so an
    editor assigned to one wiki cannot write to another with theirs. Revoking
    is unticking a box on their record.
  */
  auth: {
    useAPIKey: true,
    /*
      The reset link, built against the hub rather than against whatever host
      the request arrived on.

      Payload builds this URL itself from `config.serverURL`, and when that is
      unset - it is, deliberately, because the admin is served on all ten hosts
      and a fixed serverURL would make its own API calls cross-origin - it
      falls back to the Host header, checks it against the CORS/CSRF allowlist,
      finds no allowlist, and returns an empty origin. The link in the email is
      then the bare path `/admin/reset/<token>`, which is not a link at all in
      a mail client. Nobody has seen that happen because there was no email
      adapter to deliver it; attaching one would have made every editor's
      password reset a dead link on the first day.

      NEXT_PUBLIC_SITE_URL is the apex and the admin answers there, so this is
      the one host the link is always right for.
    */
    forgotPassword: {
      generateEmailSubject: () => 'Reset your password',
      generateEmailHTML: async (args) => {
        const url = `${HUB_ORIGIN}/admin/reset/${args?.token ?? ''}`
        const name = args?.req?.payload ? await networkName(args.req.payload) : ''
        const who = name ? `the ${name} admin` : 'the admin'
        return [
          `<p>Somebody asked to reset the password on your editor account for ${who}.</p>`,
          `<p><a href="${url}">${url}</a></p>`,
          '<p>The link is good for one hour. If this was not you, nothing has changed and you can ignore this message.</p>',
        ].join('')
      },
    },
  },
  access: {
    /**
     * Editor accounts are staff records and must not be visible to reader
     * accounts. Payload's default read access is "any authenticated user",
     * which since `players` exists would expose every editor's email address
     * to anyone who signed up — so this is stated explicitly.
     */
    read: isEditor,
    update: isEditor,
    // Only an admin editor can create or delete editor accounts. Reader
    // accounts live in `players` and never satisfy this.
    create: ({ req }) => req.user?.collection === 'users' && req.user.role === 'admin',
    delete: ({ req }) => req.user?.collection === 'users' && req.user.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Admin — full control, manages accounts', value: 'admin' },
        { label: 'Editor — writes and edits content', value: 'editor' },
      ],
      access: {
        // An editor must not be able to promote themselves.
        update: ({ req }) => req.user?.collection === 'users' && req.user.role === 'admin',
      },
    },
    {
      name: 'games',
      type: 'relationship',
      relationTo: 'games',
      hasMany: true,
      admin: {
        description:
          'Which wikis this editor may write to. Leave empty for all of them. A contributor hired to cover one game should not be able to edit another — see isEditorForGame in fields/shared.ts.',
        condition: (_data, siblingData) => siblingData?.role !== 'admin',
      },
      access: {
        // Assigning yourself another game is the same escalation as changing
        // your own role, so it is gated the same way.
        update: ({ req }) => req.user?.collection === 'users' && req.user.role === 'admin',
      },
    },
  ],
  versions: false,
}
