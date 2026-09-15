import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/**
 * Achievements and trophies.
 *
 * The first section a new wiki can fill honestly.
 *
 * Everything else a game wiki wants — where an item is, how a boss is beaten,
 * what a quest branches into — needs somebody to have played the game. On the
 * day a game ships, nobody has, and writing those pages anyway from trailers is
 * how every other new wiki starts and exactly what this network is not for.
 *
 * The achievement list is different. It is published by the developer, it is
 * complete from launch day, every entry carries an official name, description
 * and icon, and Steam publishes the share of owners who have each one. That
 * last figure is the thing readers actually search for: "0.4% of players have
 * this" is what makes an achievement worth a page, and it is a fact rather
 * than an opinion.
 *
 * So a wiki opens with fifty real pages instead of five invented ones, and
 * `howTo` stays empty until somebody can fill it from having done it.
 */
export const Achievements: CollectionConfig = {
  slug: 'achievements',
  labels: { singular: 'Achievement', plural: 'Achievements' },
  admin: {
    group: 'Progression',
    useAsTitle: 'title',
    defaultColumns: ['title', 'rarity', 'globalPercent', 'confidence', 'updatedAt'],
    description:
      'Achievements and trophies. Seeded from the developer’s own list; the "how to get it" is written by us and starts empty.',
    listSearchableFields: ['title', 'description'],
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description:
          'The developer’s own description, verbatim. Some are deliberately blank — a hidden achievement has no description until you unlock it, and inventing one would be a spoiler we made up.',
      },
    },
    {
      name: 'icon',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'The official icon.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'globalPercent',
          type: 'number',
          min: 0,
          max: 100,
          admin: {
            width: '50%',
            description:
              'Share of owners who have unlocked it, as the platform reports it. Moves over time; the retrieved date on the source says when this was read.',
          },
        },
        {
          name: 'rarity',
          type: 'select',
          admin: {
            width: '50%',
            description: 'Derived from the percentage when seeded. Editable if you disagree.',
          },
          options: [
            { label: 'Common — more than half of players', value: 'common' },
            { label: 'Uncommon — a quarter to a half', value: 'uncommon' },
            { label: 'Rare — one in ten to one in four', value: 'rare' },
            { label: 'Very rare — one in twenty to one in ten', value: 'very-rare' },
            { label: 'Ultra rare — fewer than one in twenty', value: 'ultra-rare' },
          ],
        },
      ],
    },
    {
      name: 'hidden',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'A hidden achievement, whose name or description the game withholds until you earn it.',
      },
    },
    {
      name: 'missable',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Can be permanently missed in a playthrough. Only tick this when a source says so — it is the single most consequential claim on the page, because a reader plans a run around it.',
      },
    },
    {
      name: 'howTo',
      type: 'textarea',
      maxLength: 2000,
      admin: {
        description:
          'How to actually get it, in our own words. Leave empty until somebody has done it — an empty field reads as a gap, a guessed one reads as a lie.',
      },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}

/**
 * The band a global unlock percentage falls into.
 *
 * Shared with the seed so the two cannot disagree. The boundaries are the
 * conventional ones every achievement tracker uses, which matters more than
 * whether they are optimal: a reader who knows what "ultra rare" means
 * elsewhere should find it means the same here.
 */
export const rarityFor = (percent: number | null | undefined): string | undefined => {
  if (percent === null || percent === undefined) return undefined
  if (percent > 50) return 'common'
  if (percent > 25) return 'uncommon'
  if (percent > 10) return 'rare'
  if (percent > 5) return 'very-rare'
  return 'ultra-rare'
}
