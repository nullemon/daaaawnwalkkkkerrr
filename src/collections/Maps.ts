import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, sourcesField, seoGroup, publicRead } from '../fields/shared'

/**
 * Interactive maps, and the things marked on them.
 *
 * ## What this is for
 *
 * The sites people actually use for locations — mapgenie, gamermaps — are a
 * base image plus a few hundred pins, each with a category and a link to what
 * it is. That is the whole model, and it is a far better fit for a database
 * than for a wiki page: a wiki writes "the amulet is in the north-west of the
 * glen", a map puts a pin on the glen.
 *
 * ## The part that is not built here, deliberately
 *
 * A marker's position is a fact like any other on this site, and nobody has
 * published one for these games. Four of the eight are not out; you cannot
 * know where an item is until somebody has played far enough to find it, and
 * a plausible-looking pin is worse than no pin because a reader will walk to
 * it. So this collection ships with base maps where a source published one
 * and with no invented markers at all.
 *
 * `markerSource` is required on every marker for exactly that reason. It is
 * the same rule as `src/seed/import.ts` rejecting a record with no source
 * URL, applied to the one field on this site somebody would most be tempted
 * to eyeball.
 *
 * Markers are added through the admin — the placement editor writes x and y
 * for you — or through `pnpm remote` once a game ships and locations are
 * published.
 */
export const Maps: CollectionConfig = {
  slug: 'maps',
  labels: { singular: 'Map', plural: 'Maps' },
  admin: {
    group: 'Editorial',
    useAsTitle: 'title',
    defaultColumns: ['title', 'game', 'confidence', 'updatedAt'],
    description:
      'A base image plus pins. A pin needs a source saying where the thing is — see the note on Marker source.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'The base map. Everything else is positioned as a percentage of this image, so replacing it with a differently-cropped one moves every pin.',
      },
    },
    {
      name: 'summary',
      type: 'textarea',
      admin: {
        description:
          'One or two sentences. Shown under the title and used as the meta description.',
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 100,
      admin: { position: 'sidebar', description: 'Lower sorts first in the maps index.' },
    },
    {
      /*
        Categories are per map rather than a fixed global list.

        A fixed list would be Dawnwalker's — quests, courts, perks — and would
        be wrong on every other wiki, the same way the fixed section list was
        before `sectionsFor` replaced it. A shooter's map wants ammo, cover and
        spawns; a Plague Tale map wants chapters and collectibles.
      */
      name: 'categories',
      type: 'array',
      label: 'Marker categories',
      admin: {
        description:
          'The filter buttons above the map. Define these first — a marker picks one of them.',
      },
      fields: [
        { name: 'key', type: 'text', required: true, admin: { description: 'Short id, e.g. "collectible". Used in the URL when a category is filtered.' } },
        { name: 'label', type: 'text', required: true },
        {
          name: 'colour',
          type: 'text',
          admin: { description: 'CSS colour for the pin. Leave blank for the site accent.' },
        },
      ],
    },
    {
      /*
        The placement editor, above the array it writes into.

        A UI field renders a component and stores nothing itself, which is
        exactly right here: the pins it creates are ordinary rows in `markers`
        below, editable and deletable there like any other.
      */
      name: 'placeMarkers',
      type: 'ui',
      label: 'Place markers',
      admin: { components: { Field: '@/components/admin/MarkerPlacer' } },
    },
    {
      name: 'markers',
      type: 'array',
      admin: {
        description:
          'Each pin. Use the placement editor on the map above rather than typing coordinates.',
        initCollapsed: true,
      },
      fields: [
        { name: 'label', type: 'text', required: true },
        {
          name: 'category',
          type: 'text',
          admin: { description: 'One of the category keys defined above.' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'x',
              type: 'number',
              required: true,
              min: 0,
              max: 100,
              admin: { width: '50%', description: 'Percent from the left edge.' },
            },
            {
              name: 'y',
              type: 'number',
              required: true,
              min: 0,
              max: 100,
              admin: { width: '50%', description: 'Percent from the top edge.' },
            },
          ],
        },
        {
          name: 'note',
          type: 'textarea',
          admin: { description: 'What a reader needs once they are standing there.' },
        },
        {
          /*
            The record this pin is. Optional, because a map marks things that
            have no page of their own — a shortcut, a vantage point — but where
            there is a record the pin should link to it rather than restate it.
          */
          name: 'record',
          type: 'relationship',
          relationTo: ['items', 'enemies', 'characters', 'regions', 'quests'],
          admin: { description: 'Optional. Links the pin to the page for that thing.' },
        },
        {
          name: 'markerSource',
          type: 'text',
          required: true,
          label: 'Marker source',
          admin: {
            description:
              'Where this position came from — a URL, a video with a timestamp, or a named person who found it. Required, and not bureaucracy: a pin is a claim that a reader will walk to, and an unsourced one is the most expensive kind of guess this site could print.',
          },
        },
      ],
    },
    confidenceField(),
    sourcesField(),
    seoGroup(),
  ],
}
