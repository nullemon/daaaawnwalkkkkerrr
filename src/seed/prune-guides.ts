import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'

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

/**
 * A roundup of a collection that is now empty.
 *
 * The two rules above ask whether a page's *title* is a shape this repository
 * should never have generated. This asks something different and it took a
 * live falsehood to notice the gap: whether the page's *subject still exists*.
 *
 * GTA 6's entity harvest was turned off — the intersection fallback was
 * pulling in the whole franchise, and a wiki with no category for an unreleased
 * game has no sourced entity list at all. Its 72 records went. Its guides
 * stayed, and went on saying **"All 5 items recorded in GTA 6, including
 * Carjacking, Collectibles, Duke Arms Company"** on a wiki holding zero items,
 * naming four records a reader cannot open. Five pages on that wiki were doing
 * it, including "100 things catalogued in Grand Theft Auto VI so far".
 *
 * Nothing caught it. `pnpm verify` passes — the rows exist and carry a game.
 * The build passes — the pages render. `check:kind` passes — a guide is a
 * guide. The title is a template this repository writes on purpose, so neither
 * rule above touches it. The only wrong thing about the page is that what it
 * counts is gone.
 *
 * **Zero is the only count this fires on**, which is what makes it safe: a
 * roundup of a collection with one record left is thin and true, and a
 * generator that would no longer write it is a different question. A roundup
 * of nothing cannot be true in any wording.
 */
const ROUNDUP_OF = new Map<RegExp, string>([
  [/^Every (?:weapon and )?items? in /i, 'items'],
  [/^Every characters? in /i, 'characters'],
  [/^Every (?:location|region)s? in /i, 'regions'],
  [/^Every enem(?:y|ies) in /i, 'enemies'],
  [/^Every quests? in /i, 'quests'],
  [/^Every achievements? in /i, 'achievements'],
  [/^Every mechanics? in /i, 'mechanics'],
])

/**
 * A page that totals the whole wiki, on a wiki with nothing in it.
 *
 * "GTA 6: how many characters, bosses and items are there?" and "What is
 * documented for GTA 6, and what is not" are the same falsehood one level up:
 * they count across the collections rather than listing one, so an empty wiki
 * makes them wrong without their titles matching any pattern above.
 *
 * **Every game-scoped collection counts here, not the seven above.** The first
 * version of this rule looked only at the collections `ROUNDUP_OF` names and
 * deleted Deadlock's page — a wiki with four mechanics and therefore four
 * records, whose total was perfectly true. A rule written to remove a
 * falsehood removed a fact, silently, which is the Antar 4 mistake in a prune
 * pass. Guides are excluded because a wiki of nothing but guides still has
 * nothing to total.
 */
const WHOLE_WIKI_ROUNDUP =
  /^(What is documented for |.*: how many .* are there\?$)/i

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const guides = await payload.find({
    collection: 'guides',
    limit: 1000,
    depth: 1,
    pagination: false,
  })

  let removed = 0

  /* Counted once per game rather than per guide: a wiki has many guides. */
  const countsFor = new Map<string, Map<string, number>>()
  const countsOf = async (gameId: string | number): Promise<Map<string, number>> => {
    const key = String(gameId)
    if (!countsFor.has(key)) {
      const counts = new Map<string, number>()
      for (const c of GAME_SCOPED) {
        if (c === 'guides') continue
        const n = await payload.count({
          collection: c as Parameters<typeof payload.count>[0]['collection'],
          where: { game: { equals: gameId } },
        })
        counts.set(c, n.totalDocs)
      }
      countsFor.set(key, counts)
    }
    return countsFor.get(key)!
  }

  for (const guide of guides.docs) {
    const title = String(guide.title ?? '')
    const game = (guide as { game?: { id?: string | number; slug?: string } }).game

    let why = FRANCHISE_ROUNDUP.test(title)
      ? 'franchise category, not a grouping of things in the game'
      : WEAK_GROUPING.test(title)
        ? 'grouped on a field that is not a property of the subject'
        : null

    /*
      A roundup whose collection is now empty. Only ever fires on zero — see
      `ROUNDUP_OF`.
    */
    if (!why && game?.id) {
      const counts = await countsOf(game.id)
      for (const [pattern, collection] of ROUNDUP_OF) {
        if (!pattern.test(title)) continue
        if ((counts.get(collection) ?? 0) === 0) {
          why = `counts ${collection} on a wiki that now has none`
        }
        break
      }
      if (!why && WHOLE_WIKI_ROUNDUP.test(title)) {
        const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
        if (total === 0) why = 'totals a wiki that now holds no records at all'
      }
    }

    if (!why) continue

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
