import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

export const Characters: CollectionConfig = {
  slug: 'characters',
  admin: {
    group: 'World',
    useAsTitle: 'title',
    defaultColumns: ['title', 'role', 'romanceable', 'confidence', 'updatedAt'],
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'Protagonist', value: 'protagonist' },
        { label: 'Ally', value: 'ally' },
        { label: 'Vassal', value: 'vassal' },
        { label: 'Antagonist', value: 'antagonist' },
        { label: 'Merchant', value: 'merchant' },
        { label: 'Minor', value: 'minor' },
      ],
    },
    { name: 'romanceable', type: 'checkbox', defaultValue: false },
    {
      name: 'region',
      type: 'relationship',
      relationTo: 'regions',
      admin: { description: 'Where they are usually found.' },
    },
    {
      name: 'questline',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
      admin: { description: 'Their questline, in order. Drives ally-gated endings.' },
    },
    { name: 'portrait', type: 'upload', relationTo: 'media' },
    confidenceField(),
    ...commonContentFields(),
  ],
}
