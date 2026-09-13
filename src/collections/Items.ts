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
