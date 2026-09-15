import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { gameUrl } from '../lib/payload'

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

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const guides = await payload.find({ collection: 'guides', limit: 800, depth: 1, pagination: false })

  const today = new Date().toISOString().slice(0, 10)
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
    /* The wiki's own canonical host, not a guessed one - gameUrl is the single
       place that knows a game is a subdomain rather than a path. */
    const url = await gameUrl(game as { slug: string; subdomain?: string | null })
    await payload.update({
      collection: 'guides',
      id: guide.id,
      data: {
        sources: [
          {
            title: `${name} wiki records, each carrying its own sources`,
            url: `${url}/`,
            retrieved: today,
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
