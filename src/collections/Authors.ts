import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Who wrote a guide.
 *
 * Search guidance asks who is behind a page and what makes them worth reading,
 * and a byline is the mechanism for answering it. That only works if the person
 * is real: an invented expert with invented credentials is the thing the
 * guidance exists to catch, and it misleads the reader besides.
 *
 * So this collection ships the same way the legal details do. Seeded authors
 * are placeholders with `provisional` ticked, which makes every byline and
 * profile carry a visible notice, and the switch is what an editor turns off
 * once a real person's name and biography are in the record. See
 * `docs/DATA.md` and the `legalProvisional` pattern it mirrors.
 */
export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'provisional', 'updatedAt'],
    description:
      'Bylines for guides. Replace the seeded placeholders with real people before launch and untick "provisional" on each.',
  },
  access: publicRead,
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField(),
    {
      name: 'provisional',
      type: 'checkbox',
      defaultValue: true,
      label: 'Placeholder — not a real person yet',
      admin: {
        position: 'sidebar',
        description:
          'Ticked means every page carrying this byline says so out loud. Untick it only when the name, biography and credentials below belong to a real person who agreed to them.',
      },
    },
    {
      name: 'role',
      type: 'text',
      admin: { description: 'How they are described under the byline, e.g. "Routing and endings".' },
    },
    {
      name: 'bio',
      type: 'textarea',
      maxLength: 600,
      admin: {
        description:
          'Why this person is worth reading on this subject. Specific beats flattering — what they have actually done with the game.',
      },
    },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    {
      name: 'links',
      type: 'array',
      admin: { description: 'Somewhere a reader can verify the person exists.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
  ],
}
