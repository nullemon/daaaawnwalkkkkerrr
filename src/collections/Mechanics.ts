import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/** The systems pages: the clock, Corruption, Infamy and the Edicts, quickslots, levelling. */
export const Mechanics: CollectionConfig = {
  slug: 'mechanics',
  admin: {
    group: 'Editorial',
    useAsTitle: 'title',
    defaultColumns: ['title', 'order', 'confidence', 'updatedAt'],
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'order',
      type: 'number',
      defaultValue: 100,
      admin: { position: 'sidebar', description: 'Lower sorts first in the mechanics index.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional. Mechanics pages had no image slot at all, which left fifty-one of them — the release, requirements and credits pages every wiki opens with — as walls of text.',
      },
    },
    {
      name: 'keyFacts',
      type: 'array',
      admin: { description: 'The numbers a reader came for. Rendered as a table at the top of the page.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
        {
          name: 'confidence',
          type: 'select',
          defaultValue: 'medium',
          options: [
            { label: 'High', value: 'high' },
            { label: 'Medium', value: 'medium' },
            { label: 'Low', value: 'low' },
          ],
        },
      ],
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
