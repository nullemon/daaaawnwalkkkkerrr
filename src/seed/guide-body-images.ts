import 'dotenv/config'
import path from 'path'
import { getPayload } from 'payload'

import config from '../payload.config'
import { mediaCredit } from '../lib/credit'
import { attachImage, captionsFor, pick, shotsFor, withoutGameName } from './game-art-pool'

/**
 * Pictures inside an article, not only at the top of it.
 *
 *   pnpm seed:guide-body-images
 *
 * Every guide on this network had a lead image and then eight hundred words of
 * unbroken text. `bodyImages` has existed on `Guides` the whole time and was
 * filled in on **none** of the 597 — the field was built, the route rendered
 * it, and no pass ever wrote one, so the feature was complete and invisible.
 *
 * ## Where they come from, and why that is already decided
 *
 * `shotsFor` in `./game-art-pool`: this game's store screenshots, or
 * Dawnwalker's own press library, or what the harvester pulled from the wiki
 * configured for this slug. Nothing else, ever — that module carries the rule
 * and the history of what happened when it was looser.
 *
 * ## Why the choice is a hash and not a shuffle
 *
 * `pick` is deterministic on the slug, so re-running writes the same pictures
 * to the same articles. A pass that reshuffled would change every illustration
 * on every rebuild, which reads as a broken site rather than a fresh one, and
 * would churn `updatedAt` on 597 rows — the field "Recently updated" sorts by.
 *
 * The offsets are coprime-ish strides off the lead's index rather than
 * `index + 1`, so an article does not open on a frame and then show the two
 * next to it; and the lead itself is excluded, because the one thing worse
 * than no picture in the body is the picture already at the top of the page.
 *
 * ## Captions are only written where the subject is known
 *
 * `captionsFor` maps a file back to the entity title the harvester took it
 * from — an exact mapping, because the harvester wrote the filename from that
 * title. Those get a caption. A store screenshot is an unlabelled frame and
 * gets none, and a blank caption prints nothing at all rather than an empty
 * line. Guessing a subject from a filename would be inventing the one kind of
 * fact this site exists not to invent.
 */

/**
 * How many pictures go inside an article, by how much there is to break up.
 *
 * These numbers were set from the actual distribution rather than guessed, and
 * the first guess was wrong in a way worth recording. It started at "nothing
 * under 220 words", on the assumption that an article is an article — and left
 * 460 of the 597 untouched, because **the median guide here is 128 words**.
 *
 * That is not a defect to be fixed by writing more; it is what this network
 * is. A compiled fact page — "who is making it", "soundtrack and composer" —
 * answers one question from sourced records and stops, and `seed:topics`
 * already prints the per-wiki count as a finding because guide counts here are
 * data-bound rather than effort-bound. Padding one to earn a photograph would
 * be the single thing this project says it will not do.
 *
 * So the bands are cut to the pages that exist. The floor sat at a hundred
 * words until the distribution under it was actually looked at: 158 of those
 * 168 pages are between 60 and 100 words, which is three or four full
 * sentences and carries a picture perfectly well — the GTA 6 page this was
 * reported against, "series order", is 88. Only ten articles on the network
 * are shorter than sixty words, and those are the ones where a second picture
 * would outweigh the text it sits in.
 */
const WANTED = (words: number): number => {
  if (words < 60) return 0
  if (words < 350) return 1
  if (words < 700) return 2
  return 3
}

/** Rough word count of a Lexical body, for deciding how many pictures fit. */
const wordsIn = (node: unknown): number => {
  if (!node || typeof node !== 'object') return 0
  const record = node as Record<string, unknown>
  let count = 0
  if (typeof record.text === 'string') count += record.text.split(/\s+/).filter(Boolean).length
  if (record.root) count += wordsIn(record.root)
  if (Array.isArray(record.children)) for (const child of record.children) count += wordsIn(child)
  return count
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const guides = await payload.find({
    collection: 'guides',
    limit: 2000,
    depth: 1,
    pagination: false,
  })

  /*
    `--redo` reprocesses articles that already have pictures.

    Without it this pass can only ever fill a blank, so a change to how the
    alt text or the captions are written would apply to a fresh database and
    to nothing already seeded — the same split `seed:posters --force` exists
    for, and the same one `correctConfidenceCopy` had to close for copy.

    It is a flag rather than the default because re-running would otherwise
    rewrite `bodyImages` on 429 rows every time it ran, and `updatedAt` is
    what "Recently updated" sorts by.
  */
  const redo = process.argv.includes('--redo')
  const todo = guides.docs.filter((guide) => {
    if (redo) return true
    const held = (guide as { bodyImages?: unknown[] }).bodyImages
    return !Array.isArray(held) || held.length === 0
  })

  if (todo.length === 0) {
    console.log('Every guide already carries pictures in its body.')
    process.exit(0)
  }

  console.log(`${todo.length} guides with no pictures in the body\n`)

  const shotCache = new Map<string, string[]>()
  const captionCache = new Map<string, Map<string, string>>()
  const perGame = new Map<string, number>()
  let placed = 0
  let tooShort = 0
  let noArt = 0

  for (const guide of todo) {
    const game = (guide as { game?: { slug?: string; title?: string; publisher?: string } }).game
    const slug = game?.slug
    if (!slug) continue

    const words = wordsIn((guide as { body?: unknown }).body)
    const want = WANTED(words)
    if (want === 0) {
      tooShort += 1
      continue
    }

    if (!shotCache.has(slug)) shotCache.set(slug, shotsFor(slug))
    if (!captionCache.has(slug)) captionCache.set(slug, captionsFor(slug))
    const shots = shotCache.get(slug) as string[]
    const captions = captionCache.get(slug) as Map<string, string>

    /*
      One picture in the pool means the lead is using it and there is nothing
      left; two means one spare. Never repeat the lead inside the article.
    */
    if (shots.length < 2) {
      noArt += 1
      continue
    }

    const leadIndex = pick(String(guide.slug), shots.length)
    const chosen: number[] = []
    /*
      A stride rather than the next index along. Store kits are ordered as the
      publisher shot them, so neighbouring frames are usually the same scene
      from the same angle — three of those down one article is one picture
      printed three times.
    */
    const stride = Math.max(1, Math.floor(shots.length / (want + 1)))
    for (let step = 1; chosen.length < want && step < shots.length; step += 1) {
      const index = (leadIndex + step * stride) % shots.length
      if (index === leadIndex || chosen.includes(index)) continue
      chosen.push(index)
    }

    const entries: { image: number | string; caption?: string }[] = []
    for (const [order, index] of chosen.entries()) {
      const source = shots[index]
      const filename = `${slug}-body-${guide.slug}-${order + 1}${path.extname(source)}`.slice(0, 95)
      const subject = captions.get(path.resolve(source))

      const image = await attachImage(
        payload,
        source,
        filename,
        /*
          The alt text says what it honestly can: which game this is a picture
          from, and — only where the harvest recorded it — what it shows.
        */
        subject
          ? `${subject} in ${game?.title ?? slug}`
          : `${game?.title ?? slug} — ${withoutGameName(String(guide.title), String(game?.title ?? ''))}`,
        mediaCredit(game?.title ?? slug, game?.publisher),
      )
      if (!image) continue
      entries.push(subject ? { image, caption: subject } : { image })
    }

    if (entries.length === 0) continue

    await payload.update({
      collection: 'guides',
      id: guide.id,
      data: { bodyImages: entries, _status: 'published' } as never,
      depth: 0,
    })

    perGame.set(slug, (perGame.get(slug) ?? 0) + entries.length)
    placed += entries.length
  }

  for (const [slug, count] of [...perGame.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug.padEnd(34)} ${String(count).padStart(4)} pictures placed`)
  }
  console.log(`\n${placed} pictures placed inside articles`)
  if (tooShort > 0) {
    console.log(`${tooShort} articles left alone — too short to break up; a picture every other line is not a design.`)
  }
  if (noArt > 0) {
    console.log(`${noArt} skipped — that wiki has no picture its lead is not already using.`)
  }
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
