import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/**
 * The 41 Court Activities — 14 Ambrus, 12 Bakir, 15 Xanthe — which are the
 * real main-quest progression after the prologue. Kept separate from quests
 * because they are surfaced through the in-game Court menu, carry an anger
 * contribution, and get their own URL space.
 */
export const CourtActivities: CollectionConfig = {
  slug: 'court-activities',
  labels: { singular: 'Court activity', plural: 'Court activities' },
  admin: {
    group: 'Run',
    useAsTitle: 'title',
    defaultColumns: ['title', 'court', 'region', 'phase', 'confidence'],
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    { name: 'court', type: 'relationship', relationTo: 'courts', required: true },
    { name: 'region', type: 'relationship', relationTo: 'regions' },
    {
      name: 'time',
      type: 'group',
      label: 'Time cost',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'min', type: 'number', defaultValue: 0, admin: { width: '50%' } },
            { name: 'max', type: 'number', defaultValue: 0, admin: { width: '50%' } },
          ],
        },
      ],
    },
    {
      name: 'phase',
      type: 'select',
      defaultValue: 'either',
      options: [
        { label: 'Day only', value: 'day' },
        { label: 'Night only', value: 'night' },
        { label: 'Either', value: 'either' },
      ],
    },
    {
      name: 'angerValue',
      type: 'number',
      admin: { description: 'How much this pushes the vassal toward the duel, where known.' },
    },
    { name: 'howToStart', type: 'textarea' },
    confidenceField(),
    ...commonContentFields(),
  ],
}
