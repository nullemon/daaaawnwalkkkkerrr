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
      'Every field below is a third-party tool, and none of them loads unless a value is set — so an unconfigured site ships no external script at all. The network’s own measurement is the switch at the top and is not one of these.',
  },
  fields: [
    /*
      The network's own analytics, which is not a third-party tool and does not
      belong in the list below it.

      It is one switch rather than one per wiki, because the thing being
      switched is a single API route that all ten hosts post to. A per-wiki
      version would be ten copies of one decision and ten chances for one of
      them to disagree with what the privacy policy says — and the privacy
      policy is one document for the whole network.

      Only on the network settings for the same reason. A Game record carrying
      this field would imply a wiki can opt out of something the policy
      describes network-wide, which is not true and would be worse than not
      offering it.
    */
    ...(scope === 'network'
      ? [
          {
            name: 'firstParty',
            type: 'checkbox' as const,
            label: 'Measure page views on this network',
            defaultValue: true,
            admin: {
              description:
                'This network’s own measurement: a small script posts the page, the referrer and the browser’s user-agent to /api/hit, which stores a page view. No third-party service, no cookie, no advertising identifier, and the reader’s address is hashed with a salt and a rotating date and never stored. Read it under Analytics in the sidebar. Turning this off stops the script being sent at all — and the privacy policy describes what this collects, so if you turn it off, say so there too.',
            },
          },
        ]
      : []),
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
