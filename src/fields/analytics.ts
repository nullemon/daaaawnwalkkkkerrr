import type { Field } from 'payload'

/**
 * Search-engine verification and analytics, as editable fields.
 *
 * ## Why this exists twice
 *
 * Every wiki is its own origin, and every search engine treats an origin as a
 * separate site. So Search Console needs eight properties for this network, not
 * one, and each hands back a different verification token. A single
 * network-wide box would be wrong for seven of the eight.
 *
 * Hence the same group on Site Settings and on each game: the network value is
 * the default, a game's value overrides it, and an empty game field inherits.
 * See `resolveTags` in `lib/tags.ts` for the merge.
 *
 * ## Why every field is a plain string
 *
 * These are all copy-and-paste values from a dashboard. The temptation is a
 * "paste the whole snippet here" textarea, which is how a CMS ends up
 * executing arbitrary script tags typed by whoever has a login. The one
 * free-text escape hatch is `headHtml`, which is documented as the dangerous
 * one and is meant for the case nothing else covers.
 */

const helpFor = (scope: 'network' | 'game') =>
  scope === 'game'
    ? 'Leave empty to use the network-wide value from Site settings.'
    : 'Used by every wiki unless that wiki sets its own.'

export const verificationFields = (scope: 'network' | 'game'): Field => ({
  name: 'verification',
  type: 'group',
  label: 'Search engine verification',
  admin: {
    description:
      scope === 'game'
        ? 'This wiki is its own site to a search engine, so it needs its own verification token. Search Console will not accept the network’s.'
        : 'Only used on the apex domain. Each wiki has its own, on its Game record.',
  },
  fields: [
    {
      name: 'google',
      type: 'text',
      label: 'Google Search Console',
      admin: {
        description: `The content value from the HTML tag method — the long string, not the whole tag. ${helpFor(scope)}`,
        placeholder: 'e.g. 8Xk2_QpL...',
      },
    },
    {
      name: 'bing',
      type: 'text',
      label: 'Bing Webmaster Tools',
      admin: { description: `The msvalidate.01 content value. ${helpFor(scope)}` },
    },
    {
      name: 'yandex',
      type: 'text',
      label: 'Yandex Webmaster',
      admin: { description: helpFor(scope) },
    },
    {
      name: 'pinterest',
      type: 'text',
      label: 'Pinterest',
      admin: { description: helpFor(scope) },
    },
    {
      name: 'facebookDomain',
      type: 'text',
      label: 'Facebook domain verification',
      admin: { description: helpFor(scope) },
    },
  ],
})

export const analyticsFields = (scope: 'network' | 'game'): Field => ({
  name: 'analytics',
  type: 'group',
  label: 'Analytics',
  admin: {
    description:
      'Nothing loads unless a value is set here, so an unconfigured site ships no third-party script at all — which is both faster and one fewer cookie banner to justify.',
  },
  fields: [
    {
      name: 'ga4Id',
      type: 'text',
      label: 'Google Analytics 4',
      admin: {
        description: `Measurement ID, beginning G-. ${helpFor(scope)}`,
        placeholder: 'G-XXXXXXXXXX',
      },
    },
    {
      name: 'gtmId',
      type: 'text',
      label: 'Google Tag Manager',
      admin: {
        description: `Container ID, beginning GTM-. Use this *or* GA4, not both — Tag Manager usually loads GA4 itself, and configuring both is the classic way to double-count every pageview. ${helpFor(scope)}`,
        placeholder: 'GTM-XXXXXXX',
      },
    },
    {
      name: 'plausibleDomain',
      type: 'text',
      label: 'Plausible',
      admin: {
        description: `The domain as registered with Plausible. Cookieless, so it needs no consent banner. ${helpFor(scope)}`,
        placeholder: 'dawnwalker.example.com',
      },
    },
    {
      name: 'clarityId',
      type: 'text',
      label: 'Microsoft Clarity',
      admin: { description: `Project ID. ${helpFor(scope)}` },
    },
    {
      name: 'headHtml',
      type: 'textarea',
      label: 'Extra tags for <head>',
      admin: {
        description:
          'Raw HTML, injected into every page on this site. The escape hatch for a tool with no field above. It is not validated and not escaped, so anything pasted here runs on every page — treat it as giving whoever pasted it the keys.',
      },
    },
  ],
})
