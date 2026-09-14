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
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional. A screenshot or piece of art for this record. Until one is set, the site falls back to its own icon, so a missing image never leaves a hole.',
      },
    },
    { name: 'court', type: 'relationship', relationTo: 'courts', required: true },
    { name: 'region', type: 'relationship', relationTo: 'regions' },
    {
      /*
        Mirrors the quests time group, including its `known` flag.

        This used to default min and max to 0, so all forty-one activities
        stored a cost of zero and nothing distinguished "nobody published this"
        from "this is genuinely free". The pages happened to read `max > 0` and
        print "Not confirmed", which was right by accident — a real zero-cost
        activity would have read the same way, and anything summing these would
        have quietly treated the lot as free.
      */
      name: 'time',
      type: 'group',
      label: 'Time cost',
      fields: [
        {
          name: 'known',
          type: 'checkbox',
          defaultValue: false,
          label: 'Cost confirmed by a source',
          admin: {
            description:
              'Leave off unless a source actually publishes a figure. An unknown cost is not a zero cost.',
          },
        },
        {
          type: 'row',
          admin: { condition: (_, siblingData) => Boolean(siblingData?.known) },
          fields: [
            { name: 'min', type: 'number', admin: { width: '50%' } },
            { name: 'max', type: 'number', admin: { width: '50%' } },
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
