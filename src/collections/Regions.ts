import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/** The ten regions of Vale Sangora. */
export const Regions: CollectionConfig = {
  slug: 'regions',
  admin: {
    group: 'World',
    useAsTitle: 'title',
    defaultColumns: ['title', 'court', 'confidence', 'updatedAt'],
    description: 'The ten regions of Vale Sangora.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'court',
      type: 'relationship',
      relationTo: 'courts',
      admin: { description: 'Which vassal holds this region, if any.' },
    },
    {
      name: 'dangerRating',
      type: 'select',
      options: [
        { label: 'Starting area', value: 'starting' },
        { label: 'Moderate', value: 'moderate' },
        { label: 'Dangerous', value: 'dangerous' },
        { label: 'Late run', value: 'late' },
      ],
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
