import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { notifyOfReport } from '../lib/email-notify'

/**
 * Reader-submitted corrections. Anyone may file one; only signed-in editors can
 * read or resolve them. This is the mechanism that turns the site's biggest
 * weakness — data compiled without access to the game — into something that
 * improves over time.
 */
export const Corrections: CollectionConfig = {
  slug: 'corrections',
  admin: {
    group: 'Moderation',
    useAsTitle: 'summary',
    defaultColumns: ['summary', 'status', 'pageUrl', 'createdAt'],
    description: 'Reader reports. Triage these — they are the accuracy loop.',
  },
  access: {
    // Anyone may file one. Only editors may read or triage them — a reader
    // account is not staff, and reports can contain whatever someone typed.
    create: () => true,
    read: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  hooks: {
    /*
      The site invites corrections on every page and promises they "go straight
      to our review queue". For as long as this collection has existed the
      record was written, the reader was thanked, and nobody was told — the
      queue was only ever seen by somebody opening the admin.

      `create` only. An `afterChange` with no operation guard also fires when
      an editor changes the status, which would mail a notification every time
      somebody triaged one — the exact noise that gets a notification filtered
      away, and it would arrive addressed to the person who caused it.

      Awaited, and deliberately. Fire-and-forget would return the reader's
      confirmation a few hundred milliseconds sooner and risks the send being
      cut off when the process is frozen after the response goes out, which
      loses the email for the same "nothing errored" reason everything else in
      this file is written against. `notifyOfReport` never throws, so this
      cannot fail the write: the report is the valuable thing and the email is
      a courtesy.
    */
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return
        await notifyOfReport(req.payload, {
          collection: 'corrections',
          kind: 'correction',
          id: doc.id,
          /* Summary first: it becomes the subject line. */
          fields: [
            ['Summary', doc.summary],
            ['Detail', doc.detail],
            ['Page', doc.pageUrl],
            ['Source offered', doc.sourceUrl],
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
      admin: { description: 'What the reader says is wrong.' },
    },
    { name: 'detail', type: 'textarea', maxLength: 2000 },
    {
      name: 'pageUrl',
      type: 'text',
      admin: { description: 'Page the report came from.' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: { description: 'Evidence the reader offered, if any.' },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Confirmed — fixed', value: 'fixed' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Needs the game to verify', value: 'blocked' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'editorNote',
      type: 'textarea',
      admin: { position: 'sidebar', description: 'Internal. Never shown publicly.' },
    },
  ],
}
