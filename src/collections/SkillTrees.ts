import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/** Swordmastery, Witchcraft and Vampirism. */
export const SkillTrees: CollectionConfig = {
  slug: 'skill-trees',
  labels: { singular: 'Skill tree', plural: 'Skill trees' },
  admin: {
    group: 'Character',
    useAsTitle: 'title',
    defaultColumns: ['title', 'phase', 'confidence', 'updatedAt'],
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
      name: 'phase',
      type: 'select',
      required: true,
      defaultValue: 'either',
      options: [
        { label: 'Primarily day', value: 'day' },
        { label: 'Primarily night', value: 'night' },
        { label: 'Either', value: 'either' },
      ],
      admin: { description: 'Witchcraft is a day tree, Vampirism a night tree, Swordmastery sits in the middle.' },
    },
    {
      name: 'gatedByCorruption',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Vampirism unlocks as Corruption rises.' },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
