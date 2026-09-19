import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * Cite the pages that compile this wiki's own records.
 *
 *   pnpm seed:cite
 *
 * A handful of pages - "All quests", "Every region", "What is documented" -
 * have no external source, because they have no external claim. They are the
 * database counted and sorted. `pnpm check:launch` flags them as uncited,
 * which is the right instinct applied to the wrong page: an uncited page here
 * normally means somebody wrote a figure from memory.
 *
 * Rather than exempt them, they get the citation that is actually true: this
 * wiki's own records, which each carry their own sources, read on a date. A
 * reader following it lands on the section index and can check any line of the
 * compilation against the record it came from. That is what a citation is for,
 * and it happens to be the honest description of what these pages are.
 */

const COMPILATION = /^(all-|every-|what-is-documented|.*-known$|.*-compared$|.*how-many.*)/

/**
 * When this wiki's records were last built from something outside it.
 *
 * This citation used to be dated `new Date()`, and that was the wrong date in
 * two directions at once. It was not a fact — nobody read anything that day,
 * the pass counts rows in a database — and it moved on every run, so a `pnpm
 * db:reset` silently re-dated every compilation page on the network. Since
 * `guideDates` now reads the newest `retrieved` on a guide as its "last
 * checked" date, that clock read would have reached the sitemap's `lastmod`
 * and the feeds as well. See `src/lib/guide-dates.ts`.
 *
 * The honest answer is the one the records themselves would give: they are
 * built from the harvests in `src/seed/raw/`, each of which carries the day it
 * was fetched, so "as of" is the most recent of those for this game. It is a
 * fact, it is committed, and it reproduces exactly on any machine.
 */
const RAW = path.join(process.cwd(), 'src', 'seed', 'raw')
const HARVESTS = ['games', 'reference', 'wiki-entities', 'queries']

const recordsAsOf = (slug: string): string | null => {
  let latest: string | null = null
  for (const dir of HARVESTS) {
    const file = path.join(RAW, dir, `${slug}.json`)
    if (!fs.existsSync(file)) continue
    const { fetchedAt } = JSON.parse(fs.readFileSync(file, 'utf8')) as { fetchedAt?: string }
    if (fetchedAt && (latest === null || fetchedAt > latest)) latest = fetchedAt
  }
  return latest
}

/**
 * Citations this pass wrote before it knew better, repaired in place.
 *
 * It used to store `await gameUrl(game)`, which reads `NEXT_PUBLIC_SITE_URL`
 * — so a run on a developer's machine published
 * `http://dawnwalker.localhost:3000/` as a guide's only source, and the deploy
 * carried it. The loop below cannot fix one, because it only fills a guide
 * that has *no* sources and a wrong citation is still a citation: the row
 * looks done to every check there is.
 *
 * Narrow and guarded, like every other correction in `src/seed/`: it matches
 * only an absolute loopback URL, which `sourcesField` now refuses outright, so
 * this is for the rows written while it did not.
 */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]*\.localhost)(:|\/|$)/i

const repairLoopbackCitations = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<number> => {
  const all = await payload.find({
    collection: 'guides',
    limit: 0,
    depth: 0,
    pagination: false,
  })

  let repaired = 0
  for (const guide of all.docs as unknown as {
    id: number | string
    slug: string
    sources?: { title?: string; url?: string; retrieved?: string }[]
  }[]) {
    const sources = guide.sources ?? []
    if (!sources.some((source) => typeof source.url === 'string' && LOOPBACK.test(source.url))) {
      continue
    }
    await payload.update({
      collection: 'guides',
      id: guide.id,
      data: {
        sources: sources.map((source) =>
          typeof source.url === 'string' && LOOPBACK.test(source.url)
            ? { ...source, url: '/' }
            : source,
        ),
      } as never,
      depth: 0,
    })
    repaired += 1
    console.log(`  repaired a localhost citation on ${guide.slug}`)
  }
  return repaired
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const repaired = await repairLoopbackCitations(payload)
  if (repaired > 0) console.log('')

  const guides = await payload.find({ collection: 'guides', limit: 800, depth: 1, pagination: false })

  let fixed = 0

  for (const guide of guides.docs) {
    const sources = (guide as { sources?: unknown[] }).sources ?? []
    if (sources.length > 0) continue

    const game = (guide as {
      game?: { slug?: string; subdomain?: string | null; title?: string; shortTitle?: string }
    }).game
    if (!game?.slug) {
      console.log(`  skipped ${guide.slug} - no game, so no records to point at`)
      continue
    }

    if (!COMPILATION.test(String(guide.slug))) {
      // Not a compilation, so an empty source list is a real gap rather than
      // a category error. Naming it is the useful thing to do.
      console.log(`  NEEDS A REAL SOURCE: ${game.slug}/${guide.slug}`)
      continue
    }

    const name = game.shortTitle || game.title || game.slug
    /*
      Relative, and that is the fix rather than the shortcut.

      This was `await gameUrl(game)`, which is the right function and the wrong
      time to call it: `gameUrl` reads `NEXT_PUBLIC_SITE_URL`, so a pass run on
      a developer's machine wrote `http://dawnwalker.localhost:3000/` into the
      database as a guide's only citation, and it stayed there through the
      deploy. Nothing errored and nothing could have: the page rendered, the
      link was blue, and `check:launch` counted the guide as cited.

      The page and the records it compiles are on the same host by definition
      — that is what makes it a compilation of *this* wiki — so `/` is the
      whole address, and it is correct wherever the site is deployed. The same
      reasoning the wiki layout gives for not storing footer hrefs.

      `sourcesField` now refuses an absolute loopback URL outright, so this
      cannot come back quietly by another route.
    */
    const asOf = recordsAsOf(game.slug)
    await payload.update({
      collection: 'guides',
      id: guide.id,
      data: {
        sources: [
          {
            title: `${name} wiki records, each carrying its own sources`,
            url: '/',
            // No harvest on disk for this wiki, so no "as of". The citation is
            // still true; the date is simply not known, and a blank one is a
            // gap rather than a guess.
            ...(asOf ? { retrieved: asOf } : {}),
          },
        ],
      } as never,
      depth: 0,
    })
    fixed += 1
    console.log(`  cited ${game.slug}/${guide.slug}`)
  }

  console.log(`\n${fixed} compilation pages cited`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
