import type { CollectionConfig } from 'payload'

/**
 * Reader-submitted corrections. Anyone may file one; only signed-in editors can
 * read or resolve them. This is the mechanism that turns the site's biggest
 * weakness — data compiled without access to the game — into something that
 * improves over time.
 */
export const Corrections: CollectionConfig = {
  slug: 'corrections',
  admin: {
    group: 'Admin',
    useAsTitle: 'summary',
    defaultColumns: ['summary', 'status', 'pageUrl', 'createdAt'],
    description: 'Reader reports. Triage these — they are the accuracy loop.',
  },
  access: {
    // Public submission, private review.
    create: () => true,
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'summary',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: { description: 'What the reader says is wrong.' },
    },
    { name: 'detail', type: 'textarea', maxLength: 2000 },
    {
      name: 'pageUrl',
      type: 'text',
      admin: { description: 'Page the report came from.' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: { description: 'Evidence the reader offered, if any.' },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Confirmed — fixed', value: 'fixed' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Needs the game to verify', value: 'blocked' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'editorNote',
      type: 'textarea',
      admin: { position: 'sidebar', description: 'Internal. Never shown publicly.' },
    },
  ],
}
