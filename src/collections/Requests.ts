import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * Reader-submitted feature requests: what people want the site to do that it
 * does not yet.
 *
 * Separate from Corrections on purpose. A correction says a fact is wrong and
 * is triaged against a source; a request says the site is missing something and
 * is triaged against whether it is worth building. Mixing them buries the
 * accuracy reports, which are the more urgent queue.
 *
 * Same access shape as Corrections: anyone may file one, only editors may read
 * them. A reader account is not staff, and a free-text box from the public can
 * contain anything.
 */
export const Requests: CollectionConfig = {
  slug: 'requests',
  admin: {
    group: 'Admin',
    useAsTitle: 'summary',
    defaultColumns: ['summary', 'kind', 'status', 'votes', 'createdAt'],
    description: 'What readers have asked for. Sort by votes to see what is actually wanted.',
  },
  access: {
    create: () => true,
    read: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  fields: [
    {
      name: 'summary',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: { description: 'What they want, in one line.' },
    },
    { name: 'detail', type: 'textarea', maxLength: 2000 },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'feature',
      options: [
        { label: 'New feature or tool', value: 'feature' },
        { label: 'Missing data', value: 'data' },
        { label: 'A guide we have not written', value: 'guide' },
        { label: 'Something is hard to use', value: 'usability' },
        { label: 'Something is broken', value: 'bug' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'pageUrl',
      type: 'text',
      admin: { description: 'Page the request came from, if it was sent from one.' },
    },
    {
      name: 'email',
      type: 'email',
      admin: {
        description:
          'Optional, and only for replying about this request. Never used for anything else.',
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      admin: { position: 'sidebar' },
      options: [
        { label: 'New', value: 'new' },
        { label: 'Under consideration', value: 'considering' },
        { label: 'Planned', value: 'planned' },
        { label: 'Done', value: 'done' },
        { label: 'Not planned', value: 'declined' },
      ],
    },
    {
      name: 'votes',
      type: 'number',
      defaultValue: 1,
      admin: {
        position: 'sidebar',
        description: 'Bump this when the same thing is asked for again, so the queue sorts itself.',
      },
    },
    {
      name: 'note',
      type: 'textarea',
      admin: { position: 'sidebar', description: 'Internal. Why it was planned or declined.' },
    },
  ],
}
