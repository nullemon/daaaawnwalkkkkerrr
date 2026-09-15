import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/**
 * The core collection. Everything the run checker knows about the 480-segment
 * budget is derived from these records, so the relationship fields here are
 * load-bearing: they are the edges of the prerequisite graph, not decoration.
 */
export const Quests: CollectionConfig = {
  slug: 'quests',
  admin: {
    group: 'Progression',
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'region', 'phase', 'confidence', 'updatedAt'],
    description:
      'Quests and their time costs. Prereqs and exclusions here drive the run checker — keep them accurate.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'side',
      options: [
        { label: 'Main', value: 'main' },
        { label: 'Ally questline', value: 'ally' },
        { label: 'Court activity', value: 'court' },
        { label: 'Side', value: 'side' },
        { label: 'Contract', value: 'contract' },
        { label: 'Prologue', value: 'prologue' },
      ],
    },
    { name: 'region', type: 'relationship', relationTo: 'regions' },
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
      admin: { description: 'Set when this quest angers a specific vassal.' },
    },
    {
      name: 'time',
      type: 'group',
      label: 'Time cost',
      admin: {
        description:
          'In segments. A full run is 480 (30 days × 16). Leave min/max equal when the cost is fixed.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'min', type: 'number', defaultValue: 0, admin: { width: '33%' } },
            { name: 'max', type: 'number', defaultValue: 0, admin: { width: '33%' } },
            {
              name: 'confidence',
              type: 'select',
              defaultValue: 'low',
              admin: { width: '34%' },
              options: [
                { label: 'High', value: 'high' },
                { label: 'Medium', value: 'medium' },
                { label: 'Low', value: 'low' },
              ],
            },
          ],
        },
        {
          name: 'known',
          type: 'checkbox',
          defaultValue: false,
          label: 'Cost confirmed',
          admin: {
            description:
              'Tick only when a source actually publishes this cost. Unticked means unknown — which is different from free, and the run checker reports it as a floor.',
          },
        },
        {
          name: 'note',
          type: 'text',
          admin: { description: 'e.g. "Costs 2 extra segments if you take the shrine option."' },
        },
      ],
    },
    {
      name: 'phase',
      type: 'select',
      required: true,
      defaultValue: 'either',
      options: [
        { label: 'Day only', value: 'day' },
        { label: 'Night only', value: 'night' },
        { label: 'Either', value: 'either' },
      ],
      admin: { description: 'Some steps can only be taken as a human, others only as a vampire.' },
    },
    {
      name: 'prereqs',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
      admin: { description: 'Must be finished before this one opens. The checker walks these transitively.' },
    },
    {
      name: 'unlocks',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
      admin: { description: 'Opens up once this is done. Used for internal linking.' },
    },
    {
      name: 'excludes',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
      admin: {
        description:
          'Permanently locked out by doing this one. The checker treats these as hard failures.',
      },
    },
    {
      name: 'affectsEndings',
      type: 'relationship',
      relationTo: 'endings',
      hasMany: true,
    },
    {
      name: 'rewards',
      type: 'array',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'item',
          options: [
            { label: 'Item', value: 'item' },
            { label: 'Perk', value: 'perk' },
            { label: 'Skill point', value: 'skillPoint' },
            { label: 'Currency', value: 'currency' },
            { label: 'Story', value: 'story' },
          ],
        },
        { name: 'label', type: 'text', required: true },
        { name: 'item', type: 'relationship', relationTo: 'items' },
      ],
    },
    {
      name: 'corruption',
      type: 'number',
      admin: { description: 'Corruption gained or lost. Negative values reduce it.' },
    },
    {
      name: 'infamy',
      type: 'number',
      admin: { description: 'Infamy gained. Drives Brencis’s Edicts.' },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
