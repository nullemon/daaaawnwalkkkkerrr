import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'
import { isSeededPublishedAt } from '../lib/guide-dates'

/**
 * Make every guide publishable: published status, and no fabricated dates.
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
 * ## 2. Take back the publication dates this pass used to invent
 *
 * It used to write one. An article with no date is a page a reader cannot
 * place and a crawler cannot age, neither row timestamp can stand in for one,
 * and the owner had asked for the dates to be spread across the previous
 * thirty days rather than all landing on one afternoon — so this pass hashed
 * each guide's slug into an offset and wrote the result. Deterministic,
 * reproducible, stable across rebuilds, and completely made up.
 *
 * Deterministic is not the same as true. Nothing happened on 22 August, and
 * thirty-three guides said it did. A date under a headline is one of the few
 * things a reader believes without checking, and a fabricated one is
 * indistinguishable from a real one by construction — which is what made this
 * worse than the problem it fixed, not better. It reached `datePublished` in
 * the Article markup and `lastmod` in eight sitemaps off the back of it.
 *
 * So this pass **clears** them, and the clearing is safe for exactly the
 * reason the fabrication was reproducible: `isSeededPublishedAt` recomputes
 * what the old rule would have written and only removes a date that still
 * matches it to the day. A date somebody typed is left alone; a guide whose
 * date had already been edited was never in scope.
 *
 * What a guide is left with is `updated` — "last checked" — which is the day
 * this page's own citations were read, off a committed harvest file. That is a
 * fact, it varies because the harvests really did run on different days, and
 * it reproduces exactly on any machine. `src/lib/guide-dates.ts` has the whole
 * argument. `published` is an editor's field now and nothing writes it but an
 * editor.
 *
 * Idempotent: a second run finds nothing to clear and says so.
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

  // --- 2. Fabricated publication dates -------------------------------------
  /*
    `select`, not a plain read. This asks four hundred rows two questions and
    a default read would drag every Lexical body across with them — the shape
    of query that made `next build` abort with SQLITE_BUSY and the reason
    `countRecords` exists.
  */
  const dated = await payload.find({
    collection: 'guides',
    where: { published: { exists: true } },
    limit: 2000,
    depth: 0,
    pagination: false,
    select: { slug: true, published: true } as never,
  })

  /*
    `as Record<string, unknown>[]`, because a typed `select` narrows the
    returned document to `never` and every field read off it is a compile
    error. Same cast as `src/lib/payload.ts` makes for the same reason.

    The filter is the whole safety of this pass. It does not clear dates — it
    clears dates that are still, to the day, what the old hash would have
    written for that exact slug. An editor's date cannot match by accident on
    anything but a coincidence of one day in thirty, and a guide that was
    edited is one somebody has already looked at.
  */
  const fabricated = (dated.docs as unknown as Record<string, unknown>[]).filter((guide) =>
    isSeededPublishedAt(String(guide.slug), guide.published as string | null),
  )

  if (fabricated.length === 0) {
    console.log('\nNo guide carries a fabricated publication date.')
    process.exit(0)
  }

  console.log(`\n${fabricated.length} guides carry the old hashed publication date\n`)

  for (const guide of fabricated) {
    await payload.update({
      collection: 'guides',
      id: guide.id as number,
      /*
        `null`, not `undefined`. Payload treats a key that is absent from the
        payload as "leave this field alone", so an update written with
        `published: undefined` silently does nothing at all and the pass
        reports every row as cleared — the same shape of quiet no-op as the
        draft trap this file's header is about.
      */
      data: { published: null, _status: 'published' } as never,
      depth: 0,
      /*
        A guide is a versioned document, so an update without this creates a
        new draft version and leaves the published one untouched — the row
        would look cleared in the admin and dated on the site, which is that
        same trap wearing a different hat.
      */
      draft: false,
    })
  }

  console.log(`${fabricated.length} fabricated dates cleared.`)
  console.log('A guide now states a publication date only where an editor typed one;')
  console.log('"last checked" comes from the day its own sources were read.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
