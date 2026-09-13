import 'dotenv/config'
import { getPayload } from 'payload'
import type { CollectionSlug, Payload } from 'payload'

import config from '../payload.config'
import {
  characters,
  courts,
  endings,
  guides,
  items,
  mechanics,
  perks,
  quests,
  regions,
  siteSettings,
  skillTrees,
} from './data'

/**
 * Idempotent seed. Records are matched on slug, so running this repeatedly
 * updates rather than duplicates — which matters because the data here is
 * expected to be corrected often.
 *
 * Relationships are wired in a second pass. Quests reference endings and
 * endings reference quests, so there is no ordering that satisfies both on the
 * way in.
 */

type SlugMap = Map<string, string | number>

async function upsert(
  payload: Payload,
  collection: CollectionSlug,
  slug: string,
  data: Record<string, unknown>,
): Promise<string | number> {
  const existing = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })

  if (existing.docs.length > 0) {
    const id = existing.docs[0].id
    await payload.update({ collection, id, data: data as never, depth: 0 })
    return id
  }

  const created = await payload.create({ collection, data: data as never, depth: 0 })
  return created.id
}

const idsFor = (map: SlugMap, slugs: string[] = []) =>
  slugs.map((slug) => map.get(slug)).filter((id): id is string | number => id !== undefined)

async function seed(): Promise<void> {
  // Payload takes a while to boot and says nothing while it does, which on a
  // cold Windows run looks exactly like a hang. Say something first.
  console.log('Starting Payload (this takes a moment on a cold run)...\n')
  const payload = await getPayload({ config })

  // --- An account to log in with -------------------------------------------
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.SEED_ADMIN_PASSWORD || 'changeme-please'
  const existingUsers = await payload.find({ collection: 'users', limit: 1, depth: 0 })
  const createdAdmin = existingUsers.totalDocs === 0
  if (createdAdmin) {
    await payload.create({
      collection: 'users',
      data: { email, password, name: 'Site owner', role: 'admin' },
    })
    console.log(`  created admin user ${email}`)
  } else {
    console.log('  admin user already exists, left alone')
  }

  // --- Pass one: records without cross-collection references ---------------
  const regionIds: SlugMap = new Map()
  for (const region of regions) {
    regionIds.set(region.slug, await upsert(payload, 'regions', region.slug, region))
  }
  console.log(`  ${regionIds.size} regions`)

  const courtIds: SlugMap = new Map()
  for (const court of courts) {
    courtIds.set(court.slug, await upsert(payload, 'courts', court.slug, court))
  }
  console.log(`  ${courtIds.size} courts`)

  const treeIds: SlugMap = new Map()
  for (const tree of skillTrees) {
    treeIds.set(tree.slug, await upsert(payload, 'skill-trees', tree.slug, tree))
  }
  console.log(`  ${treeIds.size} skill trees`)

  for (const perk of perks) {
    await upsert(payload, 'perks', perk.slug, { ...perk, tree: treeIds.get(perk.tree) })
  }
  console.log(`  ${perks.length} perks`)

  for (const item of items) {
    await upsert(payload, 'items', item.slug, { ...item, region: regionIds.get(item.region) })
  }
  console.log(`  ${items.length} items`)

  for (const mechanic of mechanics) {
    await upsert(payload, 'mechanics', mechanic.slug, mechanic)
  }
  console.log(`  ${mechanics.length} mechanics`)

  const characterIds: SlugMap = new Map()
  for (const character of characters) {
    const { ...rest } = character
    characterIds.set(
      character.slug,
      await upsert(payload, 'characters', character.slug, {
        ...rest,
        region: undefined,
      }),
    )
  }
  console.log(`  ${characterIds.size} characters`)

  const questIds: SlugMap = new Map()
  for (const quest of quests) {
    const { prereqs: _p, unlocks: _u, excludes: _e, region, ...rest } = quest
    questIds.set(
      quest.slug,
      await upsert(payload, 'quests', quest.slug, {
        ...rest,
        region: regionIds.get(region),
      }),
    )
  }
  console.log(`  ${questIds.size} quests`)

  const endingIds: SlugMap = new Map()
  for (const ending of endings) {
    const { requiredQuests: _r, ally: _a, ...rest } = ending as typeof ending & { ally?: string }
    endingIds.set(ending.slug, await upsert(payload, 'endings', ending.slug, rest))
  }
  console.log(`  ${endingIds.size} endings`)

  // --- Pass two: wire the graph -------------------------------------------
  for (const quest of quests) {
    const id = questIds.get(quest.slug)
    if (!id) continue
    await payload.update({
      collection: 'quests',
      id,
      depth: 0,
      data: {
        prereqs: idsFor(questIds, quest.prereqs),
        unlocks: idsFor(questIds, quest.unlocks),
        excludes: idsFor(questIds, quest.excludes),
      } as never,
    })
  }

  for (const ending of endings) {
    const id = endingIds.get(ending.slug)
    if (!id) continue
    const allySlug = (ending as { ally?: string }).ally
    await payload.update({
      collection: 'endings',
      id,
      depth: 0,
      data: {
        requiredQuests: idsFor(questIds, ending.requiredQuests),
        ally: allySlug ? characterIds.get(allySlug) : undefined,
      } as never,
    })
  }

  // Ally questlines, derived from the quests that name them.
  const questlines: Record<string, string[]> = {
    lacra: [
      'a-friend-like-this',
      'song-of-the-mountain',
      'hive-and-seek',
      'our-rotten-roots',
      'midnight-reckoning',
    ],
    crake: [
      'the-firebrand',
      'shadows-in-the-woods',
      'where-loyalty-lies',
      'what-hunts-the-night',
      'what-moves-the-dead',
      'who-pulls-the-strings',
      'rise-at-dawn',
      'fall-before-dusk',
    ],
  }
  for (const [slug, chain] of Object.entries(questlines)) {
    const id = characterIds.get(slug)
    if (!id) continue
    await payload.update({
      collection: 'characters',
      id,
      depth: 0,
      data: { questline: idsFor(questIds, chain) } as never,
    })
  }
  console.log('  wired quest graph, ending gates and questlines')

  for (const guide of guides) {
    const { relatedEndings = [], ...rest } = guide as typeof guide & { relatedEndings?: string[] }
    await upsert(payload, 'guides', guide.slug, {
      ...rest,
      relatedEndings: idsFor(endingIds, relatedEndings),
      _status: 'published',
    })
  }
  console.log(`  ${guides.length} guides`)

  await payload.updateGlobal({ slug: 'site-settings', data: siteSettings as never })
  console.log('  site settings')

  // The login is the one thing people come back to this output for, so print
  // it at the end where it is still on screen rather than scrolled away.
  console.log('\nSeed complete.\n')
  console.log('Sign in at http://localhost:3000/admin')
  console.log(`  email     ${email}`)
  if (createdAdmin) {
    console.log(`  password  ${password}`)
    console.log('\nChange that password now — Admin → Users → your account.')
  } else {
    console.log(
      `  password  unchanged by this run (the default this project ships is "${password}")`,
    )
  }
  process.exit(0)
}

seed().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
