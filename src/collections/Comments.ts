import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { screen, FLAG_LABELS, type Flag } from '../lib/moderation'

/**
 * Reader comments. Nothing here reaches a page without a person approving it.
 *
 * ## The two rules, and why they are enforced here rather than in the form
 *
 * **Nothing auto-publishes.** `status` is set to `pending` by a hook on every
 * write, so a crafted request that posts `status: "approved"` directly to the
 * REST API is overwritten rather than honoured. There is no trust level that
 * bypasses this and no timer that releases it.
 *
 * **Links are removed before storage, not at render.** By the time a comment
 * is a row in this table it no longer contains a URL. That means an approval
 * made carelessly — and every queue is eventually worked through carelessly —
 * still cannot publish a link, because there is no link left to publish. What
 * was sent is kept verbatim in `original`, visible to editors only, so a
 * moderator can see exactly what arrived and restore a legitimate reference by
 * hand if it deserves one.
 *
 * ## Reading
 *
 * Public reads are constrained to approved comments by the access function
 * below — Payload applies a returned `Where` as a filter, so an anonymous
 * request to `/api/comments` cannot see the queue however it is phrased. The
 * comment thread on a page fetches through that endpoint at runtime rather
 * than being baked into the static HTML, so approving a comment shows it
 * without rebuilding the site.
 */
export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    group: 'Moderation',
    useAsTitle: 'excerpt',
    defaultColumns: ['excerpt', 'status', 'spamScore', 'authorName', 'pageUrl', 'createdAt'],
    description:
      'Nothing here is public until you approve it. Sorted worst-first by spam score — work the top of the list.',
    listSearchableFields: ['body', 'authorName', 'pageUrl'],
  },
  access: {
    // Anyone may leave one.
    create: () => true,
    /*
      Editors see everything. Everyone else sees approved comments only — and
      this is a filter, not a check, so it holds no matter how the query is
      written.
    */
    read: ({ req }) => (isEditor({ req }) ? true : { status: { equals: 'approved' } }),
    update: isEditor,
    delete: isEditor,
  },
  hooks: {
    beforeValidate: [
      async ({ data, operation, req }) => {
        if (!data) return data

        // Screening runs on create, and again if an editor edits the body —
        // an editor pasting a reader's link back in should still be screened.
        const bodyChanged = typeof data.body === 'string'
        if (!bodyChanged) return data

        const result = screen(data.body as string)

        data.original = (data.original as string) ?? (data.body as string)
        data.body = result.clean
        data.removed = result.removed.map((value) => ({ value }))
        data.flags = result.flags.map((value) => ({ value }))
        data.spamScore = result.score
        data.excerpt = result.clean.slice(0, 90) || '(no text)'

        /*
          Status is forced on create and never derived from the request.
          Letting a submitted `status` through is the whole vulnerability: the
          public create endpoint would otherwise accept `approved` and publish
          instantly.
        */
        if (operation === 'create') {
          data.status = 'pending'
          data.submittedBy = req.user?.id ?? undefined

          /*
            A reply has to be a reply to something on this page.

            `parent` arrives from the same public endpoint as everything else,
            so it is an arbitrary id until checked. Nothing catastrophic
            follows from a crafted one - the thread groups within a page, so a
            foreign parent simply renders as a top-level comment - but a
            moderator reading the queue should not have to work out why a reply
            is attached to a comment on another wiki. An invalid parent is
            dropped rather than rejected: the comment itself is still worth
            keeping, it is just not a reply.
          */
          if (data.parent) {
            const parentId = typeof data.parent === 'object' ? data.parent.id : data.parent
            const found = await req.payload
              .findByID({
                collection: 'comments',
                id: parentId as string,
                depth: 0,
                overrideAccess: true,
              })
              .catch(() => null)

            const sharesPage = found && found.pageUrl === data.pageUrl
            const isRoot = found && !found.parent
            data.parent = sharesPage && isRoot ? parentId : undefined
          }
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'excerpt',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'Generated. The first line of the screened body, so the list is readable.',
      },
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      maxLength: 4000,
      admin: {
        description:
          'The comment as it may be published. Links have already been removed — see Original below for what was actually sent.',
      },
    },
    {
      name: 'authorName',
      type: 'text',
      maxLength: 60,
      admin: { description: 'What the reader called themselves. Not verified.' },
    },
    {
      /*
        One level of replies, and only one.

        A flat list turns every disagreement into people quoting each other by
        name, which is how a thread stops being readable. Unlimited nesting is
        the other failure: past about three levels the indent eats the column
        on a phone and the argument at the bottom is four words wide. One level
        is the shape that stays legible, so a reply to a reply attaches to the
        same top-level comment rather than indenting further.

        A reply goes through the same moderation queue as anything else. It is
        a comment with a parent, not a privileged kind of post.
      */
      name: 'parent',
      type: 'relationship',
      relationTo: 'comments',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Set when this is a reply. Replies are moderated like any other comment.',
      },
    },
    {
      name: 'pageUrl',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The page this belongs under. Comments are fetched by this.' },
    },
    {
      name: 'game',
      type: 'relationship',
      relationTo: 'games',
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Which wiki it came from. Comments are not game-scoped like content is — the queue is one queue, because a moderator works all of them in one sitting.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending — not visible to anyone', value: 'pending' },
        { label: 'Approved — live on the page', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Spam', value: 'spam' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Only Approved is public. Everything arrives as Pending.',
      },
    },
    {
      name: 'spamScore',
      type: 'number',
      min: 0,
      max: 100,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Generated, 0–100. An ordering for the queue, not a verdict.',
      },
    },
    {
      name: 'flags',
      type: 'array',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Why this was worth a second look.',
      },
      fields: [{ name: 'value', type: 'text' }],
    },
    {
      name: 'removed',
      type: 'array',
      admin: {
        readOnly: true,
        description:
          'Taken out before the comment was stored. Shown so you can judge it; it is not on the page and approving does not put it back.',
      },
      fields: [{ name: 'value', type: 'text' }],
    },
    {
      name: 'original',
      type: 'textarea',
      admin: {
        readOnly: true,
        description: 'Exactly what was submitted, before screening. Editors only.',
      },
    },
    {
      name: 'submittedBy',
      type: 'relationship',
      relationTo: 'players',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Set when the reader was signed in. Most comments are anonymous.',
      },
    },
    {
      name: 'moderatorNote',
      type: 'textarea',
      admin: { description: 'Internal. Never shown publicly.' },
    },
  ],
}

/** The plain-language reason for a flag, for the admin and the queue. */
export const flagLabel = (flag: string): string => FLAG_LABELS[flag as Flag] ?? flag
