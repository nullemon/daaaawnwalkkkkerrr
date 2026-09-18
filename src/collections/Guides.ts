import type { CollectionConfig, Field } from 'payload'
import {
  slugField,
  confidenceField,
  seoGroup,
  sourcesField,
  summaryField,
  publicRead,
} from '../fields/shared'

/**
 * Editorial long-form aimed at specific search queries.
 *
 * ## Why this collection does not use `commonContentFields()`
 *
 * Every other content collection spreads that helper and gets summary, body,
 * sources and SEO in one line. A guide takes the same four fields and files
 * them on different tabs — the body with the pictures, the sources with the
 * byline and the dates — so they are named individually here. The helpers
 * themselves are still the source of each field's shape, so a change to
 * `sourcesField()` still reaches this collection; only the ordering is local.
 *
 * ## Why the edit screen is tabbed
 *
 * A guide carries more than twice what a quest does — an article, two sets of
 * pictures, a byline, two dates, a review statement, citations and search
 * overrides — and as one column it was a screen nobody scrolled to the bottom
 * of. `src/fields/gameCopy.ts` uses the same unnamed-`tabs` pattern: every
 * field keeps its own top-level name, so the stored shape is identical to
 * declaring them flat and nothing downstream has to know the tabs exist.
 *
 * Sidebar fields stay outside the tabs. `admin.position: 'sidebar'` has no
 * meaning inside a tab, and `scopedToGame` reaches into this array by name to
 * unset `slug`'s global unique flag — a slug hidden inside a tab would be
 * missed, and the compound (game, slug) index would never take over.
 *
 * ## Dates
 *
 * `createdAt` and `updatedAt` exist on every row and neither is publishable.
 * See `src/lib/guide-dates.ts` for why: `updatedAt` moves when a seeder
 * rewrites a row, and `createdAt` is the date of the last `pnpm db:reset`
 * rather than of publication. Both would state something false on every guide
 * on the network, which is the one thing this site cannot afford to do.
 */

/**
 * Publication and review, as fields an editor fills in.
 *
 * Split out for reading, not for structure — these all sit on the Provenance
 * tab and all store at the top level.
 */
const provenanceFields = (): Field[] => [
  {
    name: 'author',
    type: 'relationship',
    relationTo: 'authors',
    admin: {
      description:
        'Who is answerable for this page. Shown as a byline under the title and again at the foot, linked to their profile. Blank prints the fallback byline from Site settings instead.',
    },
  },
  {
    name: 'published',
    type: 'date',
    admin: {
      date: { pickerAppearance: 'dayOnly' },
      description:
        'The day this article went up. Shown to readers and given to search engines. Blank shows no publication date at all — the row timestamps are not used as a stand-in, because they move on every rebuild and would claim a date nobody published on.',
    },
  },
  {
    name: 'updated',
    type: 'date',
    admin: {
      date: { pickerAppearance: 'dayOnly' },
      description:
        'Shown as "last checked". Set it when somebody actually re-read the sources. A guide to a live game goes stale, and saying when it was last looked at is more use than hiding it. Blank shows nothing rather than repeating the publication date.',
    },
  },
  {
    /*
      The fact-check statement.

      Blank by default and blank on every guide today, because no fact check
      has happened yet. There is deliberately no site-wide default here: a
      stock "fact checked by our editorial team" printed under four hundred
      articles nobody has read would be the invented claim this whole project
      exists to avoid — and it would be invented in the one place a reader
      goes precisely because they want to know whether to trust the page.

      Each part renders only when it is filled in. An empty reviewer prints
      nothing, not "Reviewed by —", for the same reason `FactPanel` drops a
      fact with no value: a row of dashes says "we did not do the work" about
      work nobody claimed to have done.
    */
    name: 'review',
    type: 'group',
    label: 'Fact check',
    admin: {
      description:
        'Filled in after a real fact check, never before. Everything here is blank by default and renders nothing while it stays blank — there is no default sentence, because a site-wide "fact checked" would be a claim about work nobody has done.',
    },
    fields: [
      {
        name: 'statement',
        type: 'textarea',
        maxLength: 320,
        admin: {
          description:
            'One or two sentences saying what was checked and against what. Blank hides the whole fact-check block.',
        },
      },
      {
        name: 'reviewer',
        type: 'relationship',
        relationTo: 'authors',
        admin: {
          description:
            'Who did the check, if it was somebody other than the author. Blank prints no reviewer line.',
        },
      },
      {
        name: 'checkedOn',
        type: 'date',
        label: 'Checked on',
        admin: {
          date: { pickerAppearance: 'dayOnly' },
          description: 'The day the check was done. Blank prints no date beside the statement.',
        },
      },
    ],
  },
  sourcesField(),
]

export const Guides: CollectionConfig = {
  slug: 'guides',
  admin: {
    group: 'Editorial',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'targetQuery', 'published', 'updatedAt'],
  },
  access: publicRead,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      /*
        The deck under the headline.

        A field rather than something composed in the route, for the reason
        CLAUDE.md gives about sentences in components: a subtitle written into
        `[game]` would be served on all eight wikis. Optional, and blank means
        nothing rather than a derived stand-in — the summary already does the
        job of a one-line description, and printing it twice under the title is
        not a subtitle, it is an echo.
      */
      name: 'subtitle',
      type: 'text',
      maxLength: 160,
      admin: {
        description:
          'A short line under the headline — the angle, not a summary. Blank prints nothing; it is not filled in from the summary.',
      },
    },
    slugField(),
    {
      name: 'targetQuery',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'The search this page is written to answer. One page, one query.',
      },
    },
    confidenceField(),
    {
      type: 'tabs',
      tabs: [
        // -------------------------------------------------------------------
        {
          label: 'Article',
          description: 'What the reader came for: the words and the pictures.',
          fields: [
            summaryField(),
            {
              name: 'body',
              type: 'richText',
              admin: {
                description:
                  'The main article. Original prose only — never paste from another site.',
              },
            },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'Lead image. Shown at the top of the article, on the guides index and on the home page cards, and used as the social preview. Blank falls back to the section icon.',
              },
            },
            {
              /*
                Pictures inside the article, as opposed to the lead image above
                it. Rendered as a figure row partway down the page.

                Kept as its own field rather than as upload nodes inside the
                body, because the body is written in src/seed/raw as plain
                strings and a Lexical upload node needs a media id that does
                not exist until after the import has run.
              */
              name: 'bodyImages',
              type: 'array',
              label: 'Images inside the article',
              admin: {
                description:
                  'Shown together partway down the page, under a heading of your choosing. Leave empty for an article with no picture row.',
              },
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
          ],
        },
        // -------------------------------------------------------------------
        {
          label: 'Provenance',
          description:
            'Who stands behind this page, when it was written, when it was last checked and what it was built from. All of it is shown to readers at the foot of the article; anything left blank is simply not printed.',
          fields: provenanceFields(),
        },
        // -------------------------------------------------------------------
        {
          label: 'Related',
          description:
            'The records this guide is about. They become the "Covered here" list beside the article.',
          fields: [
            { name: 'relatedQuests', type: 'relationship', relationTo: 'quests', hasMany: true },
            { name: 'relatedEndings', type: 'relationship', relationTo: 'endings', hasMany: true },
          ],
        },
        // -------------------------------------------------------------------
        {
          label: 'Search',
          description:
            'Overrides for the title and description search engines show. Blank derives them from the title and summary, which is right for almost every page.',
          fields: [seoGroup()],
        },
      ],
    },
  ],
}
