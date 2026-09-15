import type { CollectionConfig } from 'payload'
import { slugField, publicRead, seoGroup } from '../fields/shared'
import { APEX_ONLY } from '../proxy'
import { analyticsFields, verificationFields } from '../fields/analytics'

/**
 * A game in the network. One row here is one wiki.
 *
 * Every content record belongs to exactly one game, and every public query is
 * filtered by it — see `gameField` in `fields/shared.ts` and the scoped
 * `getAll` in `lib/payload.ts`. Deleting a row here would orphan its content
 * rather than remove it, so games are archived, never deleted.
 *
 * The slug is load-bearing in three places at once: it is the internal route
 * prefix (`/dawnwalker/quests`), the subdomain (`dawnwalker.example.com`) and
 * the folder name the image pipeline writes into. Changing it after launch
 * breaks all three, which is why the field warns about it.
 */
export const Games: CollectionConfig = {
  slug: 'games',
  admin: {
    group: 'Network',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'releaseDate', 'publisher'],
    description:
      'One row per wiki. The slug becomes the subdomain, so choose it once and leave it alone.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'The game’s full name, as its publisher writes it.' } },
    slugField({
      /*
        A game slug is also a first path segment on the apex domain, where the
        hub's own pages live. A game slugged "about" would make
        `example.com/about` ambiguous: Next.js resolves the static route first,
        so the game would simply be unreachable, with nothing anywhere saying
        why. Refusing the collision at the point of entry is the only place it
        can be explained.

        The list is imported from proxy.ts rather than retyped, so the routing
        layer and this check cannot disagree.
      */
      validate: (value) => {
        if (typeof value !== 'string' || !value) return 'A slug is required.'
        if (APEX_ONLY.has(value)) {
          return `"${value}" is a reserved path on the network's own domain. Choose another slug.`
        }
        return true
      },
    }),
    {
      name: 'shortTitle',
      type: 'text',
      admin: {
        description:
          'What to call it where the full name will not fit — navigation, cards, breadcrumbs. "Dawnwalker" for "The Blood of Dawnwalker".',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'planned',
      options: [
        { label: 'Planned — not visible to readers', value: 'planned' },
        { label: 'Building — visible, openly incomplete', value: 'building' },
        { label: 'Live', value: 'live' },
        { label: 'Archived — kept online, no longer updated', value: 'archived' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Planned games are hidden from the directory and return 404. Building games are listed and say so on the page.',
      },
    },
    {
      name: 'tagline',
      type: 'text',
      maxLength: 120,
      admin: { description: 'One line under the game’s name on the hub directory.' },
    },
    {
      name: 'summary',
      type: 'textarea',
      maxLength: 320,
      admin: { description: 'A sentence or two. Used on the directory card and as the wiki’s default meta description.' },
    },

    // --- Facts about the game itself -------------------------------------
    {
      type: 'row',
      fields: [
        { name: 'publisher', type: 'text', admin: { width: '50%' } },
        { name: 'developer', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      name: 'releaseDate',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description:
          'Verified against the publisher’s own store page, not a news article. Leave empty rather than guess — a wrong release date is the first thing a reader catches.',
      },
    },
    {
      name: 'releaseDateConfirmed',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Tick once the game is actually out, or the date is officially dated rather than a window. Unticked dates render as "expected".',
      },
    },
    {
      name: 'platforms',
      type: 'select',
      hasMany: true,
      options: ['PC', 'PlayStation 5', 'Xbox Series X|S', 'Nintendo Switch 2', 'Mac'],
    },
    {
      name: 'storeUrl',
      type: 'text',
      admin: { description: 'The official store page. Used as a source of record for the release date.' },
    },

    // --- Presentation ----------------------------------------------------
    {
      name: 'theme',
      type: 'group',
      admin: { description: 'Each wiki looks like its own site. Kept deliberately small — one accent, one image.' },
      fields: [
        {
          name: 'accent',
          type: 'text',
          admin: { description: 'CSS colour, e.g. #b33a3a. Falls back to the network accent when empty.' },
        },
        { name: 'hero', type: 'upload', relationTo: 'media', admin: { description: 'Wide key art for the wiki home and the directory card.' } },
        { name: 'logo', type: 'upload', relationTo: 'media' },
      ],
    },

    // --- Wiring ----------------------------------------------------------
    {
      name: 'subdomain',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description:
          'Host label, if it differs from the slug. Almost always leave this empty — the slug is used when it is.',
      },
    },
    {
      name: 'features',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Run checker (Dawnwalker’s 480-segment planner)', value: 'run-checker' },
        { label: 'Build planner', value: 'build-planner' },
        { label: 'Comments', value: 'comments' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Bespoke tools this game switches on. Most games have none — a tool nobody built for this game should not appear in its navigation.',
      },
    },
    {
      name: 'relatedGames',
      type: 'relationship',
      relationTo: 'games',
      hasMany: true,
      admin: {
        description:
          'Sideways links between wikis — the same series, or the obvious "if you liked this". How a new wiki gets its first traffic.',
      },
    },
    seoGroup(),
    verificationFields('game'),
    analyticsFields('game'),
  ],
}
