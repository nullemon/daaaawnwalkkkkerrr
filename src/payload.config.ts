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
import { Guides } from './collections/Guides'
import { Corrections } from './collections/Corrections'
import { Requests } from './collections/Requests'
import { Comments } from './collections/Comments'
import { Players } from './collections/Players'
import { Games } from './collections/Games'
import { SiteSettings } from './globals/SiteSettings'
import { LegalPages } from './globals/LegalPages'
import { InterfaceStrings } from './globals/InterfaceStrings'
import { CompaniesSite } from './globals/CompaniesSite'
import { PeopleSite } from './globals/PeopleSite'
import { scopedToGame } from './fields/shared'
import { buildEmailAdapter } from './lib/email-adapter'

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
      afterNavLinks: ['@/components/admin/NavBadges'],
    },
  },
  collections: [
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
    Games,
    // Moderation and admin
    Comments,
    Corrections,
    Requests,
    Media,
    Players,
    Users,
  ],
  globals: [SiteSettings, LegalPages, InterfaceStrings, CompaniesSite, PeopleSite],
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
