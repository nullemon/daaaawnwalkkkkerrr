import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

export const Perks: CollectionConfig = {
  slug: 'perks',
  admin: {
    group: 'Character',
    useAsTitle: 'title',
    defaultColumns: ['title', 'tree', 'isUltimate', 'timeCostSegments', 'confidence'],
    description: 'Perks and skills. Each tree has three ultimates, of which only one can be taken.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    { name: 'tree', type: 'relationship', relationTo: 'skill-trees', required: true },
    {
      name: 'isUltimate',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'One ultimate per tree, nine in the game.' },
    },
    {
      name: 'timeCostSegments',
      type: 'number',
      admin: {
        description:
          'Segments spent learning this specific perk. LEAVE BLANK unless a source states it — blank renders as "not confirmed". Reporting says most skills cost about 1, but that general claim is not evidence for any individual perk.',
      },
    },
    {
      name: 'foundInWorld',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Some perks must be unlocked out in the world rather than bought.' },
    },
    { name: 'effect', type: 'textarea', admin: { description: 'What it actually does, in one line.' } },
    confidenceField(),
    ...commonContentFields(),
  ],
}
