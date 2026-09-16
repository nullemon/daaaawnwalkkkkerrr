import type { GlobalConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * Privacy, terms and contact, as text rather than as three React components.
 *
 * Around sixteen hundred words of legal prose shipped inside `.tsx` files.
 * That is the one category of copy where "edit it and redeploy" is most
 * obviously wrong: a privacy policy changes when a processor changes, which is
 * a Tuesday afternoon decision made by whoever signed the contract, not a
 * release.
 *
 * Two things stay where they are, deliberately:
 *
 *   - The **values** — who the entity is, the contact address, the postal
 *     address, the jurisdiction — stay in Site settings → Legal & contact and
 *     are substituted into these sections as `{entity}`, `{email}`,
 *     `{address}` and `{jurisdiction}`. That is what keeps `LegalGap` able to
 *     tell that the details are still stand-ins and mark them in red. An
 *     editor who types the name in directly gets a page that looks finished
 *     and has lost its own safety check.
 *
 *   - The **warning** itself — `src/components/LegalGap.tsx` — is not editable
 *     and should not become editable. It exists because the values cannot be
 *     trusted yet; a warning that can be deleted by the person it is warning
 *     is not a warning.
 *
 * Every field here is optional. Blank falls back to the wording that shipped,
 * and `pnpm seed:copy` writes that wording into these fields so there is
 * something real to edit.
 */

const page = (
  name: string,
  label: string,
  description: string,
): { label: string; description: string; fields: import('payload').Field[] } => ({
  label,
  description,
  fields: [
    {
      name,
      type: 'group',
      label: false,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'title', type: 'text', label: 'Page title', admin: { width: '50%' } },
            {
              name: 'metaDescription',
              type: 'text',
              maxLength: 320,
              label: 'Meta description',
              admin: { width: '50%' },
            },
          ],
        },
        { name: 'lede', type: 'textarea', label: 'Lede' },
        {
          name: 'sections',
          type: 'array',
          label: 'Sections',
          labels: { singular: 'Section', plural: 'Sections' },
          admin: {
            initCollapsed: true,
            description:
              'In order, each rendering as a heading and its body. Tokens filled from Site settings → Legal & contact: {entity}, {email}, {address}, {jurisdiction}, {site}. On the terms page only, {rightsholders} lists the developers and publishers this network covers — it is the affiliation disclaimer naming them rather than gesturing at them, so deleting it weakens the sentence it sits in. Leave the whole list empty to use the wording that shipped.',
          },
          fields: [
            { name: 'heading', type: 'text', required: true },
            { name: 'body', type: 'richText' },
          ],
        },
      ],
    },
  ],
})

export const LegalPages: GlobalConfig = {
  slug: 'legal-pages',
  label: 'Legal pages',
  admin: {
    group: 'Admin',
    description:
      'Privacy, terms and contact. The details themselves live in Site settings → Legal & contact and are substituted in — do not type them here.',
  },
  access: { read: () => true, update: isEditor },
  fields: [
    {
      type: 'tabs',
      tabs: [
        page('privacy', 'Privacy', 'What is collected, by whom, and how to get rid of it.'),
        page('terms', 'Terms', 'The terms of use. Governing law comes from Site settings.'),
        page('contact', 'Contact', 'How to reach a person, and what each route is for.'),
      ],
    },
  ],
}
