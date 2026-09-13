import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Admin' },
  access: { read: () => true },
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
          'Attribution. Game screenshots and art belong to Bandai Namco / Rebel Wolves — credit them.',
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
