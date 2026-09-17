import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

export const Characters: CollectionConfig = {
  slug: 'characters',
  admin: {
    group: 'World',
    useAsTitle: 'title',
    defaultColumns: ['title', 'role', 'romanceable', 'confidence', 'updatedAt'],
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'Protagonist', value: 'protagonist' },
        { label: 'Ally', value: 'ally' },
        { label: 'Vassal', value: 'vassal' },
        { label: 'Antagonist', value: 'antagonist' },
        { label: 'Merchant', value: 'merchant' },
        { label: 'Minor', value: 'minor' },
      ],
    },
    { name: 'romanceable', type: 'checkbox', defaultValue: false },
    {
      name: 'region',
      type: 'relationship',
      relationTo: 'regions',
      admin: { description: 'Where they are usually found.' },
    },
    {
      /*
        The organisations they belong to.

        The edge lives here rather than as a `members` list on the faction,
        for the same reason the actor lives on the person: one copy of a fact
        cannot disagree with itself. A list on the faction would keep naming a
        character long after the character was corrected, moved or deleted,
        and nothing would error.

        hasMany, and the distinction from `region` is the whole point. This
        shipped single for a day and refused 124 of the harvest's affiliation
        rows as ambiguous, which was the wrong reading of them: "Galactic
        Republic, Grand Army of the Republic, Zero Company" is not a source
        contradicting itself, it is three memberships that are true at once.
        A residence naming two towns genuinely is a coin flip — somebody lives
        in one of them and the other is a move or a timeline — so that field
        stays single and still refuses. Two affiliations are not that case.

        What is still refused: a qualified fragment. "COG (Formerly)" is a
        membership that ended, and writing it plain would turn "used to serve"
        into "serves", which is a fact no source states.
      */
      name: 'faction',
      type: 'relationship',
      relationTo: 'factions',
      hasMany: true,
      admin: { description: 'The organisations they belong to, as their sources name them.' },
    },
    {
      name: 'questline',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
      admin: { description: 'Their questline, in order. Drives ally-gated endings.' },
    },
    { name: 'portrait', type: 'upload', relationTo: 'media' },
    confidenceField(),
    ...commonContentFields(),
  ],
}
