import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/** Editorial long-form aimed at specific search queries. */
export const Guides: CollectionConfig = {
  slug: 'guides',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'targetQuery', 'updatedAt'],
  },
  access: publicRead,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'targetQuery',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'The search this page is written to answer. One page, one query.',
      },
    },
    {
      name: 'relatedQuests',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
    },
    {
      name: 'relatedEndings',
      type: 'relationship',
      relationTo: 'endings',
      hasMany: true,
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
