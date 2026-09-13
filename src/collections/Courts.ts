import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/**
 * The three vampiric vassals of Brencis — Ambrus, Bakir and Xanthe. Angering a
 * vassal through Court Activities is the game's main progression track, so a
 * court is both an NPC and a progress meter.
 */
export const Courts: CollectionConfig = {
  slug: 'courts',
  labels: { singular: 'Court', plural: 'Courts' },
  admin: {
    group: 'World',
    useAsTitle: 'title',
    defaultColumns: ['title', 'activityCount', 'confidence', 'updatedAt'],
    description: 'The three vassal courts. Court Activities hang off these.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'e.g. "Ambrus"' } },
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
      name: 'activityCount',
      type: 'number',
      admin: { description: 'Total Court Activities in this court.' },
    },
    {
      name: 'angerThresholdPct',
      type: 'number',
      admin: {
        description:
          'Roughly what share of this court\'s activities must be completed before the duel unlocks. Reported as ~75%, unconfirmed.',
      },
    },
    {
      name: 'bossEnemy',
      type: 'relationship',
      relationTo: 'enemies',
      admin: { description: 'The duel at the end of this court.' },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
