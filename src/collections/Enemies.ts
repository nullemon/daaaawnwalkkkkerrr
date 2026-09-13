import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

export const Enemies: CollectionConfig = {
  slug: 'enemies',
  admin: {
    group: 'World',
    useAsTitle: 'title',
    defaultColumns: ['title', 'isBoss', 'region', 'confidence', 'updatedAt'],
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    { name: 'isBoss', type: 'checkbox', defaultValue: false, label: 'Boss' },
    { name: 'region', type: 'relationship', relationTo: 'regions' },
    {
      name: 'weaknesses',
      type: 'array',
      fields: [{ name: 'value', type: 'text', required: true }],
    },
    {
      name: 'phase',
      type: 'select',
      options: [
        { label: 'Encountered by day', value: 'day' },
        { label: 'Encountered by night', value: 'night' },
        { label: 'Either', value: 'either' },
      ],
      defaultValue: 'either',
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
