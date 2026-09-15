import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/** Editorial long-form aimed at specific search queries. */
export const Guides: CollectionConfig = {
  slug: 'guides',
  admin: {
    group: 'Editorial',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'targetQuery', 'updatedAt'],
  },
  access: publicRead,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'targetQuery',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'The search this page is written to answer. One page, one query.',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: {
        position: 'sidebar',
        description: 'Who is answerable for this page. Shown as a byline with a link to their profile.',
      },
    },
    {
      name: 'updated',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly' },
        description:
          'Shown as "last checked". A guide to a live game goes stale, and saying when it was last looked at is more use than hiding it.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Lead image. Shown at the top of the article, on the guides index and on the home page cards, and used as the social preview.',
      },
    },
    {
      /*
        Pictures inside the article, as opposed to the lead image above it.
        Rendered as a figure row partway down the page.

        Kept as its own field rather than as upload nodes inside the body,
        because the body is written in src/seed/raw as plain strings and a
        Lexical upload node needs a media id that does not exist until after
        the import has run.
      */
      name: 'bodyImages',
      type: 'array',
      label: 'Images inside the article',
      admin: { description: 'Shown together partway down the page, under a heading of your choosing.' },
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text', admin: { description: 'Printed under the picture.' } },
      ],
    },
    {
      name: 'bodyImagesHeading',
      type: 'text',
      defaultValue: 'What you are looking for',
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.bodyImages?.length),
        description: 'Heading above the in-article images.',
      },
    },
    {
      name: 'relatedQuests',
      type: 'relationship',
      relationTo: 'quests',
      hasMany: true,
    },
    {
      name: 'relatedEndings',
      type: 'relationship',
      relationTo: 'endings',
      hasMany: true,
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
