import 'dotenv/config'
import { mediaCredit } from '../lib/credit'
import path from 'path'
import { getPayload } from 'payload'

import config from '../payload.config'
import { attachImage, pick, shotsFor, withoutGameName } from './game-art-pool'

/**
 * Give every guide a picture.
 *
 *   pnpm seed:guide-images
 *
 * The four guide passes attach a screenshot as they write, but the oldest of
 * them predates that and the compilation pages never had one: `all-regions`,
 * `what-is-documented`, `characters-known` and their siblings came out as a
 * heading and a list on a white page. Fifty-two of them, which is enough that
 * a reader clicking through a wiki hits one often.
 *
 * ## Where the picture comes from
 *
 * That game's own store screenshots, and nothing else. This is the same rule
 * the section art follows and for the same reason: a Capcom screenshot on a
 * Bandai Namco page is a misattribution rather than a decorative liberty, and
 * a reader could reasonably take it for a claim about the game they are
 * reading about. Dawnwalker draws from its own press library instead, because
 * it has no store page in `assets/_games`.
 *
 * The choice is a hash of the slug, so it is stable between runs — a page that
 * changes its illustration every time the seed runs looks broken — and spread,
 * so a section index and the page below it are not the same frame twice.
 *
 * Nothing here is attached to a *record*. An image above the words "Laslea
 * Glen" reads as a claim that it is Laslea Glen; a guide is about a topic
 * rather than a thing, which is why it can carry one.
 */

/*
  Where the pictures come from, and the rule that keeps a game's art its own,
  is `./game-art-pool`. It moved there when `seed:guide-body-images` needed the
  same pool: the thing that would have been copied is the rule that once put
  one studio's screenshots on another studio's wiki under a third party's
  copyright line, and a rule with two copies has two places to be relaxed.
*/

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const guides = await payload.find({
    collection: 'guides',
    limit: 1000,
    depth: 1,
    pagination: false,
  })

  /*
    `--redo` revisits guides that already have a lead image, so a change to how
    the alt text is written reaches the rows already seeded. Without it this
    pass can only fill a blank, and the wording would be right on a fresh
    database and stale on every existing one. `attachImage` reuses the upload
    and corrects only the alt — never the credit, which an editor may have
    fixed by hand.
  */
  const redo = process.argv.includes('--redo')
  const missing = redo
    ? guides.docs
    : guides.docs.filter((guide) => !(guide as { image?: unknown }).image)
  if (missing.length === 0) {
    console.log('Every guide has an image.')
    process.exit(0)
  }

  console.log(`${missing.length} guides ${redo ? 'to revisit' : 'with no image'}\n`)

  const shotCache = new Map<string, string[]>()
  const perGame = new Map<string, number>()
  let done = 0

  for (const guide of missing) {
    const game = (guide as { game?: { slug?: string; title?: string; publisher?: string } }).game
    const slug = game?.slug
    if (!slug) continue

    if (!shotCache.has(slug)) shotCache.set(slug, shotsFor(slug))
    const shots = shotCache.get(slug) as string[]
    if (shots.length === 0) {
      console.log(`  ${slug}: no art available, skipped`)
      continue
    }

    const source = shots[pick(String(guide.slug), shots.length)]
    const filename = `${slug}-guide-${guide.slug}${path.extname(source)}`.slice(0, 90)

    const image = await attachImage(
      payload,
      source,
      filename,
      `${game?.title ?? slug} — ${withoutGameName(String(guide.title), String(game?.title ?? ''))}`,
      // Name them. The record has the publisher, and "copyright its
      // publisher" is a credit that credits nobody.
      mediaCredit(game?.title ?? slug, game?.publisher),
    )
    if (!image) continue

    await payload.update({
      collection: 'guides',
      id: guide.id,
      data: { image, _status: 'published' } as never,
      depth: 0,
    })
    perGame.set(slug, (perGame.get(slug) ?? 0) + 1)
    done += 1
  }

  for (const [slug, count] of [...perGame.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug.padEnd(34)} ${String(count).padStart(3)} illustrated`)
  }
  console.log(`\n${done} guides given a picture`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
