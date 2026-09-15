import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'

/**
 * Publish every guide that is still a draft.
 *
 *   pnpm seed:publish
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
 */

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const drafts = await payload.find({
    collection: 'guides',
    where: { _status: { not_equals: 'published' } },
    limit: 1000,
    depth: 1,
    pagination: false,
  })

  if (drafts.totalDocs === 0) {
    console.log('Every guide is published.')
    process.exit(0)
  }

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
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
