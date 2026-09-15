import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * The image library, shared across the whole network.
 *
 * Deliberately not scoped to a game. A piece of key art appears on its wiki's
 * home, on the hub's directory card and in an open-graph image, and uploading
 * it three times would mean correcting its credit three times.
 *
 * The cost is that the library gets long, which is what `listSearchableFields`
 * and the thumbnail column below are for.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Network',
    useAsTitle: 'alt',
    // Thumbnail first: nobody identifies an image from its filename.
    defaultColumns: ['filename', 'alt', 'credit', 'updatedAt'],
    description:
      'Every image on the network. Shared across all wikis, so upload once and reference it anywhere.',
    listSearchableFields: ['alt', 'filename', 'credit', 'caption'],
    pagination: { defaultLimit: 50, limits: [25, 50, 100] },
  },
  access: { read: () => true, create: isEditor, update: isEditor, delete: isEditor },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description:
          'What the image shows, for screen readers and search engines. Required — an image with no alt text is invisible to a third of the reasons we publish it. Describe the subject, do not repeat the page title.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        description: 'Optional. Printed under the image where one is shown with a caption.',
      },
    },
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
    /*
     * Three sizes, because the same image is used at three scales and shipping
     * a 1600px hero into a 320px card is the single easiest way to lose the
     * page-speed advantage this network is built on.
     */
    imageSizes: [
      { name: 'thumb', width: 320, height: 320, position: 'centre' },
      { name: 'card', width: 768 },
      { name: 'hero', width: 1600 },
    ],
    adminThumbnail: 'thumb',
    mimeTypes: ['image/*'],
    focalPoint: true,
  },
}
