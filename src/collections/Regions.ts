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
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional. A screenshot or piece of art for this record. Until one is set, the site falls back to its own icon, so a missing image never leaves a hole.',
      },
    },
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
