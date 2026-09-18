import type { GlobalConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { analyticsFields, verificationFields } from '../fields/analytics'
import { isProvisional } from '../lib/legal'
import { accentRefusal, checkAccent } from '../lib/appearance'
import { indexNowKeyRefusal } from '../lib/indexnow'

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
            /*
              The sender on everything the site emails — password resets today,
              anything added later.

              It lives here rather than in the environment alone because it is
              reader-visible copy: the name in an inbox is the first thing a
              person sees, and docs/COPY.md's rule is that anything somebody
              would want to reword is a field. EMAIL_FROM_ADDRESS is still
              required for any real provider, and is the floor these override —
              see docs/EMAIL.md. Left blank, the environment's value is used,
              which is why nothing here is required.
            */
            {
              name: 'emailFromName',
              type: 'text',
              label: 'Sender name on email',
              admin: {
                description:
                  'What the network is called in an inbox, e.g. the network name. Blank uses EMAIL_FROM_NAME. Nothing about one game belongs here — this goes to readers of all of the wikis.',
              },
            },
            {
              name: 'emailFromAddress',
              type: 'email',
              label: 'Sender address on email',
              admin: {
                description:
                  'The address mail is sent from. It must be one your email provider has verified, which is rarely the same as the contact address above. Blank uses EMAIL_FROM_ADDRESS.',
              },
              /*
                Refused at the point of entry rather than at send time.

                An address on example.com is syntactically valid, so every
                provider accepts the API call and the message bounces somewhere
                nobody is looking — the silent failure this whole area is built
                against. `isProvisional` is the same check the privacy page
                uses on the other stand-in values.
              */
              validate: (value: unknown) => {
                if (!value || typeof value !== 'string' || !value.trim()) return true
                return isProvisional(value)
                  ? 'This looks like a stand-in. example.com is reserved for documentation and can never send or receive mail.'
                  : true
              },
            },
            {
              name: 'emailReplyTo',
              type: 'email',
              label: 'Reply-to address on email',
              admin: {
                description:
                  'Where a reader’s reply goes. Usually the contact address above, because the sending address is often a no-reply. Blank uses EMAIL_REPLY_TO, and blank there sends no reply-to at all.',
              },
              validate: (value: unknown) => {
                if (!value || typeof value !== 'string' || !value.trim()) return true
                return isProvisional(value)
                  ? 'This looks like a stand-in. A reply-to nobody reads is worse than none.'
                  : true
              },
            },
            /*
              Where reader reports land.

              There was no such setting, which is why there was no
              notification: the site invited corrections on every page, wrote
              them to the queue, thanked the reader, and told nobody. It is
              beside the sender fields rather than on its own tab because it is
              an operator detail like the rest of them, and it is optional for
              the reason docs/COPY.md gives — blank means the shipped behaviour
              (the sender address), never "nobody is told". A notification
              switch whose blank state means off is indistinguishable from the
              bug it was added to fix.
            */
            {
              name: 'reportsEmail',
              type: 'email',
              label: 'Where reader reports are sent',
              admin: {
                description:
                  'Corrections and feature requests are emailed here as they arrive, one message each — there is no digest. Blank sends them to the sender address above, so leaving it empty never means nobody is told.',
              },
              validate: (value: unknown) => {
                if (!value || typeof value !== 'string' || !value.trim()) return true
                return isProvisional(value)
                  ? 'This looks like a stand-in. Reports sent to example.com go where nobody is looking, which is the state this field exists to end.'
                  : true
              },
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
            {
              /*
                The footer's link columns, on all three kinds of site.

                They were three separate hardcoded lists — one in the hub
                layout, one in a wiki layout, one on the companies host — which
                is how the hub came to link to a page the wikis do not have.
                Empty falls back to those lists, so nothing moves until
                somebody fills this in.
              */
              name: 'footerColumns',
              type: 'array',
              label: 'Footer columns',
              labels: { singular: 'Column', plural: 'Columns' },
              admin: {
                description: 'Leave empty to keep the built-in columns. Links are relative to whichever host the footer is on unless they start with http.',
                initCollapsed: true,
              },
              fields: [
                { name: 'heading', type: 'text', required: true },
                {
                  name: 'links',
                  type: 'array',
                  fields: [
                    { name: 'label', type: 'text', required: true },
                    { name: 'href', type: 'text', required: true },
                  ],
                },
              ],
            },
            {
              name: 'railItems',
              type: 'array',
              label: 'Extra rail links',
              labels: { singular: 'Link', plural: 'Links' },
              admin: {
                description:
                  'Appended to the left rail on every wiki, under the sections. The sections themselves are derived from what each wiki has and are not listed here — a link to an empty index reads as a broken site.',
                initCollapsed: true,
              },
              fields: [
                { name: 'label', type: 'text', required: true },
                { name: 'href', type: 'text', required: true },
                {
                  name: 'icon',
                  type: 'select',
                  defaultValue: 'book',
                  options: ['book', 'map', 'person', 'star', 'search', 'shield', 'spark', 'check', 'crown', 'scroll'],
                },
              ],
            },
          ],
        },
        {
          label: 'Directory & standing notes',
          description:
            'The hub’s own listing pages, and the two or three sentences that appear on literally every page of the network.',
          fields: [
            {
              type: 'collapsible',
              label: 'The wikis directory',
              fields: [
                { name: 'wikisTitle', type: 'text', label: 'Page title' },
                { name: 'wikisLede', type: 'textarea', label: 'Lede' },
                {
                  type: 'row',
                  fields: [
                    { name: 'outNowHeading', type: 'text', label: 'Out now', admin: { width: '50%' } },
                    { name: 'notOutYetHeading', type: 'text', label: 'Not out yet', admin: { width: '50%' } },
                  ],
                },
                {
                  name: 'notOutYetNote',
                  type: 'textarea',
                  label: 'Note under "not out yet"',
                  admin: {
                    description:
                      'Four of the eight are pre-release and thin on purpose. This is where that is explained rather than looking like neglect.',
                  },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'The contributors directory',
              fields: [
                { name: 'authorsTitle', type: 'text', label: 'Page title' },
                { name: 'authorsLede', type: 'textarea', label: 'Lede' },
              ],
            },
            {
              type: 'collapsible',
              label: 'Standing notes',
              admin: {
                description:
                  'Printed on every page that has sources, a byline or an attribution line. Changing one of these changes several thousand pages, which is the reason it is worth being editable and the reason to read it twice.',
              },
              fields: [
                {
                  name: 'sourcesCaveat',
                  type: 'textarea',
                  label: 'Under the source list',
                  admin: {
                    description:
                      'The "compiled from public sources, tell us if it is wrong" line. Token: {corrections}, which renders as the link to the corrections queue — delete it and the page loses its only way for a reader to report an error.',
                  },
                },
                {
                  name: 'attributionFullExtra',
                  type: 'textarea',
                  label: 'Extra sentence on full attribution',
                  admin: {
                    description:
                      'Shown only when Licence attribution is set to Full. The template itself is on the Hub home page tab; this is the sentence after it.',
                  },
                },
                {
                  name: 'bylineTeamFallback',
                  type: 'text',
                  label: 'Byline when nobody is named',
                  admin: { description: 'e.g. "the editorial team". Token: {site}, the network name.' },
                },
                {
                  name: 'maintainerLine',
                  type: 'text',
                  label: 'Footer maintainer line',
                  admin: { description: 'Token: {maintainer}, from the Identity tab.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Hub home page',
          description:
            'The apex domain only. Each wiki takes its own heading and lede from its Game record, so nothing here appears on a wiki.',
          fields: [
            {
              /*
                Which wiki's key art fronts the whole network.

                It was `wikis[0]`, and `directory()` sorts biggest wiki first
                — so the one photograph a first-time reader sees was decided
                by a page count. The wiki with the most records turned out to
                be the one whose key art has a greyscale mean of 11.5 out of
                255, measured with `sharp` across all eight: near-black, and
                the reason the hub "seems so dark" survived a scrim retune
                that had already measured clean. No amount of CSS recovers
                detail a file does not have, and a brightness filter on
                somebody else's key art is inventing an exposure they did not
                shoot.

                Optional, and blank keeps the sort order, per `docs/COPY.md`:
                a blank record renders the site the code does. What it stops
                being is an accident — whatever is here, somebody chose it.

                `depth: 0` on `getSiteSettings`, so this arrives as an id and
                the hub matches it against the directory rather than reading a
                populated object.
              */
              name: 'heroWiki',
              type: 'relationship',
              relationTo: 'games',
              label: 'Featured wiki (hero picture)',
              admin: {
                description:
                  'Whose key art sits behind the search on the hub. Leave blank and the hub uses the largest wiki, which is a page count choosing the network’s first impression rather than anybody choosing it. Pick a game whose art is legible under type — the picture is the whole width of the band and the headline sits on top of it.',
              },
            },
            { name: 'heroHeading', type: 'text' },
            { name: 'heroSubheading', type: 'textarea' },
            {
              name: 'searchPlaceholder',
              type: 'text',
              label: 'Search box placeholder',
              admin: { description: 'In the hero. Blank uses the built-in wording.' },
            },
            {
              type: 'collapsible',
              label: 'The three counters',
              admin: {
                description:
                  'The numbers themselves are counted when the page is built and cannot be typed here — which is the point of them.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'statWikisLabel', type: 'text', label: 'Wikis', admin: { width: '33%' } },
                    { name: 'statPagesLabel', type: 'text', label: 'Sourced pages', admin: { width: '33%' } },
                    { name: 'statUpcomingLabel', type: 'text', label: 'Not out yet', admin: { width: '34%' } },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Section headings',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'askingHeading', type: 'text', label: 'What people are asking', admin: { width: '50%' } },
                    { name: 'askingNote', type: 'textarea', label: 'Note', admin: { width: '50%' } },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'directoryHeading', type: 'text', label: 'Every wiki', admin: { width: '50%' } },
                    { name: 'directoryNote', type: 'textarea', label: 'Note', admin: { width: '50%' } },
                  ],
                },
                { name: 'latestHeading', type: 'text', label: 'Newest writing' },
              ],
            },
            {
              /*
                The four house rules at the foot of the hub.

                They are the site's entire argument for existing, printed once,
                and they were an array literal in the page component — which
                meant the one paragraph on the network that states what the
                network promises could not be changed without a deploy.

                Leave the list empty and the four that shipped are shown.
              */
              name: 'rules',
              type: 'array',
              label: 'House rules',
              labels: { singular: 'Rule', plural: 'Rules' },
              admin: {
                description:
                  'Leave empty to show the four that shipped. These are promises the rest of the site has to keep, so change them with that in mind.',
                initCollapsed: true,
              },
              fields: [
                {
                  name: 'icon',
                  type: 'select',
                  defaultValue: 'check',
                  options: [
                    'check',
                    'warn',
                    'scroll',
                    'book',
                    'star',
                    'search',
                    'shield',
                    'spark',
                    'lock',
                    'hourglass',
                  ],
                },
                { name: 'heading', type: 'text', required: true },
                { name: 'body', type: 'textarea', required: true },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'rulesHeading', type: 'text', label: 'Rules heading', admin: { width: '50%' } },
                { name: 'rulesNote', type: 'textarea', label: 'Rules note', admin: { width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'metaTitleSuffix',
                  type: 'text',
                  label: 'Hub title suffix',
                  admin: { width: '50%', description: 'Appended to the hub’s browser title.' },
                },
                {
                  name: 'metaDescriptionFallback',
                  type: 'textarea',
                  label: 'Hub meta description',
                  admin: { width: '50%', description: 'Used when Description on the Identity tab is blank.' },
                },
              ],
            },
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
          /*
            Two settings, not a palette.

            Handing an editor every colour token is how a site ends up
            unreadable with nobody able to say which of thirty values did it.
            These two are the ones somebody actually wants to change without a
            deploy — which theme a first-time reader lands in, and the one
            saturated colour on the page — and both fall back to what shipped
            when blank.
          */
          label: 'Appearance',
          description:
            'How the site looks before a reader touches anything. Both settings are optional: left alone, the network renders the dark palette and the red accent that shipped.',
          fields: [
            {
              name: 'appearanceTheme',
              type: 'select',
              label: 'Default theme',
              defaultValue: 'dark',
              options: [
                { label: 'Dark (default)', value: 'dark' },
                { label: 'Light', value: 'light' },
                { label: 'Follow the reader’s system setting', value: 'system' },
              ],
              admin: {
                description:
                  'What somebody sees on their first visit. The toggle in the header overrides it for that reader from then on, in both directions, and their choice is remembered — this only decides where they start.',
              },
            },
            {
              name: 'appearanceAccent',
              type: 'text',
              label: 'Accent colour',
              admin: {
                placeholder: '#d13a44',
                description:
                  'A hex colour. Leave blank for the red that shipped. This is the only saturated colour on the site — it marks everything interactive — so the hover, border and highlight shades are derived from whatever is set here and will not match the shipped red exactly. An accent without enough contrast to read is refused when you save, with the measurement.',
              },
              /*
                A refusal, not a warning, and the difference is the failure
                mode. An unreadable legal value is a page somebody can still
                read and disbelieve; an unreadable accent is a button with
                invisible text on every page of eight sites, and nothing
                downstream would report it. `LegalGap` warns because the value
                it guards is a judgement call. This one is measurable, so it is
                checked where it is typed.
              */
              validate: (value: unknown) => {
                if (value === null || value === undefined || value === '') return true
                if (typeof value !== 'string') return 'Use a hex colour such as #d13a44.'
                return accentRefusal(value) ?? true
              },
              hooks: {
                /*
                  The measurement, printed once per save.

                  A validator that only speaks when it refuses teaches nobody
                  what the margin was. An accent that passes at 3.02 is one
                  shade away from failing and the person choosing it should
                  see that while they are choosing.
                */
                afterChange: [
                  ({ value, req }) => {
                    if (typeof value === 'string' && value && !accentRefusal(value)) {
                      const measured = checkAccent(value)
                        .map((c) => `${c.ratio.toFixed(2)}:1 ${c.label}`)
                        .join(', ')
                      req.payload.logger.info(`Accent ${value}: ${measured}`)
                    }
                    return value
                  },
                ],
              },
            },
          ],
        },
        {
          label: 'SEO & analytics',
          description:
            'Network-wide defaults. Each wiki is its own site to a search engine, so each has its own copy of these on its Game record — set those, and use this tab for the apex domain.',
          fields: [
            verificationFields('network'),
            analyticsFields('network'),
            /*
              IndexNow is the one setting on this tab that is genuinely
              network-wide rather than a default.

              Everything else here is per-origin because a search engine treats
              each subdomain as its own site. The IndexNow key is not: one key
              file is served by all ten hosts because there is one deployment,
              and the protocol is happy for the same key to cover every host it
              can be fetched from. A per-wiki field would be ten copies of one
              value and ten chances for one of them to be wrong.
            */
            {
              name: 'indexnowKey',
              type: 'text',
              label: 'IndexNow key',
              admin: {
                placeholder: 'e.g. b13095133f25dbe79f5e68795c352c58',
                description:
                  'IndexNow tells Bing, Yandex, Seznam, Naver and Yep that a page changed instead of waiting to be crawled. Google does not participate. The key is public, not secret: it is proved by being served at https://<host>/<key>.txt, which this site does for whatever is set here, on every host. Any 8–128 characters of a–z, A–Z, 0–9 and hyphens will do — 32 random hex characters is the usual shape, and Bing Webmaster Tools will generate one for you. Leave blank to keep using the key that ships with the site.',
              },
              /*
                Refused here rather than at submit time, for the same reason
                the sender address above is.

                A key the engines reject comes back as HTTP 422 with a body
                that says verification failed and not which half failed — the
                key or the file — and there is nothing on the site to look at
                either way, because a malformed key produces a path that
                matches nothing and 404s like any other wrong URL. The shape is
                knowable here, so it is checked here.
              */
              validate: (value: unknown) => {
                if (value === null || value === undefined || value === '') return true
                if (typeof value !== 'string') return 'An IndexNow key is a string of 8–128 characters.'
                return indexNowKeyRefusal(value) ?? true
              },
            },
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
          ],
        },
      ],
    },
  ],
}
