import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    group: 'Admin',
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role', 'games'],
  },
  auth: true,
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
