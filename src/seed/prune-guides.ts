import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'

/**
 * Delete generated pages that the generators would no longer write.
 *
 *   pnpm seed:prune
 *
 * The four guide passes upsert on `(game, slug)`, which is what makes them
 * safe to re-run in any order - and also means that tightening a rule does
 * nothing to the pages the loose rule already produced. They sit in the
 * database forever, still in the sitemap, still indexed, with nothing to say
 * they are orphans of a filter that has since changed.
 *
 * This is the other half of that. It matches on the *title*, because the
 * titles are generated from a template and so say exactly what kind of page
 * each one is: "Every Main series in Silent Hill: Townfall" was a franchise
 * category that cleared a member threshold it should never have been measured
 * against, and "Every enemy in Phantom Blade Zero with gender Male" is a true
 * statement about the data and a worthless page.
 *
 * Deliberately narrow. It only removes pages matching a template this
 * repository generates, so it cannot touch anything hand-written, and it
 * prints every deletion. Run it after changing a generator's filters.
 */

/**
 * "All Main series in X" - a franchise category, not a thing in the game.
 *
 * Both openings. The category roundup is titled "All <category> in <game>"
 * now, because the category is the source wiki's own plural and "Every Bosses"
 * is not a sentence - but every page written under the old "Every" spelling is
 * still in the database, and a prune that could no longer name them would
 * leave exactly the orphans this file exists to remove.
 */
const FRANCHISE_ROUNDUP =
  /^(All|Every) (games?|main series|spin[- ]?offs?|staff|corporate|companies|developers?|publishers?|soundtracks?|films?|novels?|comics?|books?|manga|merchandise|music|media|voice actors?|trademarks?) in /i

/**
 * "Every enemy in X with gender Male" - a grouping nobody wanted.
 *
 * `appearsin` joins the list with the page that named it: "Every enemy in
 * Phantom Blade Zero with appearsin Phantom Blade Zero", a raw infobox key in
 * the title over a grouping that says the game's enemies appear in the game.
 * The generator refuses the key now; this is what reaches the page it already
 * wrote.
 */
const WEAK_GROUPING =
  / with (gender|sex|developer|publisher|director|producer|composer|designer|writer|artist|platforms?|released?|engine|series|debut|voice ?actors?|appears ?in|language) /i

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const guides = await payload.find({
    collection: 'guides',
    limit: 1000,
    depth: 1,
    pagination: false,
  })

  let removed = 0

  for (const guide of guides.docs) {
    const title = String(guide.title ?? '')
    const why = FRANCHISE_ROUNDUP.test(title)
      ? 'franchise category, not a grouping of things in the game'
      : WEAK_GROUPING.test(title)
        ? 'grouped on a field that is not a property of the subject'
        : null

    if (!why) continue

    const game = (guide as { game?: { slug?: string } }).game
    await payload.delete({ collection: 'guides', id: guide.id })
    console.log(`  removed ${game?.slug ?? '?'}/${guide.slug}`)
    console.log(`          "${title}" - ${why}`)
    removed += 1
  }

  console.log(`\n${removed} orphaned pages removed, ${guides.totalDocs - removed} kept`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
