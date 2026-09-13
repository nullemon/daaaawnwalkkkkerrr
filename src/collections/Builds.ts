import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/**
 * Character builds. Kept as first-class records rather than prose because the
 * build planner reads them: a build is a starting point someone loads and then
 * edits, not an article they read once.
 */
export const Builds: CollectionConfig = {
  slug: 'builds',
  admin: {
    group: 'Character',
    useAsTitle: 'title',
    defaultColumns: ['title', 'playstyle', 'difficulty', 'confidence', 'updatedAt'],
    description: 'Recommended builds. These seed the build planner.',
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
      name: 'playstyle',
      type: 'select',
      required: true,
      defaultValue: 'hybrid',
      options: [
        { label: 'Day — human, Witchcraft-leaning', value: 'day' },
        { label: 'Night — vampire, Vampirism-leaning', value: 'night' },
        { label: 'Hybrid — works in both phases', value: 'hybrid' },
      ],
    },
    {
      name: 'difficulty',
      type: 'select',
      defaultValue: 'intermediate',
      options: [
        { label: 'Beginner', value: 'beginner' },
        { label: 'Intermediate', value: 'intermediate' },
        { label: 'Advanced', value: 'advanced' },
      ],
    },
    { name: 'primaryTree', type: 'relationship', relationTo: 'skill-trees' },
    { name: 'perks', type: 'relationship', relationTo: 'perks', hasMany: true },
    { name: 'items', type: 'relationship', relationTo: 'items', hasMany: true },
    {
      name: 'segmentCost',
      type: 'number',
      admin: {
        description:
          'Segments needed to learn the whole build, where known. Leave blank rather than estimate.',
      },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
