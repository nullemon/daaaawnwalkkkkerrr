import type { GlobalConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * The people subdomain's own copy.
 *
 * Written at the same time as the host rather than after it, because the last
 * three sites on this network each shipped with their sentences inside
 * components and each had to be taken apart again. A new host with no editable
 * copy is not a smaller version of that problem, it is the same one with a
 * later invoice.
 *
 * Every field is optional and falls back to the wording in the code; `pnpm
 * seed:copy` writes that wording in. See `docs/COPY.md`.
 */
export const PeopleSite: GlobalConfig = {
  slug: 'people-site',
  label: 'People site',
  admin: {
    group: 'Network',
    description:
      'The people.<domain> host: its front page, its shell and the headings on a profile. The profiles themselves are in the People collection.',
  },
  access: { read: () => true, update: isEditor },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Front page',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'title', type: 'text', label: 'Page title', admin: { width: '50%' } },
                { name: 'eyebrow', type: 'text', admin: { width: '50%' } },
              ],
            },
            {
              name: 'metaDescription',
              type: 'textarea',
              maxLength: 320,
              label: 'Meta description',
            },
            {
              name: 'lede',
              type: 'textarea',
              admin: { description: 'Token: {count}, the number of profiles.' },
            },
            {
              name: 'groups',
              type: 'group',
              label: 'Section headings',
              admin: {
                description:
                  'The directory groups people by how their name reached this network, which is the same disclosure the companies host makes. A group with nobody in it is not rendered.',
              },
              fields: [
                {
                  type: 'collapsible',
                  label: 'Credited on a game we cover',
                  fields: [
                    { name: 'creditedHeading', type: 'text', label: 'Heading' },
                    { name: 'creditedNote', type: 'textarea', label: 'Note' },
                  ],
                },
                {
                  type: 'collapsible',
                  label: 'Actors and voice actors',
                  fields: [
                    { name: 'castHeading', type: 'text', label: 'Heading' },
                    { name: 'castNote', type: 'textarea', label: 'Note' },
                  ],
                },
                {
                  type: 'collapsible',
                  label: 'Named by a company',
                  fields: [
                    { name: 'officersHeading', type: 'text', label: 'Heading' },
                    { name: 'officersNote', type: 'textarea', label: 'Note' },
                  ],
                },
              ],
            },
            {
              name: 'emptyNote',
              type: 'textarea',
              label: 'When the directory is empty',
              admin: {
                description:
                  'Shown in place of the groups while nothing has been published. An index that renders as a heading over white space reads as a page that broke.',
              },
            },
            {
              type: 'collapsible',
              label: 'The "why these have their own site" callout',
              fields: [
                { name: 'whyHeading', type: 'text', label: 'Heading' },
                {
                  name: 'whyBody',
                  type: 'textarea',
                  label: 'Body',
                  admin: { description: 'Token: {companiesLink}, a link to the companies host.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Profile pages',
          description: 'The headings on an individual person’s page.',
          fields: [
            {
              name: 'profile',
              type: 'group',
              label: false,
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'gamesHeading', type: 'text', label: 'Games we cover', admin: { width: '50%' } },
                    { name: 'creditsHeading', type: 'text', label: 'Other credits', admin: { width: '50%' } },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'charactersHeading', type: 'text', label: 'Characters played', admin: { width: '50%' } },
                    { name: 'companiesHeading', type: 'text', label: 'Companies', admin: { width: '50%' } },
                  ],
                },
                {
                  name: 'sourcingNote',
                  type: 'textarea',
                  label: 'Sourcing note',
                  admin: {
                    description:
                      'The line under a profile saying every detail is what a cited source states and nothing is inferred. These are pages about living people; it is the most load-bearing sentence on the host.',
                  },
                },
                {
                  name: 'noPhotoNote',
                  type: 'text',
                  label: 'Note where there is no photograph',
                  admin: {
                    description:
                      'Shown in place of a portrait. Most of these people have no freely licensed photograph, and saying so is better than a grey silhouette that reads as a missing file.',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Shell',
          fields: [
            { name: 'shellName', type: 'text', label: 'Site name in the header' },
            { name: 'shellTagline', type: 'text', label: 'Tagline' },
            { name: 'footerBlurb', type: 'textarea', label: 'Footer blurb' },
            {
              name: 'shellDescription',
              type: 'textarea',
              maxLength: 320,
              label: 'Default meta description',
            },
          ],
        },
      ],
    },
  ],
}
