import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Admin' },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isEditor },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: { description: 'Describe the image for screen readers and search engines.' },
    },
    { name: 'caption', type: 'text' },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description:
          'Attribution. Every screenshot and piece of key art on this network belongs to the game’s publisher — name them. The seed fills this in for art it downloads.',
      },
    },
  ],
  upload: {
    imageSizes: [
      { name: 'thumb', width: 320, height: 320, position: 'centre' },
      { name: 'card', width: 768 },
      { name: 'hero', width: 1600 },
    ],
    adminThumbnail: 'thumb',
    mimeTypes: ['image/*'],
  },
}
