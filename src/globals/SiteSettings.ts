import type { GlobalConfig } from 'payload'

/**
 * Everything chrome-level that should be changeable without a deploy:
 * naming, the nav, the home page pitch, and the ad slots.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Site settings',
  admin: { group: 'Admin' },
  access: { read: () => true },
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
          label: 'Home page',
          fields: [
            { name: 'heroHeading', type: 'text' },
            { name: 'heroSubheading', type: 'textarea' },
          ],
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
            {
              name: 'analyticsId',
              type: 'text',
              admin: { description: 'Plausible domain or GA4 measurement ID. Left blank, no analytics load.' },
            },
          ],
        },
      ],
    },
  ],
}
