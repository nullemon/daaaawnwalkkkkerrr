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

/*
 * Classes that belong to Payload's own admin stylesheet.
 *
 * A component rendered inside /admin is styled by Payload, not by us, so
 * `field-type` on a custom field is correct and reporting it as orphaned is
 * the same crying-wolf problem the note above describes — one directory
 * further on. Only the admin tree is exempt: a class used on the public site
 * still has to exist in a stylesheet this repository owns.
 */
const VENDOR_STYLED = /[\\\/]components[\\\/]admin[\\\/]/

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
  if (VENDOR_STYLED.test(file)) continue
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

/*
  Exit non-zero, which this never did.

  For its whole life this script printed its findings and exited 0, so
  `pnpm check` passed whatever it found and every report of "check:css clean"
  was a report that the script had *run*. Nothing was gated on it. That is the
  exact shape of the failures this repository keeps collecting — a green check
  that was never checking — and it was sitting inside the tool written to catch
  one of them, after `.page`, `.prose`, `.lede`, `.icon-btn` and `.run-badge`
  were deleted and nothing noticed.

  There is still no check in the other direction, and that is deliberate. A
  rule with no class is dead weight rather than a broken page, and the naive
  scan is worse than nothing: the class-like pattern matches inside comments,
  so `page.tsx` in prose registers a class named `tsx` and a comment quoting
  `.mw-parser-output` registers that. A reverse check has to strip comments
  first, and until it does it would cry wolf — which the note at the top of
  this file says is how a check stops being read.
*/
if (orphans.length > 0) process.exitCode = 1
