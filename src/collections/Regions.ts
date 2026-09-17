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
      /*
        The place this place is inside.

        Dawnwalker's ten regions are a flat list, which is why this was not
        here. Every other wiki's is a hierarchy and says so in its own
        infoboxes: the Ashtray Maze is in the Research Sector, which is in the
        Oldest House. Seventy-two `location` and `sector` values were sitting
        in the harvest with nowhere to go, so `pnpm seed:entity-links` matched
        them against nothing and counted them as unmatched.

        Single, not hasMany: a place is inside one place. Where a source names
        two, that is a source conflict or a move, and the link is left empty
        rather than picking one — the same rule the harvested `residence` with
        two towns in it already follows.
      */
      name: 'parent',
      type: 'relationship',
      relationTo: 'regions',
      label: 'Inside',
      admin: {
        description:
          'The larger place this one is part of, where a source states it. Leave empty rather than guessing at a hierarchy.',
      },
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
