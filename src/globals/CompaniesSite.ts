import type { GlobalConfig } from 'payload'
import { verificationFields } from '../fields/analytics'
import { isEditor } from '../fields/shared'

/**
 * The companies subdomain's own copy.
 *
 * `companies.<domain>` is a third kind of site on this network — not the hub
 * and not a wiki — with its own shell, its own footer and its own front page,
 * and until now not one editable word on any of it. It gets the same treatment
 * as everything else: optional fields, each falling back to what shipped.
 *
 * The section headings are the interesting part. The index groups companies by
 * *how we came to have them* — one we cover, one somebody publishes a revenue
 * ranking for, one Wikipedia files under the industry, one named by another
 * company's own article — and each heading's note explains that provenance.
 * Those notes are the argument for the whole host, so they belong where
 * somebody can improve them.
 */
export const CompaniesSite: GlobalConfig = {
  slug: 'companies-site',
  label: 'Companies site',
  admin: {
    group: 'Network',
    description:
      'The companies.<domain> host: its front page, its shell and its footer. Company records themselves are in the Companies collection.',
  },
  access: { read: () => true, update: isEditor },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Search engines',
          description:
            'This host is its own property in Search Console and Bing Webmaster Tools — a property is a hostname, so the network’s token does not verify it. Paste this host’s own token here.',
          fields: [verificationFields('host')],
        },
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
              admin: { description: 'Token: {count}, the number of company profiles.' },
            },
            {
              name: 'groups',
              type: 'group',
              label: 'Section headings',
              admin: {
                description:
                  'Four groups, in this order. A group with nothing in it is not rendered at all.',
              },
              fields: [
                {
                  type: 'collapsible',
                  label: 'Behind a game we cover',
                  fields: [
                    { name: 'coveredHeading', type: 'text', label: 'Heading' },
                    { name: 'coveredNote', type: 'textarea', label: 'Note' },
                  ],
                },
                {
                  type: 'collapsible',
                  label: 'The largest in games',
                  fields: [
                    { name: 'rankedHeading', type: 'text', label: 'Heading' },
                    {
                      name: 'rankedNote',
                      type: 'textarea',
                      label: 'Note',
                      admin: {
                        description:
                          'The note that says this is revenue on a date rather than popularity. Worth keeping the distinction however it is reworded — popularity is not a measurable quantity and this site does not pretend otherwise.',
                      },
                    },
                  ],
                },
                {
                  type: 'collapsible',
                  label: 'Developers and publishers',
                  fields: [
                    { name: 'cataloguedHeading', type: 'text', label: 'Heading' },
                    { name: 'cataloguedNote', type: 'textarea', label: 'Note' },
                  ],
                },
                {
                  type: 'collapsible',
                  label: 'Named by another company',
                  fields: [
                    { name: 'mentionedHeading', type: 'text', label: 'Heading' },
                    { name: 'mentionedNote', type: 'textarea', label: 'Note' },
                  ],
                },
              ],
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
                  admin: { description: 'Token: {authorsLink}, a link to the hub’s contributors page.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Profile pages',
          description: 'The headings on an individual company profile.',
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
                    { name: 'subsidiariesHeading', type: 'text', label: 'Subsidiaries', admin: { width: '50%' } },
                  ],
                },
                {
                  /*
                    The catalogue is the reason this host is worth opening — a
                    studio page listing only the one game we happen to have a
                    wiki for is a worse page than the studio's own site — so its
                    wording gets a group rather than a row lost among the rest.
                  */
                  type: 'collapsible',
                  label: 'The catalogue',
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'catalogueHeading', type: 'text', label: 'Heading', admin: { width: '60%' } },
                        {
                          name: 'catalogueCovered',
                          type: 'text',
                          label: 'Badge on a title we cover',
                          admin: {
                            width: '40%',
                            description: 'Marks the rows that link into one of this network’s wikis instead of out to a shop.',
                          },
                        },
                      ],
                    },
                    {
                      name: 'cataloguePriceNote',
                      type: 'textarea',
                      label: 'Note under the list',
                      admin: {
                        description:
                          'The standing half of the price sentence. Which storefront was read and on what date belongs on the company record’s own catalogue note; this is the part that is true of all three hundred of them. A price is a fact with a date on it, so keep the distinction however it is reworded.',
                      },
                    },
                    {
                      name: 'catalogueEmpty',
                      type: 'textarea',
                      label: 'When there is no catalogue',
                      admin: {
                        description:
                          'Shown on every profile nobody has harvested a catalogue for, which is most of them. It has to say the gap is ours — an empty list and "this company has released nothing" look identical on the page, and only the first is true.',
                      },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'defunctNote',
                      type: 'textarea',
                      label: 'Closed-company banner',
                      admin: {
                        width: '50%',
                        description:
                          'Token: {defunct}, the year as the record states it. Shown in red at the top of the profile, above everything else, because the rest of the page is in the past tense once it applies.',
                      },
                    },
                    {
                      name: 'siteLabel',
                      type: 'text',
                      label: 'Official-site link label',
                      admin: { width: '50%', description: 'The words beside the company’s own web address.' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'parentHeading', type: 'text', label: 'Parent', admin: { width: '50%' } },
                    { name: 'peopleHeading', type: 'text', label: 'Key people', admin: { width: '50%' } },
                  ],
                },
                {
                  name: 'sourcingNote',
                  type: 'textarea',
                  label: 'Sourcing note',
                  admin: {
                    description:
                      'The line saying every figure comes from the company’s own article with the date it was read.',
                  },
                },
                {
                  name: 'structureNote',
                  type: 'textarea',
                  label: 'Note under the corporate structure',
                  admin: {
                    description:
                      'Why a parent or a subsidiary is listed at all — each link exists because one of the two companies’ own articles named the other. That provenance is the reason to trust the graph, so it is worth saying on the page.',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'knownHeading', type: 'text', label: '"What we know" heading', admin: { width: '50%' } },
                    { name: 'knownNote', type: 'text', label: '"What we know" note', admin: { width: '50%' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Shell',
          description: 'The header, rail and footer on this host.',
          fields: [
            { name: 'shellName', type: 'text', label: 'Site name in the header' },
            { name: 'shellTagline', type: 'text', label: 'Tagline' },
            { name: 'footerBlurb', type: 'textarea', label: 'Footer blurb' },
            {
              name: 'shellDescription',
              type: 'textarea',
              maxLength: 320,
              label: 'Default meta description',
              admin: {
                description:
                  'For any page on this host that does not set its own. Both routes here do set one, so this is the safety net rather than the usual case.',
              },
            },
            {
              name: 'footerLinks',
              type: 'array',
              label: 'Footer links',
              admin: { initCollapsed: true },
              fields: [
                { name: 'label', type: 'text', required: true },
                { name: 'href', type: 'text', required: true },
              ],
            },
          ],
        },
      ],
    },
  ],
}
