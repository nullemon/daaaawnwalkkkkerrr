import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/**
 * The seven endings. `requiredQuests` is the whole basis of the run checker:
 * minimum segment cost and latest viable start day are computed from that
 * chain at build time rather than stored, so they can never drift out of sync
 * with the quest records.
 */
export const Endings: CollectionConfig = {
  slug: 'endings',
  admin: {
    group: 'Run',
    useAsTitle: 'title',
    defaultColumns: ['title', 'gate', 'ally', 'confidence', 'updatedAt'],
    description: 'Seven endings, gated three ways: by an ally, by a choice, or by the clock.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'gate',
      type: 'select',
      required: true,
      options: [
        { label: 'Ally — requires a questline', value: 'ally' },
        { label: 'Choice — decided at the end', value: 'choice' },
        { label: 'Clock — decided by running out of time', value: 'clock' },
      ],
    },
    {
      name: 'ally',
      type: 'relationship',
      relationTo: 'characters',
      admin: {
        description: 'The ally whose questline gates this ending.',
        condition: (data) => data?.gate === 'ally',
      },
    },
    {
      name: 'requiredQuests',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
      admin: {
        description:
          'Everything that must be completed to reach this ending. The checker walks prereqs from here, so listing only the questline itself is enough.',
      },
    },
    {
      name: 'isFailure',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'True for "Time Runs Out" — reached by missing the deadline, not by choosing.' },
    },
    {
      name: 'isEarlyExit',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'True for endings that close the run early, before the Brencis confrontation.' },
    },
    { name: 'howToGet', type: 'textarea', admin: { description: 'The short answer, above the fold.' } },
    confidenceField(),
    ...commonContentFields(),
  ],
}
