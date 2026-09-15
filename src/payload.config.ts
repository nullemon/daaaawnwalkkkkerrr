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
import { Mechanics } from './collections/Mechanics'
import { Authors } from './collections/Authors'
import { Guides } from './collections/Guides'
import { Corrections } from './collections/Corrections'
import { Requests } from './collections/Requests'
import { Players } from './collections/Players'
import { Games } from './collections/Games'
import { SiteSettings } from './globals/SiteSettings'
import { scopedToGame } from './fields/shared'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: ' · Dawnwalker Guide',
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
    Authors,
    // Network-wide
    Games,
    // Admin
    Corrections,
    Requests,
    Media,
    Players,
    Users,
  ],
  globals: [SiteSettings],
  editor: lexicalEditor(),
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
