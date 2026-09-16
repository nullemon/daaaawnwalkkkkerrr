import type { GlobalConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { analyticsFields, verificationFields } from '../fields/analytics'

/**
 * Everything chrome-level that should be changeable without a deploy:
 * naming, the nav, the home page pitch, and the ad slots.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  admin: { group: 'Admin' },
  access: { read: () => true, update: isEditor },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Identity',
          fields: [
            { name: 'siteName', type: 'text', required: true, defaultValue: 'Dawnwalker Guide' },
            {
              name: 'tagline',
              type: 'text',
              required: true,
              defaultValue: 'A run planner and database for The Blood of Dawnwalker',
            },
            {
              name: 'description',
              type: 'textarea',
              maxLength: 200,
              admin: { description: 'Default meta description for pages that do not set their own.' },
            },
            {
              name: 'maintainer',
              type: 'text',
              admin: {
                description:
                  'Your name or handle. Shown in the footer and on the about page. Readers and search engines both treat an anonymous guide site as lower quality — put a real name here. Left blank, nothing is shown.',
              },
            },
            {
              name: 'lastVerified',
              type: 'date',
              admin: {
                date: { pickerAppearance: 'dayOnly' },
                description: 'When the data was last checked over. Shown on the home page.',
              },
            },
            {
              name: 'domain',
              type: 'text',
              admin: {
                description:
                  'Canonical origin, e.g. https://example.com. Used for sitemap and canonical URLs. Overridden by NEXT_PUBLIC_SITE_URL when set.',
              },
            },
          ],
        },
        {
          label: 'Legal & contact',
          description:
            'These appear on the privacy policy, terms and contact pages. A privacy policy names who is legally responsible for people\u2019s data — placeholders must be replaced with real details before launch.',
          fields: [
            {
              name: 'legalProvisional',
              type: 'checkbox',
              defaultValue: true,
              label: 'These details are still stand-ins',
              admin: {
                description:
                  'Leave ticked while the details below are provisional. The privacy, terms and contact pages carry a visible warning and mark every value in red until this is unticked. Untick it only once the details are genuinely yours \u2014 that is the single switch that publishes them as real.',
              },
            },
            {
              name: 'legalEntity',
              type: 'text',
              admin: {
                description:
                  'The person or company responsible for this site. Your real name or registered company name.',
              },
            },
            {
              name: 'contactEmail',
              type: 'email',
              admin: { description: 'A working address people can actually reach you on.' },
            },
            {
              name: 'postalAddress',
              type: 'textarea',
              admin: {
                description:
                  'Required by GDPR/UK GDPR if you have readers in the EU or UK. A registered office or service address is fine; do not publish a home address you do not want public.',
              },
            },
            {
              name: 'jurisdiction',
              type: 'text',
              admin: { description: 'Country whose law governs the terms, e.g. "England and Wales".' },
            },
          ],
        },
        {
          label: 'Navigation',
          fields: [
            {
              name: 'primaryNav',
              type: 'array',
              admin: { description: 'Top navigation, in order.' },
              fields: [
                { name: 'label', type: 'text', required: true },
                { name: 'href', type: 'text', required: true },
              ],
            },
            {
              name: 'footerNote',
              type: 'textarea',
              admin: { description: 'Disclaimer line in the footer.' },
              defaultValue:
                'Unofficial fan project. The Blood of Dawnwalker is developed by Rebel Wolves and published by Bandai Namco Entertainment. No affiliation is claimed.',
            },
          ],
        },
        {
          label: 'Hub home page',
          description:
            'The apex domain only. Each wiki takes its own heading and lede from its Game record, so nothing here appears on a wiki.',
          fields: [
            { name: 'heroHeading', type: 'text' },
            { name: 'heroSubheading', type: 'textarea' },
            {
              name: 'attributionStyle',
              type: 'select',
              defaultValue: 'hidden',
              label: 'Licence attribution for wiki-sourced facts',
              options: [
                { label: 'Hidden — no line on any page (default)', value: 'hidden' },
                { label: 'Compact — one line naming the wiki and licence', value: 'compact' },
                { label: 'Full — adds what reuse of this page means', value: 'full' },
              ],
              admin: {
                description:
                  'Off by default, switched on here for every page at once. Read this before leaving it off: around five hundred records restate facts from Fandom and Wikipedia, both CC BY-SA, and that licence requires attribution as a condition of reusing the content. With this hidden and no attribution elsewhere, those pages are outside the terms the facts on them arrived under. The usual way to keep it off page-by-page is a single site-wide credits page instead — that is a legitimate choice, an absence of any credit is not.',
              },
            },
            {
              /*
                An editable template rather than a fixed sentence.

                The wording is a legal-ish line that different people want
                phrased differently, and hard-coding it meant the only options
                were our sentence or nothing. The tokens are filled per source,
                so one template covers every page: a wiki has several hundred
                attributed records and nobody is editing them individually.
              */
              name: 'attributionText',
              type: 'textarea',
              label: 'Attribution wording',
              admin: {
                condition: (_, siblings) => siblings?.attributionStyle !== 'hidden',
                description:
                  'Leave blank for the default sentence. Tokens filled in per page: {source} the article title, {site} the wiki it came from, {date} when it was read, {licence} the licence name. The {source} and {licence} tokens render as links.',
                placeholder:
                  'Some facts on this page are restated from {source} on {site}, read {date}, and used under {licence}.',
              },
            },
            {
              /*
                Citations are collected on every record and validated on import
                — `src/seed/import.ts` still rejects anything without a source
                URL — but showing the list on the page is a separate decision.
                Off by default: the "compiled from public sources, tell us if it
                is wrong" line stays either way, which is the part a reader
                needs, while the link list is for whoever wants to audit us.
              */
              name: 'showSources',
              type: 'checkbox',
              defaultValue: false,
              label: 'Show source lists on pages',
              admin: {
                description:
                  'Off by default. Sources are always stored and always required on import; this only controls whether the list is printed under each page.',
              },
            },
            /*
              Image credits, on the same footing as the source list: stored
              either way, printed only if this is on.

              Off by default, by the owner's decision. The reason to turn it on
              is worth having in front of whoever decides: the harvested images
              come from community wikis whose text and media are CC BY-SA, and
              the BY in that licence is an attribution condition rather than a
              courtesy — it is the thing the licence asks for in exchange. Key
              art and press screenshots are a different matter again: those are
              used under no licence at all, on a fair-dealing argument that a
              credit line supports rather than creates.

              A single credits page naming the wikis is the usual way to keep
              the credit off every image and still be within the terms. If this
              stays off and nothing else carries it, that is a choice being
              made, not a detail being tidied.
            */
            {
              name: 'showImageCredits',
              type: 'checkbox',
              defaultValue: false,
              label: 'Show credits under images',
              admin: {
                description:
                  'Off by default. The credit is still stored on every image. Note that harvested wiki images are CC BY-SA, a licence whose central condition is attribution — see the note on the hub home tab before leaving this off permanently.',
              },
            },
          ],
        },
        {
          label: 'SEO & analytics',
          description:
            'Network-wide defaults. Each wiki is its own site to a search engine, so each has its own copy of these on its Game record — set those, and use this tab for the apex domain.',
          fields: [verificationFields('network'), analyticsFields('network')],
        },
        {
          label: 'Monetisation',
          description: 'Ad slots are reserved in the layout whether or not they are switched on, so enabling them shifts nothing.',
          fields: [
            {
              name: 'adsEnabled',
              type: 'checkbox',
              defaultValue: false,
              admin: { description: 'Leave off until there is traffic and an approved ad account.' },
            },
            {
              name: 'adClientId',
              type: 'text',
              admin: {
                description: 'e.g. AdSense ca-pub-XXXXXXXX.',
                condition: (_, siblingData) => Boolean(siblingData?.adsEnabled),
              },
            },
          ],
        },
      ],
    },
  ],
}
