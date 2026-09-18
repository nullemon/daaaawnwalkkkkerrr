import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { notifyOfReport } from '../lib/email-notify'

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
    group: 'Moderation',
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
  /*
    Notified exactly like Corrections, and that was a decision rather than a
    copy-paste.

    The argument for leaving it out is that a feature request is not urgent and
    the site promises nothing about one, where `/contact` promises a correction
    goes "straight to our review queue". The argument that wins is the `kind`
    list below: **"Something is broken" is one of the options a reader can
    pick**, and a broken page reported into a queue nobody is told about stays
    broken for exactly as long as it takes somebody to open the admin. Sorting
    the urgent ones out of an unread queue is not possible; sorting them out of
    an inbox is.

    It also costs the operator nothing to run: both collections resolve the
    same recipient from the same field, so there is no second thing to
    configure and no second thing to forget.

    Volume is the reason this stays one message per report rather than becoming
    a digest for both — see the note at the top of `lib/email-notify.ts`, which
    is also where to change it.
  */
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return
        await notifyOfReport(req.payload, {
          collection: 'requests',
          kind: 'request',
          id: doc.id,
          /*
            The reader's address is included because replying about this
            request is the only thing they gave it for, and it is said so on
            the field. It goes to the operator's own inbox and nowhere else.
          */
          fields: [
            ['Summary', doc.summary],
            ['Kind', doc.kind],
            ['Detail', doc.detail],
            ['Page', doc.pageUrl],
            ['Reply to', doc.email],
          ],
        })
      },
    ],
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
