import 'dotenv/config'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'
import config from '../payload.config'
import { GAME_SCOPED } from '../lib/tenancy'

/**
 * Is any wiki showing another game's pictures?
 *
 *   pnpm check:art
 *
 * ## Why this reads the pixels and not the filenames
 *
 * Every seeder names a file after the game it is writing it for, so a filename
 * check asks the seeder whether the seeder was right. It always says yes.
 *
 * `seed:guide-images` fell back to `assets/_library/screenshots` — Dawnwalker's
 * press kit — for any wiki with no store art of its own. That fallback was
 * written when Dawnwalker was the only such wiki. GTA 6 and Fire Emblem
 * arrived with no Steam listing, took the same branch, and were illustrated
 * with Rebel Wolves' screenshots saved as `gta-6-guide-*.png` and credited, by
 * the next line of the same function, **"Grand Theft Auto VI © Rockstar
 * Games"**. 54 pages across two wikis, each showing one company's work under
 * another company's copyright line.
 *
 * Nothing caught it. The files were on disk, the records pointed at them, the
 * credits were well-formed, `pnpm verify` passed and the build was green. The
 * filenames agreed with the seeder that wrote them, and the only disagreement
 * in the whole system was between the bytes and the name.
 *
 * So: hash what is actually on disk, and ask which games use each set of bytes.
 * One picture used by two wikis is either a misattribution or a duplicate
 * upload, and both are worth a sentence.
 *
 * ## The three cheaper checks it does as well
 *
 * A credit or an alt line naming a different game than the record it sits on,
 * and a record pointing at a media row whose file is gone. None of those needs
 * a hash; all three are the same question asked of the metadata, and a picture
 * that fails one of them is wrong whatever its pixels are.
 */

const MEDIA_DIR = path.resolve('media')
const IMAGE_FIELDS = ['image', 'portrait', 'photo', 'icon', 'logo', 'poster', 'avatar', 'emblem']

type Game = { id: string | number; slug: string; title: string; shortTitle?: string | null }

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  const games = (
    await payload.find({ collection: 'games', depth: 0, limit: 0, pagination: false })
  ).docs as unknown as Game[]
  const slugOf = new Map<string | number, string>(games.map((g) => [g.id, g.slug]))

  const media = (
    await payload.find({ collection: 'media', depth: 0, limit: 0, pagination: false })
  ).docs as unknown as { id: string | number; filename?: string; credit?: string; alt?: string }[]
  const mediaById = new Map(media.map((m) => [m.id, m]))

  /*
    Which wikis point at each media row.

    **Every collection that can hold a picture, not only the game-scoped ones.**
    The first version of this check walked `GAME_SCOPED` and reported the site
    clean while never having looked at 321 company logos, 741 person
    photographs, 36 contributor avatars, or the hero and capsule art on the
    game records themselves. A check that answers "clean" about a third of the
    library is worse than no check, because it is believed.

    `companies`, `people` and `authors` are network-wide by design — a studio
    belongs to no single wiki — so they are attributed to `network` rather than
    to a game. That is not a loophole: a company logo shared with a game's
    screenshot is still two wikis' worth of wrong, and it still shows up as
    shared pixels.

    Rich text counts too. `bodyImages` on a guide is an array of uploads that
    never touches an `image` field, so the top-level scan walked straight past
    every picture inside an article.
  */
  const usedBy = new Map<string | number, Set<string>>()

  const note = (value: unknown, owner: string) => {
    if (typeof value !== 'number' && typeof value !== 'string') return
    if (!usedBy.has(value)) usedBy.set(value, new Set())
    usedBy.get(value)!.add(owner)
  }

  /**
   * Note every image field on a record, however deeply it is nested.
   *
   * Groups, arrays of blocks and arrays of rows all just become objects and
   * arrays by the time Payload hands them back, so one walk covers `theme.logo`
   * on a game, `profile.poster` beside it, and `bodyImages[].image` inside a
   * guide — including the ones added after this was written.
   *
   * Depth-limited because a populated relationship at `depth: 0` is an id, but
   * a future change to that could hand this a whole related document and walk
   * the graph. Eight is well past anything the schema does.
   */
  const walkFields = (value: unknown, owner: string, depth = 0): void => {
    if (depth > 8 || value === null || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const entry of value) walkFields(entry, owner, depth + 1)
      return
    }

    for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
      if (IMAGE_FIELDS.includes(key)) note(held, owner)
      else walkFields(held, owner, depth + 1)
    }
  }

  const WITH_PICTURES = [...GAME_SCOPED, 'companies', 'people', 'authors', 'games'] as const

  for (const collection of WITH_PICTURES) {
    const rows = await payload.find({
      collection: collection as Parameters<typeof payload.find>[0]['collection'],
      depth: 0,
      limit: 0,
      pagination: false,
    })
    for (const row of rows.docs as unknown as Record<string, unknown>[]) {
      /*
        A game's own art belongs to that game; a company's or a person's
        belongs to the network. `games` is keyed on its own id rather than on
        a `game` field it does not have.
      */
      const owner =
        collection === 'games'
          ? (slugOf.get(row.id as string | number) ?? 'unscoped')
          : (slugOf.get(row.game as string | number) ?? 'network')

      /*
        Every group, not a list of the ones somebody remembered.

        This walked the top level and then `theme` by name, which is how the
        cover art stayed outside it: a game's poster is `profile.poster`, and
        `profile` was not on the list. The count did not move when four covers
        were attached — the only visible sign, and only if you were watching
        the number. A check that names the places it looks will always be one
        group behind the schema, so it looks in all of them.
      */
      walkFields(row, owner)
    }
  }

  const problems: string[] = []
  const byHash = new Map<string, { wikis: Set<string>; files: string[] }>()
  let hashed = 0

  for (const [id, wikis] of usedBy) {
    const row = mediaById.get(id)
    if (!row?.filename) continue

    const file = path.join(MEDIA_DIR, row.filename)
    if (!fs.existsSync(file)) {
      problems.push(`MISSING FILE  ${[...wikis].join('/')} points at ${row.filename}, which is not on disk`)
      continue
    }

    const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex')
    hashed += 1
    if (!byHash.has(hash)) byHash.set(hash, { wikis: new Set(), files: [] })
    const entry = byHash.get(hash)!
    for (const wiki of wikis) entry.wikis.add(wiki)
    if (entry.files.length < 4) entry.files.push(row.filename)

    /*
      A credit or an alt line naming a game that is not the one using the
      picture. Only checked against titles long enough to be unambiguous —
      "Control" is a word as well as a game.
    */
    for (const wiki of wikis) {
      for (const [label, text] of [
        ['credit', String(row.credit ?? '')],
        ['alt', String(row.alt ?? '')],
      ] as const) {
        if (!text) continue
        const named = games.filter((g) => {
          const title = String(g.shortTitle || g.title)
          return title.length > 6 && text.toLowerCase().includes(title.toLowerCase())
        })
        if (named.length > 0 && !named.some((g) => g.slug === wiki)) {
          problems.push(`WRONG ${label.toUpperCase()}  ${wiki} uses ${row.filename}: "${text.slice(0, 70)}"`)
        }
      }
    }
  }

  for (const entry of byHash.values()) {
    if (entry.wikis.size <= 1) continue
    problems.push(
      `SHARED PIXELS  ${[...entry.wikis].join(' + ')} use identical bytes: ${entry.files.join(', ')}`,
    )
  }

  console.log(`checked ${hashed} pictures that a record actually points at, across ${games.length} wikis\n`)
  if (problems.length === 0) {
    console.log('No wiki is using another game’s pictures, and every credit names the right game.')
    process.exit(0)
  }

  for (const problem of problems) console.log('  ' + problem)
  console.log(`\n${problems.length} problems. A picture on the wrong wiki is a claim, not a decoration.`)
  process.exit(1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
