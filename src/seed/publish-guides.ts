import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'
import { seededPublishedAt } from '../lib/guide-dates'

/**
 * Make every guide publishable: published status, and a publication date.
 *
 *   pnpm seed:publish
 *
 * ## 1. Publish every guide that is still a draft
 *
 * `Guides` is the one collection with `versions: { drafts: true }`, and
 * Payload defaults a document it creates to `_status: 'draft'`. Every guide
 * the generators wrote was therefore a complete, correct, fully populated row
 * that the public site refused to serve — the page 404s, the sitemap omits
 * it, and every count taken against the database still says it is there.
 *
 * Nothing errored. `pnpm verify` passed. `pnpm build` was green and reported
 * sixteen hundred pages, because the guide routes simply had nothing to
 * prerender and a route with no params is not a failure. Three hundred and
 * thirty-five pages were invisible and the only thing that found it was
 * somebody opening a URL.
 *
 * The generators set `_status: 'published'` now, so this is a backfill rather
 * than a step in the pipeline. It stays because a draft can also arrive from
 * the admin, from `pnpm remote`, or from a collection that gains drafts
 * later, and because `pnpm verify` now fails while any exist and should be
 * able to name the fix.
 *
 * ## 2. Give every guide a publication date
 *
 * An article with no date is a page a reader cannot place and a crawler cannot
 * age, and neither row timestamp can stand in for one: `updatedAt` moves every
 * time a seeder rewrites a row, and `createdAt` is the date of the last
 * `pnpm db:reset` rather than of publication. `src/lib/guide-dates.ts` has the
 * full reasoning, and the deterministic value this writes.
 *
 * Two rules, and both of them matter more than they look:
 *
 * - **Only where the field is empty.** The owner said he will correct these by
 *   hand as he goes, so a later run of this pass must never walk over an edit.
 *   Same contract `pnpm seed:copy` has, and the same reason it can sit in
 *   `pnpm db:reset` next to the other passes without reverting somebody's
 *   afternoon.
 * - **The value is derived from the slug, not drawn at random.** Same guide,
 *   same date, on every machine and after every rebuild. A random spread would
 *   re-date four hundred articles on each `pnpm db:reset`, churn the sitemap's
 *   `lastmod`, and make a bookmarked page re-publish itself.
 *
 * This is scaffolding, in the same sense as the thirty-six placeholder
 * contributors, and it is counted as such: `pnpm check:launch` reports how
 * many guides still carry the derived value, and a guide stops being counted
 * the moment somebody edits its date. There is no checkbox to untick — this
 * repository already has thirty-six rows proving nobody remembers to.
 *
 * It does **not** seed `updated`. One seeded date is a date; two would be an
 * editorial history nobody has. "Last checked" appears only where somebody
 * actually went back to the sources.
 */

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  // --- 1. Drafts -----------------------------------------------------------
  const drafts = await payload.find({
    collection: 'guides',
    where: { _status: { not_equals: 'published' } },
    limit: 1000,
    depth: 1,
    pagination: false,
  })

  if (drafts.totalDocs === 0) {
    console.log('Every guide is published.')
  } else {
    console.log(`${drafts.totalDocs} drafts to publish\n`)

    const perGame = new Map<string, number>()
    let published = 0

    for (const guide of drafts.docs) {
      const game = (guide as { game?: { slug?: string } }).game
      await payload.update({
        collection: 'guides',
        id: guide.id,
        data: { _status: 'published' } as never,
        depth: 0,
      })
      const key = game?.slug ?? 'no game'
      perGame.set(key, (perGame.get(key) ?? 0) + 1)
      published += 1
    }

    for (const [slug, count] of [...perGame.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${slug.padEnd(34)} ${String(count).padStart(4)} published`)
    }

    console.log(`\n${published} guides published`)
  }

  // --- 2. Publication dates ------------------------------------------------
  /*
    `select`, not a plain read. This asks four hundred rows two questions and
    a default read would drag every Lexical body across with them — the shape
    of query that made `next build` abort with SQLITE_BUSY and the reason
    `countRecords` exists.

    `exists: false` is not enough on its own: Payload stores a cleared date
    field as null on some paths and the check has to hold for a row that was
    written and then emptied, so the filter is widened and the guard below is
    the one that actually decides.
  */
  const undated = await payload.find({
    collection: 'guides',
    where: { published: { exists: false } },
    limit: 2000,
    depth: 0,
    pagination: false,
    select: { slug: true, published: true } as never,
  })

  /*
    `as Record<string, unknown>[]`, because a typed `select` narrows the
    returned document to `never` and every field read off it is a compile
    error. Same cast as `src/lib/payload.ts` makes for the same reason.
  */
  const needed = (undated.docs as unknown as Record<string, unknown>[]).filter(
    (guide) => !guide.published,
  )

  if (needed.length === 0) {
    console.log('\nEvery guide already carries a publication date.')
    process.exit(0)
  }

  console.log(`\n${needed.length} guides with no publication date\n`)

  for (const guide of needed) {
    await payload.update({
      collection: 'guides',
      id: guide.id as number,
      data: { published: seededPublishedAt(String(guide.slug)) } as never,
      depth: 0,
      /*
        A guide is a versioned document, so an update without this creates a
        new draft version and leaves the published one untouched — the row
        would look dated in the admin and undated on the site, which is the
        drafts trap this file's own header is about, wearing a different hat.
      */
      draft: false,
    })
  }

  console.log(`${needed.length} dated, spread across the last 30 days.`)
  console.log('These are placeholders the owner will correct; check:launch counts them.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
