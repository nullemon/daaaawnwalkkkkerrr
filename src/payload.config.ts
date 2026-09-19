import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Regions } from './collections/Regions'
import { Courts } from './collections/Courts'
import { Characters } from './collections/Characters'
import { Enemies } from './collections/Enemies'
import { SkillTrees } from './collections/SkillTrees'
import { Perks } from './collections/Perks'
import { Items } from './collections/Items'
import { Builds } from './collections/Builds'
import { Quests } from './collections/Quests'
import { CourtActivities } from './collections/CourtActivities'
import { Endings } from './collections/Endings'
import { Achievements } from './collections/Achievements'
import { Maps } from './collections/Maps'
import { Factions } from './collections/Factions'
import { Mechanics } from './collections/Mechanics'
import { Authors } from './collections/Authors'
import { Companies } from './collections/Companies'
import { People } from './collections/People'
import { Ratings } from './collections/Ratings'
import { AnalyticsEvents } from './collections/AnalyticsEvents'
import { AnalyticsDaily } from './collections/AnalyticsDaily'
import { Guides } from './collections/Guides'
import { Corrections } from './collections/Corrections'
import { Requests } from './collections/Requests'
import { Comments } from './collections/Comments'
import { Players } from './collections/Players'
import { Games } from './collections/Games'
import { RemoteDevices } from './collections/RemoteDevices'
import { RemoteSessions } from './collections/RemoteSessions'
import { RemoteLog } from './collections/RemoteLog'
import { SiteSettings } from './globals/SiteSettings'
import { LegalPages } from './globals/LegalPages'
import { InterfaceStrings } from './globals/InterfaceStrings'
import { CompaniesSite } from './globals/CompaniesSite'
import { PeopleSite } from './globals/PeopleSite'
import { RemoteAccess } from './globals/RemoteAccess'
import { scopedToGame } from './fields/shared'
import { withPublishPing } from './lib/indexnow-publish'
import { buildEmailAdapter } from './lib/email-adapter'
import { ADMIN_PATH } from './lib/admin-path'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/*
  Awaited here, before the config is built, on purpose.

  Payload calls an email adapter synchronously at init, so anything that has to
  be checked over the network - an SMTP relay answering, and its credentials
  being accepted - has to happen first or not at all. Doing it here is what
  makes a misconfigured provider refuse to boot rather than accept a password
  reset and drop it. `docs/EMAIL.md` has the variables.
*/
const email = await buildEmailAdapter()

export default buildConfig({
  /*
    The admin is not at `/admin`. `src/lib/admin-path.ts` says why, and says
    that this value and the route folder under `src/app/(payload)/` have to
    match or the admin 404s with nothing explaining it. `proxy.test.ts` pins
    the pair.
  */
  routes: { admin: ADMIN_PATH },
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: ' · Network admin',
    },
    components: {
      /*
        Payload's stock dashboard is a list of collection names. That was
        adequate for one wiki; across seven it answers none of the questions an
        editor actually arrives with — is anything waiting for me, and which
        wiki is thin. This replaces the top of the page with both.
      */
      beforeDashboard: ['@/components/admin/NetworkDashboard'],
      /*
        The count badge in the sidebar — what is waiting for you, and behind
        which entry, on every admin screen rather than only the dashboard.

        `afterNavLinks` and not a custom `Nav`: Payload renders its own nav
        links and offers no slot between them, so the two ways to get a number
        onto a link itself are owning Payload's whole nav component or
        appending a span from the client after paint. The second fails silently
        the day Payload changes its markup, which is the failure mode this
        repository has a list of. See the note in NavBadges.tsx.
      */
      /*
        The search box, above the collection links rather than below them.

        Payload searches one collection at a time, which is the wrong shape for
        the question somebody actually arrives with — "where is the Anca page"
        — because answering it means picking the collection first. See
        `SearchView`.
      */
      beforeNavLinks: ['@/components/admin/SearchNavLink'],
      /*
        The network's own mark on the login screen and in the nav, in place of
        Payload's wordmark. Both are drawn from `lib/brand.ts`, the same source
        as the favicon and the share card, and the name beside the login one is
        read from Site settings — so renaming the network renames this too.
      */
      graphics: {
        Logo: '@/components/admin/AdminLogo',
        Icon: '@/components/admin/AdminIcon',
      },
      /*
        What this admin is, and how to get back into it, on the one screen
        somebody sees when they cannot. See `LoginNotice`.
      */
      beforeLogin: ['@/components/admin/LoginNotice'],
      afterNavLinks: [
        '@/components/admin/NavBadges',
        '@/components/admin/AnalyticsNavLink',
        /*
          Renders nothing at all unless REMOTE_CONTROL_SECRET is set on the
          deployment, so an install that never opted in has no nav entry
          advertising a feature whose every route answers 404. See the note in
          RemoteNavLink.tsx.
        */
        '@/components/admin/RemoteNavLink',
      ],
      /*
        The analytics screen, as a root view at /admin/analytics.

        A custom view is the right shape here and a collection list view is
        not. `analytics-events` is one row per page view; the question the
        owner arrives with is never "show me row 4,182", it is "how many
        people, from where, over what period" - which is eleven aggregates and
        a window picker, none of which a list view can be.

        A root view rather than a panel on the dashboard because
        NetworkDashboard already answers a different question, and stacking
        "did anybody read it" under "what is waiting for you" would bury both.
        See the note in AnalyticsView.tsx.
      */
      views: {
        /*
          One box across every collection. A root view rather than a panel,
          because it needs the whole width for grouped results and because a
          search that lives on the dashboard is a search you have to go home
          to use.
        */
        search: {
          Component: '@/components/admin/SearchView',
          path: '/search',
          meta: { title: 'Search' },
        },
        analytics: {
          Component: '@/components/admin/AnalyticsView',
          path: '/analytics',
          meta: { title: 'Analytics' },
        },
        /*
          Approving a terminal to write to the live site. A root view for the
          same reason analytics is one: the question is "is anything waiting
          for me to approve, and what has a session changed", which is a
          screen, not a list of rows in one collection. `docs/REMOTE.md` is the
          design and the threat model.
        */
        remote: {
          Component: '@/components/admin/RemoteView',
          path: '/remote',
          meta: { title: 'Remote control' },
        },
      },
    },
  },
  /*
    `withPublishPing` adds one `afterChange` hook to every collection that has
    a public page, announcing that page to IndexNow when it is published. It
    wraps the list rather than being written into sixteen collection files,
    because "a published page is announced" is one rule and a rule stated in
    sixteen places is a rule missing from the seventeenth — the list it uses is
    `SECTION_PATH`, so a new section gets the behaviour by existing.

    It changes nothing about the order of this array, and order is the thing
    that matters here: see the note further down about positionally-named
    compound indexes.

    Nothing is submitted from a seed run, from localhost, or in bulk. The
    guards, and why each one is a refusal rather than a delay, are in
    `src/lib/indexnow-ping.ts`; `docs/DEPLOY.md` section 6 is the operator's
    version.
  */
  collections: withPublishPing([
    // Every collection below scopedToGame() belongs to one game and is filtered
    // by it on every public read. The list must match GAME_SCOPED in
    // lib/tenancy.ts — see the note there about what happens when it does not.

    // Run — the data the planner is built on
    scopedToGame(Quests),
    scopedToGame(CourtActivities),
    scopedToGame(Endings),
    scopedToGame(Achievements),
    // World
    scopedToGame(Regions),
    scopedToGame(Courts),
    scopedToGame(Characters),
    scopedToGame(Enemies),
    // Character building
    scopedToGame(SkillTrees),
    scopedToGame(Perks),
    scopedToGame(Items),
    scopedToGame(Builds),
    // Editorial
    scopedToGame(Mechanics),
    scopedToGame(Guides),
    // Appended, in GAME_SCOPED's order, and a new one goes after these rather
    // than among them — see the note in lib/tenancy.ts about what inserting a
    // game-scoped collection anywhere else does to the compound index names.
    scopedToGame(Maps),
    scopedToGame(Factions),
    Authors,
    // Network-wide
    Companies,
    People,
    Ratings,
    /*
      Not game-scoped, and deliberately not in GAME_SCOPED in lib/tenancy.ts —
      see the note in AnalyticsEvents.ts. They go after the network-wide
      collections and before the moderation ones purely so the sidebar reads in
      a sensible order; nothing about their position affects an index name,
      because neither goes through scopedToGame() and neither therefore has a
      positionally-named compound index to renumber.
    */
    AnalyticsEvents,
    AnalyticsDaily,
    Games,
    // Moderation and admin
    Comments,
    Corrections,
    Requests,
    Media,
    Players,
    Users,
    /*
      Remote control, appended and staying appended.

      None of the three goes through `scopedToGame()`, so none has a
      positionally-named compound index to renumber and their position is
      cosmetic — but the rule in lib/tenancy.ts is "a new collection goes at the
      end", and a list where some additions go at the end and some do not is a
      list nobody can follow. They are deliberately **not** in GAME_SCOPED: a
      laptop, a session and an audit row do not belong to a wiki, and `pnpm
      verify` has no business in any of them.
    */
    RemoteDevices,
    RemoteSessions,
    RemoteLog,
  ]),
  globals: [SiteSettings, LegalPages, InterfaceStrings, CompaniesSite, PeopleSite, RemoteAccess],
  editor: lexicalEditor(),
  /*
    Chosen by EMAIL_PROVIDER, never by editing this line. Default is `console`,
    which prints and discards, so a fresh clone with no credentials still runs.
    See `lib/email.ts` for what each provider needs and `pnpm email:test` for
    whether it works.
  */
  email,
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  /**
   * libSQL: a local file in development, a remote Turso database in production.
   * Same adapter either way, so deploying is a change of environment variable
   * rather than a change of code.
   */
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./dawnwalker.db',
      authToken: process.env.DATABASE_AUTH_TOKEN,
    },
    push: process.env.NODE_ENV !== 'production',
    /*
     * Write-ahead logging, and a lock timeout that is not zero.
     *
     * `next build` prerenders with twenty-one worker processes, every one of
     * them reading this file at once. Under the adapter's defaults — rollback
     * journal, and `busyTimeout: 0`, which means "fail rather than wait a
     * single millisecond" — that is enough contention to abort the build with
     * SQLITE_BUSY partway through the record pages. It did, at around page six
     * hundred, on a machine that had built the same site four hundred pages at
     * a time for months.
     *
     * WAL lets readers proceed while a write is in flight, which is the whole
     * shape of a static build; the timeout covers the checkpoints, where they
     * still cannot. Neither changes anything about a deployed site, where the
     * database is not on the request path at all.
     */
    wal: true,
    busyTimeout: 15_000,
  }),
  sharp,
})
