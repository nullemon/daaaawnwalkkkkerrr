import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

import config from '../payload.config'
import { rich, type Block } from './lexical'
import { slugify } from '../fields/shared'
import { SECTION_PATH, type GameScopedCollection } from '../lib/tenancy'

/**
 * The third pass of guide writing.
 *
 *   pnpm seed:topics
 *
 * `query-articles.ts` writes the eight topics a store page settles outright.
 * `deep-guides.ts` adds engine, composer, rarity bands and category roundups.
 * This is what is left, and it is two things:
 *
 *   1. **Feature questions** - crossplay, split screen, cloud saves, co-op
 *      player counts, what the recommended tier actually buys you. Every one
 *      of these is a high-volume search with a one-word answer, and every one
 *      is settled by the store listing's own `categories` array.
 *
 *      These are the only pages here that answer in the *negative*. "Does X
 *      have crossplay" is a real question, and "the store page does not list
 *      it" is a real answer - as long as the page says that rather than "no",
 *      because a listing is evidence of presence and only weak evidence of
 *      absence. That distinction is the whole reason these are written out
 *      here instead of generated from a yes/no table.
 *
 *   2. **Stat comparisons** - the harvested entities carry their wiki's
 *      infobox fields, so thirty-six weapons that all record a magazine size
 *      and an ammunition type can be put side by side. That is a page the
 *      source wiki does not have, because it files each weapon separately;
 *      compiling across records is the one thing a database can do that a
 *      page-per-subject wiki cannot.
 *
 * Nothing here needs anybody to have played the game, which is deliberate -
 * every wiki in this network has at least one unreleased game's problem.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url))
const GAME_DIR = path.join(dirname, 'raw', 'games')
const REF_DIR = path.join(dirname, 'raw', 'reference')
const ENTITY_DIR = path.join(dirname, 'raw', 'wiki-entities')
const ART_DIR = path.resolve('assets/_games')

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`

const listOf = (values: string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`

/** Infobox keys that identify rather than describe, so make poor comparisons. */
const NOT_COMPARABLE =
  /^(name|title|image|caption|imagecaption|alt|wiki|url|id|appearances?|voice|actor|portrayed|quote|hidecat|width|height|px)$/i

/** A readable label for a wiki infobox key: "ammotype" -> "ammunition". */
const PRETTY: Record<string, string> = {
  ammotype: 'ammunition',
  maxammo: 'maximum ammunition',
  hairc: 'hair colour',
  eyec: 'eye colour',
}
const label = (key: string) => PRETTY[key.toLowerCase()] ?? key.replace(/_/g, ' ').toLowerCase()

/** A different screenshot per page, cycling the game's own library. */
const screenshots = (slug: string, payload: Payload, credit: string) => {
  const dir = path.join(ART_DIR, slug)
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^screenshot-\d+\.(jpg|png)$/i.test(name)).sort()
    : []
  // Start part-way in so these pages do not open with the same shot the
  // deep-guide pass already used on its first page.
  let index = 3

  return async (pageSlug: string, alt: string): Promise<number | string | null> => {
    if (files.length === 0) return null
    const file = files[index % files.length]
    index += 1

    const filename = `${slug}-topic-${pageSlug}${path.extname(file)}`.slice(0, 90)
    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs.length > 0) return existing.docs[0].id

    try {
      const created = await payload.create({
        collection: 'media',
        data: { alt, credit } as never,
        file: {
          data: fs.readFileSync(path.join(dir, file)),
          mimetype: file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          name: filename,
          size: fs.statSync(path.join(dir, file)).size,
        },
      })
      return created.id
    } catch {
      return null
    }
  }
}

async function upsert(
  payload: Payload,
  gameId: number | string,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'guides',
    where: { and: [{ slug: { equals: slug } }, { game: { equals: gameId } }] },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'guides',
      id: existing.docs[0].id,
      data: { ...data, game: gameId } as never,
      depth: 0,
    })
    return
  }
  await payload.create({ collection: 'guides', data: { ...data, game: gameId } as never, depth: 0 })
}

/**
 * The caveat every negative answer on this site carries.
 *
 * A store listing records the features a publisher wants indexed. Missing is
 * not the same as absent, and saying so is the difference between a page a
 * reader can rely on and one that will be wrong on launch day.
 */
const ABSENCE =
  'A store listing records what a publisher has declared, and publishers add to it as features are finalised - particularly before release. So this page says what is listed today and when it was read, not what the game will never have. If the listing changes, so does this page.'

async function run(): Promise<void> {
  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  const games = await payload.find({ collection: 'games', limit: 50, sort: 'title', depth: 0 })
  const authors = await payload.find({ collection: 'authors', limit: 20, depth: 0 })
  const byline = (role: RegExp) =>
    authors.docs.find((a) => role.test(String(a.role ?? '')))?.id ?? authors.docs[0]?.id

  let total = 0

  for (const game of games.docs) {
    const name = (game.shortTitle as string) || (game.title as string)

    const readJson = (dir: string) => {
      const file = path.join(dir, `${game.slug}.json`)
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
    }

    const steam = readJson(GAME_DIR)
    const reference = readJson(REF_DIR)
    const harvest = readJson(ENTITY_DIR)

    const sources = [
      ...(steam?.storeUrl
        ? [
            {
              title: `${steam.title} - official store page`,
              url: steam.storeUrl,
              retrieved: steam.fetchedAt,
            },
          ]
        : []),
      ...(reference?.wikipedia
        ? [
            {
              title: `${reference.wikipedia.title} - Wikipedia (${reference.wikipedia.licence})`,
              url: reference.wikipedia.url,
              retrieved: reference.fetchedAt,
            },
          ]
        : []),
    ]

    const wikiSource = harvest?.host
      ? [
          {
            title: `${name} community wiki (CC BY-SA)`,
            url: `https://${harvest.host}/`,
            retrieved: harvest.fetchedAt,
          },
        ]
      : []

    const pick = screenshots(
      game.slug as string,
      payload,
      `${game.title}, copyright ${steam?.publishers?.[0] ?? 'its publisher'}. Used for identification and commentary.`,
    )

    let written = 0

    const write = async (
      slug: string,
      title: string,
      query: string,
      summary: string,
      blocks: Block[],
      role: RegExp = /Launch|Performance|Achievements/,
      extraSources: typeof sources = [],
    ) => {
      const image = await pick(slug, `${game.title} - ${title}`)
      await upsert(payload, game.id, slug, {
        title,
        slug,
        targetQuery: query,
        summary: summary.slice(0, 320),
        body: rich(...blocks),
        ...(image ? { image } : {}),
        author: byline(role),
        sources: [...sources, ...extraSources],
        confidence: 'high',
      })
      written += 1
      total += 1
    }

    // --- 1. Feature questions ----------------------------------------------

    const categories: string[] = steam?.categories ?? []
    const feature = (...needles: string[]) =>
      categories.filter((entry) =>
        needles.some((needle) => entry.toLowerCase().includes(needle.toLowerCase())),
      )
    const dated = steam?.fetchedAt ? ` (read ${steam.fetchedAt})` : ''

    /*
      Only run this family where the listing actually carries a feature list.
      Without one there is no evidence either way, and a page saying so is
      noise rather than an answer.
    */
    if (categories.length > 0) {
      // --- Crossplay
      const cross = feature('cross-platform', 'crossplay')
      await write(
        'crossplay',
        `Does ${name} have crossplay?`,
        `${name} crossplay`,
        cross.length
          ? `Yes - ${game.title} lists ${listOf(cross)} on its store page. What that covers, and what is still unconfirmed.`
          : `${game.title} does not list cross-platform play on its store page${dated}. What is listed, and why an absence is not a no.`,
        cross.length
          ? [
              `${game.title} lists **${listOf(cross)}** among its store features, so players on different platforms can play together.`,
              { h: 'What the listing does and does not settle' },
              'A cross-platform tag says the feature exists. It does not say which platforms share a pool, whether it can be turned off, or whether progression carries across - three things people mean by "crossplay" and none of which a store tag answers.',
              { h: 'Everything multiplayer on the listing' },
              { ul: feature('multi-player', 'co-op', 'pvp', 'cross') },
              { h: 'When this page gets more' },
              'The specifics usually arrive in a networking blog post or a launch FAQ. When one exists it is cited here and this paragraph goes.',
            ]
          : [
              `${game.title} **does not list** cross-platform play among its store features${dated}.`,
              { h: 'What is listed' },
              {
                ul: feature('multi-player', 'single-player', 'co-op', 'pvp').length
                  ? feature('multi-player', 'single-player', 'co-op', 'pvp')
                  : ['Nothing in the multiplayer family'],
              },
              { h: 'Why this page does not simply say no' },
              ABSENCE,
            ],
        /Launch/,
      )

      // --- Co-op and player counts
      const coop = feature('co-op', 'coop')
      const pvp = feature('pvp')
      await write(
        'co-op',
        `Is ${name} co-op, and how many players?`,
        `${name} co-op`,
        coop.length
          ? `${game.title} lists ${listOf(coop)}. What the store tags settle about party size, and what they do not.`
          : `${game.title} lists no co-operative mode on its store page${dated}. What it does list instead.`,
        coop.length
          ? [
              `${game.title} lists **${listOf(coop)}** among its store features.`,
              { h: 'The full multiplayer set' },
              { ul: [...new Set([...coop, ...pvp, ...feature('multi-player', 'single-player')])] },
              { h: 'How many players' },
              'Store tags name the modes, never the party size. A listing that says "Online Co-op" is as true of two players as of four, so the number is not on this page until a source states it - and the source that usually does is the mode select screen.',
              { h: 'Campaign or a separate mode' },
              'Whether co-op runs the campaign or a mode built for it is the other thing tags do not distinguish, and it is usually what people are actually asking. Where a developer has said which, it is quoted here.',
            ]
          : [
              `${game.title} **does not list** a co-operative mode${dated}.`,
              { h: 'What it does list' },
              { ul: categories.slice(0, 12) },
              { h: 'Before taking that as final' },
              ABSENCE,
            ],
        /Launch/,
      )

      // --- Split screen
      const split = feature('split screen', 'shared/split')
      await write(
        'split-screen',
        `Does ${name} have split screen?`,
        `${name} split screen`,
        split.length
          ? `Yes - ${game.title} lists ${listOf(split)}, so two people can play on one machine.`
          : `${game.title} does not list local or split-screen play on its store page${dated}.`,
        split.length
          ? [
              `${game.title} lists **${listOf(split)}**, which is the store's tag for two people playing on one screen.`,
              { h: 'What it does not tell you' },
              'Whether split screen covers the whole campaign or only some modes, and whether it splits horizontally or vertically. Neither is in a store tag.',
              { h: 'The rest of the local set' },
              { ul: feature('local', 'shared', 'split', 'remote play') },
            ]
          : [
              `${game.title} **does not list** shared or split-screen play${dated}.`,
              { h: 'The nearest thing that is listed' },
              {
                ul: feature('remote play', 'local', 'shared').length
                  ? feature('remote play', 'local', 'shared')
                  : ['No local-play feature of any kind is listed'],
              },
              { h: 'Remote Play Together is not the same thing' },
              'Steam can stream a second controller to a friend over the internet, and some listings carry that instead of local co-op. It needs one person to own the game and a good connection, and it is not split screen.',
              { h: 'On absence' },
              ABSENCE,
            ],
        /Launch/,
      )

      // --- Cloud saves
      const cloud = feature('cloud')
      await write(
        'cloud-saves',
        `Does ${name} have cloud saves?`,
        `${name} cloud saves`,
        cloud.length
          ? `Yes - ${game.title} lists ${listOf(cloud)}, so a save follows you between machines.`
          : `${game.title} does not list cloud saves on its store page${dated}. What that means for moving a save.`,
        cloud.length
          ? [
              `${game.title} lists **${listOf(cloud)}**. A save made on one machine is available on the next one you sign in from.`,
              { h: 'What syncs, and what does not' },
              'Cloud sync covers whatever the developer configured - usually saves, often settings, rarely screenshots or mod configuration. The split is set per game and is not published.',
              { h: 'If two machines disagree' },
              'A conflict prompt appears when both have changed since the last sync. Picking the wrong side is the commonest way people lose a run, and the safe move is to copy the local save folder somewhere else before answering it.',
            ]
          : [
              `${game.title} **does not list** cloud saves${dated}, so a save may live only on the machine that made it.`,
              { h: 'Moving one by hand' },
              'Where a game keeps its saves is game-specific, and this page will name the folder once it can be verified rather than guessed. Copying the whole folder while the game is closed is the general answer.',
              { h: 'On absence' },
              ABSENCE,
            ],
        /Performance|Launch/,
      )

      // --- What kind of game
      const genres: string[] = steam?.genres ?? []
      if (genres.length) {
        await write(
          'what-kind-of-game',
          `What kind of game is ${name}?`,
          `what kind of game is ${name}`,
          `${game.title} is filed as ${listOf(genres)}${steam?.developers?.length ? `, made by ${listOf(steam.developers)}` : ''}. What the tags settle, and what they hide.`,
          [
            `${game.title} is filed under **${listOf(genres)}** by its own publisher${steam?.developers?.length ? `, and is made by ${listOf(steam.developers)}` : ''}.`,
            { h: 'How it is played' },
            {
              ul: [
                ...(feature('single-player').length ? ['Playable alone'] : []),
                ...(feature('multi-player').length ? ['Has a multiplayer component'] : []),
                ...(feature('controller').length ? [feature('controller')[0]] : []),
                ...genres.map((entry) => `Genre: ${entry}`),
              ],
            },
            { h: 'Why a genre tag is weak evidence' },
            'Store genres are chosen for discovery, not description. Two tags have to cover everything from the combat system to the structure, which is how a game ends up tagged Action and Adventure while being neither in the sense a reader means. The mechanics pages on this wiki are built from what has actually been shown, and those are the ones to trust over this.',
            { h: 'On comparisons' },
            'Anything asking "is it like <other game>" is a judgement, and this site does not publish judgements it cannot source. What it does publish is the feature list above, which is usually what the question is really after.',
          ],
          /Launch/,
        )
      }

      // --- Who is making it
      {
        const wiki = reference?.wikipedia?.facts ?? {}
        const named: string[] = []
        for (const [key, role] of [
          ['director', 'Director'],
          ['producer', 'Producer'],
          ['designer', 'Designer'],
          ['programmer', 'Lead programmer'],
          ['artist', 'Art director'],
          ['writer', 'Writer'],
          ['composer', 'Composer'],
        ] as const) {
          if (wiki[key]) named.push(`${role}: ${wiki[key]}`)
        }

        /*
          Two named people is the floor. One is usually the director alone,
          which the release-date page already carries, and a page built on it
          would be a headline with nothing under it.
        */
        if (named.length >= 2) {
          await write(
            'who-is-making-it',
            `Who is making ${name}?`,
            `who is making ${name}`,
            `${game.title} is developed by ${listOf(steam?.developers ?? [String(wiki.developer ?? 'its studio')])}. The ${named.length} credited leads, and what is known about the studio.`,
            [
              `${game.title} is developed by **${listOf(steam?.developers ?? [String(wiki.developer ?? 'its studio')])}**${steam?.publishers?.length ? ` and published by ${listOf(steam.publishers)}` : ''}.`,
              { h: 'Credited leads' },
              { ul: named },
              { h: 'Where these names come from' },
              "Wikipedia's infobox for the game, which in turn cites press material and the credits where they have been published. Named leads change during development and a credit list is not final until the game ships, so this page carries the date it was read rather than presenting itself as the finished credits.",
              { h: 'What is not here' },
              'Team size, who is doing what day to day, and anything about how development has gone. Those come from interviews and from people inside a studio, and none of it is settled by an infobox.',
            ],
            /Launch/,
          )
        }
      }

      // --- Content notices
      if (steam?.contentDescriptors) {
        const descriptors = String(steam.contentDescriptors)
          .replace(/^[^:]*:\s*/, '')
          .split(/,\s*/)
          .map((entry) => entry.trim().replace(/\.$/, ''))
          .filter(Boolean)
        if (descriptors.length) {
          await write(
            'content-warnings',
            `What is in ${name}? Content notices`,
            `${name} content warnings`,
            `${game.title} carries publisher content notices for ${listOf(descriptors.slice(0, 3)).toLowerCase()}. The full list, as declared.`,
            [
              `${game.title} carries content notices declared by its own publisher${dated}.`,
              { h: 'What is declared' },
              { ul: descriptors },
              { h: 'Who is declaring it' },
              "These are the publisher's own words on the store page, not a rating board's and not ours. A board rating, where one exists, is a separate judgement on its own page.",
              { h: 'What this does not cover' },
              'Notices name categories, not moments. A reader avoiding one specific thing - an animal death, a particular kind of injury - is not served by a category list, and the honest answer is that nobody has published that index for this game.',
            ],
            /Launch/,
          )
        }
      }

      // --- Minimum against recommended
      const min = steam?.requirements?.minimum ?? []
      const rec = steam?.requirements?.recommended ?? []
      if (min.length && rec.length) {
        const pairs = rec
          .map((entry: { label: string; value: string }) => {
            const other = min.find(
              (m: { label: string; value: string }) =>
                m.label.toLowerCase() === entry.label.toLowerCase(),
            )
            return other && other.value !== entry.value
              ? `${entry.label} - minimum: ${other.value} | recommended: ${entry.value}`
              : null
          })
          .filter(Boolean) as string[]

        if (pairs.length) {
          await write(
            'minimum-vs-recommended',
            `${name}: minimum against recommended, and what the gap buys`,
            `${name} recommended specs`,
            `Where ${game.title}'s two published tiers actually differ - ${plural(pairs.length, 'component')} - and what a publisher means by each.`,
            [
              `${game.title} publishes two tiers. They differ on ${plural(pairs.length, 'component')}; everything else is identical, which is the part a specs table usually buries.`,
              { h: 'Where they differ' },
              { ul: pairs },
              { h: 'What the tiers mean' },
              'Neither tier comes with a frame rate or a resolution attached, and without those a requirement is close to unfalsifiable. The convention is that minimum targets 30fps at 1080p on the lowest preset and recommended targets 60fps at 1080p on something mid, but a convention is not a commitment and publishers do not state which they used.',
              { h: 'What to do with that' },
              'Treat minimum as "will start and run" and recommended as "was tested at a normal setting". Anything above recommended is unmapped: no third tier is published, so a page claiming what a high-end card gets here would be inventing it.',
              { h: 'The full tables' },
              `Both tiers in full, unedited, are on the system requirements page for ${name}.`,
            ],
            /Performance/,
          )
        }
      }
    }

    // --- 2. Stat comparisons ------------------------------------------------

    /** Collections that got a comparison page, so family 3 does not repeat them. */
    const compared = new Set<string>()

    if (harvest?.entities?.length) {
      type Entity = {
        title: string
        collection: string
        facts?: Record<string, string>
      }
      const entities = harvest.entities as Entity[]

      const byCollection = new Map<string, Entity[]>()
      for (const entity of entities) {
        if (!entity.facts || Object.keys(entity.facts).length === 0) continue
        byCollection.set(entity.collection, [...(byCollection.get(entity.collection) ?? []), entity])
      }

      let comparisons = 0

      for (const [collection, members] of [...byCollection.entries()].sort(
        (a, b) => b[1].length - a[1].length,
      )) {
        if (members.length < 4 || comparisons >= 9) continue

        /*
          Which infobox fields most of these records actually carry. A field
          present on two of forty is not a comparison, it is a footnote.
        */
        const frequency = new Map<string, number>()
        for (const member of members) {
          for (const key of Object.keys(member.facts ?? {})) {
            if (NOT_COMPARABLE.test(key)) continue
            frequency.set(key, (frequency.get(key) ?? 0) + 1)
          }
        }

        /*
          Three fields, but only three that say different things.

          Gears files a weapon's `manufacturer` and its `affiliation` and both
          read "Coalition of Ordered Governments" on most rows, so taking the
          three commonest fields produced a line that was two hundred and
          seventy-five characters of the same phrase three times. A field
          earns its place by disagreeing with the ones already chosen on at
          least half the records.
        */
        const ranked = [...frequency.entries()]
          .filter(([, count]) => count >= Math.max(3, members.length * 0.5))
          .sort((a, b) => b[1] - a[1])
          .map(([key]) => key)

        const shared: string[] = []
        for (const key of ranked) {
          if (shared.length >= 3) break
          const differs = members.filter((member) => {
            const value = member.facts?.[key]
            if (!value) return false
            return shared.every((chosen) => member.facts?.[chosen] !== value)
          }).length
          if (shared.length === 0 || differs >= members.length * 0.5) shared.push(key)
        }

        if (shared.length < 2) continue

        /*
          An infobox field can hold a dozen comma-separated values. Printing
          all of them turns a comparison into a wall, so a long one is cut to
          three and says how many it left - which keeps the line scannable
          without quietly pretending the rest do not exist. The record's own
          page carries the full list.
        */
        const trim = (value: string) => {
          const values = value.split(/,\s*/).filter(Boolean)
          return values.length > 3
            ? `${values.slice(0, 3).join(', ')} +${values.length - 3} more`
            : value
        }

        const sorted = [...members].sort((a, b) => a.title.localeCompare(b.title))
        const lines = sorted.map((member) => {
          const parts = shared
            .map((key) => (member.facts?.[key] ? `${label(key)}: ${trim(member.facts[key])}` : null))
            .filter(Boolean)
          return `${member.title}${parts.length ? ` - ${parts.join(' | ')}` : ' - not recorded'}`
        })

        const noun = collection.replace(/ies$/, 'y').replace(/s$/, '')
        await write(
          `${collection}-compared`,
          `Every ${noun} in ${name}, compared`,
          `${name} all ${collection}`,
          `${plural(sorted.length, noun)} in ${game.title} side by side on ${listOf(shared.map(label))} - compiled from records the source wiki keeps one page apart.`,
          [
            `${plural(sorted.length, noun)} are recorded for ${game.title}. Every one of them carries ${listOf(shared.map(label))}, so for once they can be read against each other rather than one page at a time.`,
            { h: `All ${sorted.length}` },
            { ul: lines },
            { h: 'Where the figures come from' },
            "Each line is that record's own infobox on the community wiki these were compiled from, restated and not recalculated. Where a field is blank there it is blank here - the alternative is a plausible number, and a plausible number is the one thing this site will not print.",
            { h: 'Why this page exists' },
            'A wiki files one subject per page, which turns any question of the form "which of these is biggest" into a research task. A database does not have that problem, and this page is what the difference buys.',
          ],
          /Achievements|Launch/,
          wikiSource,
        )
        comparisons += 1
        compared.add(collection)

        /*
          The strongest shared field, used as a grouping: every weapon by
          manufacturer, every character by allegiance. A different axis from
          the category roundups, which use the source wiki's own filing.
        */
        const groupKey = shared[0]
        const groups = new Map<string, string[]>()
        for (const member of sorted) {
          const value = member.facts?.[groupKey]
          if (!value || value.length > 60) continue
          groups.set(value, [...(groups.get(value) ?? []), member.title])
        }
        const biggest = [...groups.entries()]
          .filter(([, titles]) => titles.length >= 3)
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 2)

        for (const [value, titles] of biggest) {
          const slug = `${collection}-${slugify(value)}`.slice(0, 60)
          await write(
            slug,
            `Every ${noun} in ${name} with ${label(groupKey)} ${value}`,
            `${name} ${value} ${collection}`,
            `${plural(titles.length, noun)} in ${game.title} share ${label(groupKey)} ${value} - ${listOf(titles.slice(0, 3))} among them.`,
            [
              `${plural(titles.length, noun)} recorded for ${game.title} share the same ${label(groupKey)}: **${value}**.`,
              { h: `The ${titles.length}` },
              { ul: titles },
              { h: 'What the grouping is' },
              `This is not a grouping the game makes. It is what happens when every ${noun} record is read for one field and sorted on it, which is useful precisely because nobody publishes it - and which is only as good as the field, and the field came from a community wiki rather than from a developer.`,
            ],
            /Achievements|Launch/,
            wikiSource,
          )
          comparisons += 1
        }
      }
    }

    // --- 3. Coverage pages ---------------------------------------------------

    /*
      What is recorded about a section, and - the part nobody else publishes -
      what is not.

      This is the site's own rule turned into a page. A reader searching
      "silent hill townfall locations" gets a list everywhere; what they cannot
      get anywhere is an honest statement of how complete that list is and
      which fields are still empty. That is worth its own page, and it is only
      worth it where there is no comparison page for the same section already.
    */
    const COVERAGE: { collection: GameScopedCollection; noun: string; plural: string }[] = [
      { collection: 'characters', noun: 'character', plural: 'characters' },
      { collection: 'regions', noun: 'location', plural: 'locations' },
      { collection: 'enemies', noun: 'enemy', plural: 'enemies' },
      { collection: 'items', noun: 'item', plural: 'items' },
      { collection: 'mechanics', noun: 'mechanic', plural: 'mechanics' },
      { collection: 'quests', noun: 'mission', plural: 'missions' },
      { collection: 'achievements', noun: 'achievement', plural: 'achievements' },
    ]

    for (const section of COVERAGE) {
      if (compared.has(section.collection)) continue

      const rows = (
        await payload.find({
          collection: section.collection,
          where: { game: { equals: game.id } },
          limit: 500,
          depth: 0,
          pagination: false,
        })
      ).docs as unknown as { title: string; summary?: string | null; image?: unknown }[]

      if (rows.length < 3) continue

      const described = rows.filter((row) => (row.summary ?? '').trim().length > 40).length
      const illustrated = rows.filter((row) => row.image).length
      const titles = [...rows].sort((a, b) => a.title.localeCompare(b.title)).map((r) => r.title)

      await write(
        `${section.collection}-known`,
        `Every ${section.noun} in ${name}, and what is still unknown`,
        `${name} ${section.plural}`,
        `${plural(rows.length, section.noun, section.plural)} are recorded for ${game.title}. ${described} carry a written description and ${illustrated} carry an image - this page says which, rather than implying the list is finished.`,
        [
          `${plural(rows.length, section.noun, section.plural)} are recorded for ${game.title}. This page is the list plus the thing a list normally hides: how much of it is actually filled in.`,
          { h: `All ${rows.length}` },
          { ul: titles },
          { h: 'How complete this is' },
          {
            ul: [
              `${described} of ${rows.length} carry a written description`,
              `${illustrated} of ${rows.length} carry an image`,
              `${rows.length - described} are recorded by name only, because no source has said more`,
            ],
          },
          { h: 'Why a name-only entry is still here' },
          'Because knowing a thing exists is itself information, and because the alternative - leaving it out until somebody can write a paragraph - makes the list look finished when it is not. An entry with nothing under it is an admission, and admissions are the point of this site.',
          { h: 'Where the full records are' },
          `Each of these has its own page under ${SECTION_PATH[section.collection]}, with its sources and its confidence rating.`,
        ],
        /Achievements|Launch/,
        wikiSource,
      )
    }

    // --- 4. The demand side --------------------------------------------------

    /*
      Two pages built from the harvested searches themselves.

      Every wiki publishes answers. None of them publishes the questions, which
      means none of them can tell you what it has not covered. These two can:
      one lists what people search for and where this wiki answers it, the
      other lists what people search for that nobody here can answer yet.

      The second page is the uncomfortable one, and it is the more useful. A
      reader who knows a question is open stops looking; a reader who finds a
      confident guess stops looking too, and is wrong.
    */
    const queryFile = path.join(dirname, 'raw', 'queries', `${game.slug}.json`)
    if (fs.existsSync(queryFile)) {
      const harvestQ = JSON.parse(fs.readFileSync(queryFile, 'utf8')) as {
        terms: string[]
        queries: { query: string; weight: number }[]
      }

      const STOP = new Set([
        'the', 'a', 'an', 'is', 'it', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
        'how', 'what', 'when', 'where', 'why', 'does', 'do', 'can', 'you', 'i',
        'be', 'are', 'was', 'will', 'there', 'much', 'many', 'long', 'get', 'game',
      ])
      const words = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((word) => word.length > 2 && !STOP.has(word))

      /* The game's own name carries every comparison, so it is discounted on
         both sides - the same correction the hub's matcher needs. */
      const gameWords = new Set(harvestQ.terms.flatMap((term) => words(term)))

      const mine = (
        await payload.find({
          collection: 'guides',
          where: { game: { equals: game.id } },
          limit: 600,
          depth: 0,
          pagination: false,
        })
      ).docs as unknown as { title: string; targetQuery?: string | null }[]

      const indexed = mine.map((guide) => ({
        title: guide.title,
        terms: new Set([...words(guide.title), ...words(guide.targetQuery ?? '')]),
      }))

      const answered: string[] = []
      const open: string[] = []
      const seenShape = new Set<string>()

      for (const entry of harvestQ.queries.slice(0, 400)) {
        const asked = words(entry.query).filter((word) => !gameWords.has(word))
        if (asked.length < 2) continue

        // One row per distinct question shape, so the list is not forty
        // rewordings of "release date".
        const shape = [...asked].sort().join(' ')
        if (seenShape.has(shape)) continue
        seenShape.add(shape)

        let best: (typeof indexed)[number] | null = null
        let bestScore = 0
        for (const candidate of indexed) {
          const score = asked.filter(
            (word) => candidate.terms.has(word) && !gameWords.has(word),
          ).length
          if (score > bestScore) {
            best = candidate
            bestScore = score
          }
        }

        if (best && bestScore >= 2) {
          if (answered.length < 30) answered.push(`"${entry.query}" - answered by: ${best.title}`)
        } else if (open.length < 30) {
          open.push(`"${entry.query}"`)
        }
      }

      if (answered.length >= 5) {
        await write(
          'most-searched',
          `The most-searched questions about ${name}, and where they are answered`,
          `${name} questions`,
          `${answered.length} of the questions people actually type about ${game.title}, each matched to the page here that answers it. Harvested from search autocomplete, not guessed.`,
          [
            `These are questions people actually type about ${game.title}, taken from search autocomplete rather than from what we imagined a reader might want. Each one is matched to the page here that answers it.`,
            { h: `${answered.length} questions with an answer` },
            { ul: answered },
            { h: 'How the list is built' },
            "Autocomplete completions for the game's name are collected against a few hundred prefixes, deduplicated by question shape, and matched against every page on this wiki on the words that are not the game's own name. That last part matters: without it every question matches every page, because every question names the game.",
            { h: 'What it is not' },
            'Not a ranking by volume - autocomplete gives order, not numbers, and a page claiming search volumes it cannot measure would be inventing them. Treat the order as rough.',
          ],
          /Launch/,
        )
      }

      if (open.length >= 5) {
        await write(
          'open-questions',
          `What people ask about ${name} that nobody can answer yet`,
          `${name} unanswered questions`,
          `${open.length} real searches about ${game.title} with no published answer - listed rather than filled with a guess. What each one needs before it can be written.`,
          [
            `${open.length} of the questions people search about ${game.title} have no answer on this wiki, and this page is the list of them.`,
            { h: 'Why publish a list of gaps' },
            'Because the alternative is what most wikis do: write the page anyway, from a trailer or from a reasonable assumption, and let a reader take it for a fact. A question nobody has answered is worth knowing about, and a reader who sees it here stops searching instead of finding a confident guess somewhere else.',
            { h: `The ${open.length} open questions` },
            { ul: open },
            { h: 'What they are waiting on' },
            {
              ul: [
                'Anything about balance, difficulty or length needs somebody to have played a finished build',
                'Anything about performance needs the game running on measured hardware',
                'Anything about story specifics needs release, because pre-release material is chosen to mislead',
                "Anything about post-launch plans needs the developer to say it, and a roadmap is not a promise",
              ],
            },
            { h: 'These get written' },
            'This list is regenerated from fresh search data, and a question leaves it as soon as a page here answers it. If you know a published source that settles one, the correction form on this wiki is the fastest way to get it written.',
          ],
          /Launch/,
        )
      }
    }

    console.log(`  ${name.padEnd(24)} ${written} topic guides`)
  }

  console.log(`\n${total} guides written`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
