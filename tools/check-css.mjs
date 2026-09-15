/**
 * Every className a component renders, checked against globals.css.
 *
 * Deleting a CSS block is silent: nothing errors, no test fails, the page just
 * quietly goes plain. That is exactly how `.icon-btn`, `.run-badge` and
 * `.run-badge-fig` survived a commit with no styles at all — the theme toggle
 * lost its button and the run readout rendered as loose wrapping words down
 * the side of the rail.
 *
 *   node tools/check-css.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

/*
 * Both stylesheets, because there are two.
 *
 * The public site is styled by globals.css; the admin panel's additions live
 * in custom.css, which Payload loads into /admin. Reading only the first meant
 * every class on the admin dashboard was reported as orphaned — and an audit
 * that cries wolf is one people stop reading, which defeats the point of
 * having it.
 */
const STYLESHEETS = ['src/app/(frontend)/globals.css', 'src/app/(payload)/custom.css']

const defined = new Set(
  STYLESHEETS.filter((file) => fs.existsSync(file)).flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
  ),
)

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name)
  return e.isDirectory() ? walk(full) : full.match(/\.tsx$/) ? [full] : []
})

const used = new Map()
for (const file of [...walk('src/components'), ...walk('src/app')]) {
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    // A template literal such as `rarity-${value}` is one class built at
    // runtime, not two static ones. Strip the interpolations whole rather
    // than splitting on them, or the audit reports halves that never exist.
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').replace(/[\w-]*\$\{[^}]*\}[\w-]*/g, ' ')
    for (const cls of raw.split(/\s+/).filter((c) => /^[a-zA-Z][\w-]*$/.test(c))) {
      if (!used.has(cls)) used.set(cls, new Set())
      used.get(cls).add(file.replace('src/', ''))
    }
  }
}

const orphans = [...used.entries()].filter(([cls]) => !defined.has(cls))
console.log(orphans.length === 0 ? 'No orphaned classes.' : `${orphans.length} classes rendered with no CSS:\n`)
for (const [cls, files] of orphans.sort()) console.log(`  .${cls}  ←  ${[...files].join(', ')}`)
