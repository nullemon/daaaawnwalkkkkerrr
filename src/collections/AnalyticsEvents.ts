import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { CHANNELS } from '../lib/analytics/acquisition'

/**
 * One row per page view, for about two months, holding nothing that is a person.
 *
 * ## Why a client beacon writes this and not a server render
 *
 * Every public page on this network prerenders to static HTML. There is no
 * per-request render to hook into, and adding one would undo the thing that
 * makes the site fast. So the only place a request is ever seen is an API
 * route, and the only way a static page reaches it is a beacon from the
 * browser — `src/components/Beacon.tsx` posting to `src/app/api/hit/route.ts`,
 * which is where every field below is decided.
 *
 * The honest consequence, and the admin view states it: a visitor with
 * JavaScript off is not counted, and neither is a crawler that does not run
 * scripts. This is a count of browsers that executed the page, not of requests
 * the server answered. A host's access log will always be the larger number
 * and this will always be the more useful one.
 *
 * ## Why this is not game-scoped
 *
 * It is deliberately **not** in `GAME_SCOPED` in `lib/tenancy.ts` and must
 * never be added to it. Two reasons, and both matter:
 *
 *   - This is not content. `pnpm verify` asks whether every content record
 *     belongs to a game because a record without one silently never renders;
 *     an analytics row renders nowhere by design.
 *   - The dimension wanted is the **host**, not a relationship. The hub, the
 *     companies host and the people host are three of the ten sites and none
 *     of them is a game, so a required `game` relationship could not describe
 *     them at all. `site` is a plain label read off the host.
 *
 * Adding it to that list would also renumber every compound index after it,
 * which is a gotcha this repository has already paid for once.
 *
 * ## Access
 *
 * Payload's default write access is any authenticated user, and this network
 * has a second auth collection — `players`, which is readers. A reader who
 * signs up must be able to neither read nor write this table, so both are
 * stated rather than inherited. Reading is editors only: unlike `ratings`,
 * which is public because an average is printed on a page, nothing here is
 * ever shown to a reader.
 *
 * Creating is closed to the REST API entirely. The row is written by the route
 * with `overrideAccess: true`, because the route is the only place that can
 * compute `visitor` from something the client does not control, and a caller
 * that could supply its own `visitor` could be as many readers as it liked.
 */
export const AnalyticsEvents: CollectionConfig = {
  slug: 'analytics-events',
  admin: {
    group: 'Analytics',
    useAsTitle: 'path',
    defaultColumns: ['createdAt', 'site', 'path', 'channel', 'device', 'country'],
    description:
      'One row per page view, kept for 62 days and then summarised into Analytics rollups. Nothing here is written or edited by hand — the readable view is Analytics in the sidebar.',
    // The list view is a debugging aid, not the product. The dashboard at
    // /admin/analytics is what this collection exists to feed.
    pagination: { defaultLimit: 50, limits: [25, 50, 100, 250] },
  },
  access: {
    create: () => false,
    read: isEditor,
    update: () => false,
    delete: isEditor,
  },
  fields: [
    {
      name: 'site',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The subdomain label, or “hub” on the apex.' },
    },
    { name: 'host', type: 'text', required: true, admin: { description: 'The exact Host header.' } },
    { name: 'path', type: 'text', required: true, index: true },
    { name: 'section', type: 'text', required: true },
    {
      name: 'channel',
      type: 'select',
      required: true,
      index: true,
      options: CHANNELS.map((c) => ({ label: c.label, value: c.id })),
    },
    {
      name: 'source',
      type: 'text',
      required: true,
      admin: {
        description:
          'The referring host, or the campaign tag. Host only — the path a referrer sends is usually stripped by the browser and is more than this needs even when it is not.',
      },
    },
    { name: 'campaign', type: 'text' },
    {
      name: 'device',
      type: 'select',
      required: true,
      index: true,
      options: ['desktop', 'mobile', 'tablet', 'unknown'].map((v) => ({ label: v, value: v })),
      admin: { description: 'Read from the user-agent, which is a claim rather than a measurement.' },
    },
    { name: 'browser', type: 'text', required: true },
    { name: 'os', type: 'text', required: true },
    {
      name: 'country',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description:
          'Two letters from the hosting platform’s own header, or “unknown”. There is no geo database here, so in development it is always unknown — which is the absence of an answer, not zero.',
      },
    },
    {
      name: 'visitor',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'A salted hash of the address, the user-agent and the UTC date. The address is never stored and the key changes every day, so this table cannot be turned back into a list of addresses and cannot follow one person across two days.',
      },
    },
    {
      name: 'botRule',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
        description:
          'Which rule in lib/analytics/agent.ts decided this was not a reader. Empty for a reader. Excluded rows are kept rather than dropped so the filter can be audited and the excluded fraction reported.',
      },
    },
  ],
  indexes: [
    /*
      The spine of every query on this table: a range on `created_at` narrowed
      to readers. Payload indexes `created_at` on its own already, which is
      enough for the range; this pair is what stops a busy day of crawler rows
      being read and discarded on the way to a reader count.

      Named from its fields, not from a position, so this is not the renumbering
      trap that `scopedToGame` has — see the note in lib/tenancy.ts.
    */
    { fields: ['botRule', 'createdAt'] },
    { fields: ['site', 'createdAt'] },
  ],
}
