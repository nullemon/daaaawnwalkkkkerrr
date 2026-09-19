import fs from 'fs'
import path from 'path'
import type { Payload } from 'payload'

import { PRIMARY_GAME } from './games'

/**
 * Where a game's own pictures come from, and the rule that keeps them its own.
 *
 * Two passes need this: `seed:guide-images` for an article's lead image, and
 * `seed:guide-body-images` for the pictures inside it. Before this module the
 * first one owned the logic and the second would have had to copy it —
 * and the thing being copied is the rule that once put Rebel Wolves'
 * screenshots on fifty-four GTA 6 and Fire Emblem pages under the line
 * "Grand Theft Auto VI © Rockstar Games".
 *
 * A second copy of a rule is a second place for it to be relaxed. One copy,
 * two callers.
 *
 * ## Its own module, because importing the pass would run the pass
 *
 * `guide-images.ts` calls `run()` at the top level, so importing anything from
 * it executes the whole seed as a side effect — the same reason
 * `rating-basis.ts` exists apart from `ratings.ts`.
 *
 * ## The order, and why each step is allowed
 *
 * 1. `assets/_games/<slug>/screenshot-*` — the game's own store screenshots.
 * 2. Dawnwalker's press library, **for Dawnwalker only**.
 * 3. `assets/_wiki/<slug>/` — what the harvester pulled from the wiki
 *    configured for this slug.
 *
 * Every one is keyed on the game. There is deliberately no step that reads a
 * directory belonging to a different game, and no "if this game has nothing,
 * borrow" branch: step 2 is pinned to one slug by name precisely because it
 * used to be "any game with no store art", which is a property two unrelated
 * games shared.
 *
 * A game with nothing in all three gets an empty list, and the caller prints
 * that it skipped. An unillustrated guide is a gap; a wrongly-illustrated one
 * is a claim.
 */

const GAME_ART = path.resolve('assets/_games')
const LIBRARY = path.resolve('assets/_library/screenshots')
const WIKI_ART = path.resolve('assets/_wiki')

const IMAGE = /\.(jpg|jpeg|png)$/i

/**
 * A page's title with the game's name taken off the front.
 *
 * Guide titles on this network are written to stand alone in a search result,
 * so most of them open with the game: "The Blood of Dawnwalker Beginner's
 * Guide". Pasting that after the game's name for an alt attribute produced
 * "The Blood of Dawnwalker — The Blood of Dawnwalker Beginner's Guide", which
 * is what a screen reader then read out.
 *
 * Only strips a leading match, and only a whole one followed by a separator or
 * a space, so "Onimusha" is removed from "Onimusha: Way of the Sword Bosses"
 * and nothing is removed from "Everything Onimusha Does Differently".
 */
export const withoutGameName = (title: string, game: string): string => {
  if (!game) return title
  const trimmed = title.trim()
  if (!trimmed.toLowerCase().startsWith(game.toLowerCase())) return trimmed

  /*
    The boundary, without which this is a bare prefix strip — and a bare prefix
    strip turns "Deadlocked Doors Explained" into "ed Doors Explained". The
    test pins that case because the shortest game name on this network is a
    common English word.
  */
  const next = trimmed[game.length]
  if (next !== undefined && !/[\s:—–-]/.test(next)) return trimmed

  const rest = trimmed.slice(game.length).replace(/^[\s:—–-]+/, '')
  /* If nothing is left, the title *was* the game's name — keep it. */
  return rest || trimmed
}

/** Stable, well-spread index for a name. */
export const pick = (name: string, count: number): number => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % count
}

const filesIn = (dir: string, match: RegExp = IMAGE): string[] => {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => match.test(name))
    .sort()
    .map((name) => path.join(dir, name))
}

/** Every picture this game may legitimately illustrate a page with. */
export const shotsFor = (slug: string): string[] => {
  const store = filesIn(path.join(GAME_ART, slug), /^screenshot-\d+\.(jpg|jpeg|png)$/i)
  if (store.length > 0) return store

  if (slug === PRIMARY_GAME) {
    const press = filesIn(LIBRARY)
    if (press.length > 0) return press
  }

  return filesIn(path.join(WIKI_ART, slug))
}

/**
 * Upload a file once, keyed on the filename it will be stored under.
 *
 * Re-running any of these passes must not produce a second copy of the same
 * picture, so an existing row with this filename is reused. The consequence —
 * the one `seed:posters --force` exists for — is that correcting a *credit*
 * needs the row deleted first, because an ordinary run will find it and stop.
 */
export const attachImage = async (
  payload: Payload,
  file: string,
  filename: string,
  alt: string,
  credit: string,
): Promise<number | string | null> => {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) {
    /*
      The row is reused, but its alt is corrected.

      These passes are keyed on filename, so a run after the alt rule changed
      would find every row and write none of them — the wording would be fixed
      for a fresh database and stale on every existing one, which is the split
      `correctConfidenceCopy` exists to close for copy and is the same trap
      here. The credit is deliberately *not* touched: `seed:posters --force`
      owns that, because a credit that has been corrected by hand must not be
      overwritten by a seeder.
    */
    const row = existing.docs[0] as { id: number | string; alt?: string | null }
    if (alt && row.alt !== alt) {
      await payload.update({ collection: 'media', id: row.id, data: { alt } as never, depth: 0 })
    }
    return row.id
  }

  try {
    const created = await payload.create({
      collection: 'media',
      data: { alt, credit } as never,
      file: {
        data: fs.readFileSync(file),
        mimetype: file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
        name: filename,
        size: fs.statSync(file).size,
      },
    })
    return created.id
  } catch {
    return null
  }
}

/**
 * What the wiki called the thing in a given picture, where it is known.
 *
 * `assets/_wiki/<slug>/<wikiTitle>.png` is written by the harvester from the
 * entity's own `wikiTitle`, so the harvest can map the file back to the name
 * exactly — no parsing, no guessing. That name is a sourced fact and can be
 * printed as a caption.
 *
 * Nothing else gets one. A store screenshot is an unlabelled frame, and
 * `assets/_wiki` files fetched by `tools/fetch-game-art.mjs` are named by the
 * wiki's own file name (`OfficialScreenshots-GTAVI-PromotionalWebsite-
 * LuciaCaminos-SS1.jpg`) rather than by an entity, so reading a subject out of
 * one would be inference. A caption is a claim about what a picture shows, and
 * this project does not publish those on a guess — `docs/ASSETS.md` and the
 * `PageHeader` rule are the same argument.
 */
export const captionsFor = (slug: string): Map<string, string> => {
  const captions = new Map<string, string>()
  const harvest = path.resolve('src/seed/raw/wiki-entities', `${slug}.json`)
  if (!fs.existsSync(harvest)) return captions

  try {
    const parsed = JSON.parse(fs.readFileSync(harvest, 'utf8')) as {
      entities?: { title?: string; imageFile?: string }[]
    }
    for (const entity of parsed.entities ?? []) {
      if (!entity.imageFile || !entity.title) continue
      captions.set(path.resolve(entity.imageFile), entity.title)
    }
  } catch {
    /* A harvest we cannot read means no captions, not a failed run. */
  }
  return captions
}
