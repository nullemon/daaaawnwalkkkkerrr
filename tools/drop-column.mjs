/**
 * Drop a column the schema no longer declares.
 *
 *   node tools/drop-column.mjs guides body_images_heading
 *
 * ## Why this exists
 *
 * `push: true` in development asks drizzle to reconcile the database with the
 * collection config, and a **removed** field makes it ask for confirmation:
 * "You're about to delete body_images_heading column in guides table with 597
 * items". `next dev` has no terminal to answer on, so the prompt is printed
 * into the log and the server sits there — every request hangs, nothing
 * errors, and the log line looks like information rather than a question.
 *
 * `pnpm db:reset` is the documented fix for a schema change and is the right
 * one before a production build. It is a poor one in the middle of a session:
 * it rebuilds every record from seed, which is minutes of work to remove a
 * text column nothing reads.
 *
 * So this removes the column, and then there is no difference for push to ask
 * about. SQLite has supported `ALTER TABLE ... DROP COLUMN` since 3.35.
 *
 * ## What it will not do
 *
 * It refuses any column still named in `src/collections/` or `src/globals/`,
 * because the only safe time to drop one is *after* the field is gone from the
 * config — dropping a column a collection still declares makes push recreate
 * it empty on the next boot, which silently blanks the field for every record.
 * It touches no other table, prints the row count first, and names each table
 * it changed.
 */
import fs from 'fs'
import path from 'path'
/*
  Resolved through the pnpm store rather than by name: `@libsql/client` is a
  transitive dependency of `@payloadcms/db-sqlite` and is not in this project's
  own `dependencies`, so a bare import fails at the root. Adding it to
  `package.json` to satisfy one maintenance script would pin a version this
  project does not otherwise choose.
*/
const { createClient } = await import(
  '../node_modules/.pnpm/@libsql+client@0.14.0/node_modules/@libsql/client/lib-esm/node.js'
)

const table = process.argv[2]
const column = process.argv[3]

if (!table || !column) {
  console.error('Usage: node tools/drop-column.mjs <table> <column>')
  process.exit(1)
}

/** `body_images_heading` in the database is `bodyImagesHeading` in the config. */
const asField = column.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

const declaredIn = []
for (const dir of ['src/collections', 'src/globals', 'src/fields']) {
  const full = path.resolve(dir)
  if (!fs.existsSync(full)) continue
  for (const entry of fs.readdirSync(full)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue
    const source = fs.readFileSync(path.join(full, entry), 'utf8')
    /* `name: 'bodyImagesHeading'` — the declaration, not a mention in a comment. */
    if (new RegExp(`name:\\s*['"\`]${asField}['"\`]`).test(source)) {
      declaredIn.push(`${dir}/${entry}`)
    }
  }
}

if (declaredIn.length > 0) {
  console.error(`Refusing: "${asField}" is still declared in ${declaredIn.join(', ')}.`)
  console.error('Remove the field from the config first, or push will recreate the column empty.')
  process.exit(1)
}

const uri = (process.env.DATABASE_URI || 'file:./dawnwalker.db').trim()
const client = createClient({ url: uri })

/* The versions table carries a mirror of every field, prefixed. */
const targets = [
  { table, column },
  { table: `_${table}_v`, column: `version_${column}` },
]

for (const target of targets) {
  try {
    const columns = await client.execute(`PRAGMA table_info(${target.table})`)
    const present = columns.rows.some((row) => row.name === target.column)
    if (!present) {
      console.log(`  ${target.table}.${target.column} — not there, nothing to do`)
      continue
    }
    const count = await client.execute(`SELECT COUNT(*) AS n FROM ${target.table}`)
    await client.execute(`ALTER TABLE ${target.table} DROP COLUMN ${target.column}`)
    console.log(`  ${target.table}.${target.column} — dropped (${count.rows[0].n} rows kept)`)
  } catch (error) {
    console.log(`  ${target.table}.${target.column} — ${String(error?.message ?? error)}`)
  }
}

console.log('\nRestart `pnpm dev`: push has nothing left to ask about.')
