import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

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
  auth: { useAPIKey: true },
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
