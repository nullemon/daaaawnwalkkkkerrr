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
import { Guides } from './collections/Guides'
import { Corrections } from './collections/Corrections'
import { Players } from './collections/Players'
import { SiteSettings } from './globals/SiteSettings'

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
    // Run — the data the planner is built on
    Quests,
    CourtActivities,
    Endings,
    // World
    Regions,
    Courts,
    Characters,
    Enemies,
    // Character building
    SkillTrees,
    Perks,
    Items,
    Builds,
    // Editorial
    Mechanics,
    Guides,
    // Admin
    Corrections,
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
  }),
  sharp,
})
