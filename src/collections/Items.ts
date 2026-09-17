import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

export const Items: CollectionConfig = {
  slug: 'items',
  admin: {
    group: 'Character',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'rarity', 'region', 'confidence'],
    description: 'Legendaries, manuals, recipes and key items — not every one of the 1,700+ pickups.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Weapon', value: 'weapon' },
        { label: 'Armour', value: 'armour' },
        { label: 'Ring', value: 'ring' },
        { label: 'Manual', value: 'manual' },
        { label: 'Recipe', value: 'recipe' },
        { label: 'Consumable', value: 'consumable' },
        { label: 'Ingredient', value: 'ingredient' },
        { label: 'Quest item', value: 'quest' },
      ],
    },
    {
      name: 'rarity',
      type: 'select',
      options: [
        { label: 'Legendary', value: 'legendary' },
        { label: 'Rare', value: 'rare' },
        { label: 'Common', value: 'common' },
      ],
    },
    { name: 'region', type: 'relationship', relationTo: 'regions' },
    {
      // Whose equipment it is. Harvested weapon infoboxes state this more
      // often than they state where the thing is found, and they routinely
      // name several — a rifle fielded by the COG and by its Army is one
      // rifle with two users. See the note on `faction` in Characters.ts.
      name: 'faction',
      type: 'relationship',
      relationTo: 'factions',
      hasMany: true,
      admin: { description: 'The organisations that field it, as its sources name them.' },
    },
    {
      /*
        Why an item has no region, so the index can say something true instead
        of a dash. Most items genuinely have no single region: a herb that grows
        "across the map" is not missing a location, and a quest reward handed to
        you at the end of a chain never had one. Leaving those blank made the
        page read as unfinished research when the research was in fact complete.

        Set this from what the sourced `howToGet` prose already says. It
        classifies our own text; it never asserts anything a source did not.
        Where a fixed world location exists but nobody has published which
        region holds it, the honest value is `world` with `region` left unset.
      */
      name: 'acquisition',
      type: 'select',
      admin: {
        description:
          'How it is obtained. Explains an empty region rather than leaving the index blank.',
      },
      options: [
        { label: 'Fixed world location', value: 'world' },
        { label: 'Quest reward', value: 'quest-reward' },
        { label: 'Bought from a merchant', value: 'merchant' },
        { label: 'Enemy or boss drop', value: 'drop' },
        { label: 'Gathered across the map', value: 'gathered' },
        { label: 'Crafted', value: 'crafted' },
      ],
    },
    { name: 'howToGet', type: 'textarea', admin: { description: 'Where it is and what it takes to reach it.' } },
    {
      name: 'stats',
      type: 'array',
      admin: { description: 'Named stat lines, e.g. "Attack stamina cost −12%".' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
      ],
    },
    { name: 'image', type: 'upload', relationTo: 'media' },
    confidenceField(),
    ...commonContentFields(),
  ],
}
