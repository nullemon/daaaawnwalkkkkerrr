/**
 * Every prerendered page, read back for the things a search result is made of.
 *
 *   node tools/seo-audit.mjs            # after `pnpm build`
 *   node tools/seo-audit.mjs --verbose  # list every failing page, not just twenty
 *
 * ## Why this reads the build and not the source
 *
 * Every other check here asks the code a question: is the class defined, does
 * the record belong to a game, does the palette clear AA. None of them can
 * see what a page actually served. A `generateMetadata` that returns `{}` on
 * one branch, a layout whose title template double-prints the site name, a
 * JSON-LD block that is not valid JSON because a title had a quote in it —
 * all three render a 200, pass `pnpm verify`, pass the tests and ship. The
 * only thing that finds them is reading the HTML, which is what a crawler
 * does and what this does.
 *
 * `next build` writes every prerendered route to `.next/server/app/**\/*.html`,
 * so there is no server to start and no crawl to run: the audit is a file
 * walk, which is why it can be part of `pnpm check` after the build.
 *
 * ## What is a failure and what is a note
 *
 * A page with no `<title>`, no description, no canonical, no `<h1>` or two of
 * them, or a `<script type="application/ld+json">` that does not parse is
 * **wrong**, and the run exits non-zero. A title over seventy characters or a
 * description outside 50–170 is **worth knowing** — a result will truncate
 * it — and is printed as a count with examples, because a guide titled from
 * a long question is sometimes right to be long.
 *
 * Regex, not a parser, on purpose: these are Next's own documents, written by
 * one renderer, and the tags looked for are the ones it writes in one shape.
 * A parser dependency for six patterns is a dependency to keep current.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.next/server/app')
const VERBOSE = process.argv.includes('--verbose')
const LIMIT = VERBOSE ? Infinity : 20

if (!fs.existsSync(ROOT)) {
  console.error(`No build at ${ROOT}. Run \`pnpm build\` first.`)
  process.exit(2)
}

/* The admin, the error shells and anything that is not a page a reader lands on. */
const SKIP = /[\\/]\(payload\)[\\/]|[\\/]_not-found|[\\/]_global-error|[\\/]admin1621|[\\/]api[\\/]/

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.html') && !SKIP.test(full) ? [full] : []
  })

/*
  A route that rendered `notFound()` is written to disk too, as the 404 shell,
  with its status in the `.meta` file beside it. Sixteen section indexes answer
  404 on an empty collection and the tools 404 on a wiki without the feature,
  so a wiki with three sections prerenders thirteen of these. They are not
  pages a reader lands on and have no title to check; they are counted and set
  aside rather than failed, because a 404 with no `<h1>` is correct.
*/
const statusOf = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file.replace(/\.html$/, '.meta'), 'utf8')).status ?? 200
  } catch {
    return 200
  }
}
const all = walk(ROOT)
const pages = all.filter((file) => statusOf(file) === 200)
const notFoundCount = all.length - pages.length
const route = (file) => '/' + path.relative(ROOT, file).replace(/\\/g, '/').replace(/\.html$/, '').replace(/^\(frontend\)\//, '')

const decode = (value) =>
  value
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`))
  return match ? decode(match[1]) : null
}

const failures = new Map() // rule -> [route]
const notes = new Map() // rule -> [route: detail]
const fail = (rule, page) => (failures.get(rule) ?? failures.set(rule, []).get(rule)).push(page)
const note = (rule, page) => (notes.get(rule) ?? notes.set(rule, []).get(rule)).push(page)

let ldBlocks = 0
const ldTypes = new Map()

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8')
  const page = route(file)
  const head = (html.match(/<head>([\s\S]*?)<\/head>/) ?? [, ''])[1]

  /* --- the document itself --- */
  if (!/<html[^>]*\slang="/.test(html)) fail('no lang on <html>', page)

  /* --- title --- */
  const titles = [...head.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => decode(m[1]).trim())
  if (titles.length === 0) fail('no <title>', page)
  else if (titles.length > 1) fail('more than one <title>', page)
  else {
    if (titles[0].length > 70) note('title over 70 characters', `${page}: ${titles[0].length} — ${titles[0]}`)
    if (/\s·\s.*\s·\s/.test(titles[0]) && /(.+)\s·\s\1$/.test(titles[0])) fail('site name printed twice in <title>', page)
  }

  /* --- description --- */
  const descTag = head.match(/<meta name="description"[^>]*>/)
  const desc = descTag ? attr(descTag[0], 'content') : null
  if (!desc) fail('no meta description', page)
  else if (desc.length < 50 || desc.length > 170) note('description outside 50–170', `${page}: ${desc.length}`)

  /* --- canonical --- */
  const canonTag = head.match(/<link rel="canonical"[^>]*>/)
  const canonical = canonTag ? attr(canonTag[0], 'href') : null
  if (!canonical) fail('no canonical', page)
  else if (!/^https?:\/\//.test(canonical)) fail('canonical is not absolute', page)

  /* --- robots: a page that asks not to be indexed is reported, not failed --- */
  const robots = head.match(/<meta name="robots"[^>]*>/)
  const noindex = Boolean(robots && /noindex/.test(attr(robots[0], 'content') ?? ''))
  if (noindex) note('noindex', page)

  /* --- one h1 --- */
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length
  if (h1s === 0) fail('no <h1>', page)
  else if (h1s > 1) fail('more than one <h1>', page)

  /* --- social card: on every page that is meant to be found. A page that
     asks not to be indexed — the account, the search, the two forms — is
     not one anybody shares, and a card on it would be a card for nothing. --- */
  if (!noindex) {
    for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) {
      if (!head.includes(`property="${key}"`)) fail(`no ${key}`, page)
    }
    if (!head.includes('name="twitter:card"')) fail('no twitter:card', page)
  }

  /* --- structured data --- */
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    ldBlocks += 1
    let data
    try {
      data = JSON.parse(m[1])
    } catch {
      fail('JSON-LD does not parse', page)
      continue
    }
    const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data]
    for (const node of nodes) {
      const type = node && node['@type']
      if (!type) fail('JSON-LD node with no @type', page)
      else ldTypes.set(type, (ldTypes.get(type) ?? 0) + 1)
    }
    if (!data['@context']) fail('JSON-LD block with no @context', page)
  }
}

/* --- the report --- */
console.log(`${pages.length} prerendered pages read, ${ldBlocks} JSON-LD blocks; ${notFoundCount} routes prerender as 404 and were set aside.`)
console.log('Entity types emitted:')
for (const [type, count] of [...ldTypes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(6)}  ${type}`)
}

if (notes.size > 0) {
  console.log('\nworth knowing')
  for (const [rule, list] of notes) {
    console.log(`  ${rule}: ${list.length}`)
    for (const line of list.slice(0, 5)) console.log(`      ${line}`)
    if (list.length > 5) console.log(`      … and ${list.length - 5} more`)
  }
}

if (failures.size === 0) {
  console.log('\nNo page is missing a title, a description, a canonical, an h1, a social card or valid structured data.')
} else {
  console.log('\nFAILURES')
  for (const [rule, list] of failures) {
    console.log(`  ${rule}: ${list.length}`)
    for (const line of list.slice(0, LIMIT)) console.log(`      ${line}`)
    if (list.length > LIMIT) console.log(`      … and ${list.length - LIMIT} more (--verbose lists all)`)
  }
  process.exitCode = 1
}
