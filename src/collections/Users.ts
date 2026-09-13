import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    group: 'Admin',
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role'],
  },
  auth: true,
  access: {
    // Only admins can create or delete other accounts.
    create: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
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
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
  ],
  versions: false,
}
