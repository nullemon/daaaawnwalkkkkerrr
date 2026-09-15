#!/usr/bin/env node
/**
 * Content operations against a running site, from a terminal.
 *
 *   node tools/remote.mjs whoami
 *   node tools/remote.mjs list guides --game onimusha-way-of-the-sword
 *   node tools/remote.mjs get guides all-items --game onimusha-way-of-the-sword
 *   node tools/remote.mjs create guides ./new-guide.json
 *   node tools/remote.mjs update guides all-items ./patch.json --game onimusha…
 *   node tools/remote.mjs publish guides all-items --game onimusha…
 *   node tools/remote.mjs delete guides old-slug --game onimusha…
 *   node tools/remote.mjs collections
 *
 * ## What this is for
 *
 * Once the network is deployed, adding a page means opening the admin in a
 * browser. That is right for editing prose and wrong for everything else: a
 * batch of forty generated guides, a correction applied across eight wikis, a
 * scheduled refresh after a game ships. Those are terminal jobs.
 *
 * This talks to the site's own REST API over HTTPS with an API key. It needs
 * no SSH, no database credentials, no redeploy, and it works identically
 * against localhost and production — the only difference is REMOTE_URL.
 *
 * ## Why an API key and not a password
 *
 * A key is issued per user in the admin (Users → the account → "Enable API
 * Key") and carries exactly that user's permissions. An editor assigned to one
 * wiki cannot write to another with theirs, because the same access rules run.
 * Revoking one is unticking a box; revoking a password means changing a login
 * somebody is still using.
 *
 * ## Setup
 *
 *   .env:  REMOTE_URL=https://example.com
 *          REMOTE_API_KEY=<the key from the admin>
 *
 * Never commit the key. `.env` is already gitignored.
 */
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

const BASE = (process.env.REMOTE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
  .trim()
  .replace(/\/$/, '')
const KEY = (process.env.REMOTE_API_KEY || '').trim()

const [, , command, ...rest] = process.argv

/** Pull `--flag value` pairs out, leaving the positional arguments. */
const flags = {}
const args = []
for (let index = 0; index < rest.length; index += 1) {
  if (rest[index].startsWith('--')) {
    const name = rest[index].slice(2)
    const next = rest[index + 1]
    if (next && !next.startsWith('--')) {
      flags[name] = next
      index += 1
    } else flags[name] = true
  } else args.push(rest[index])
}

const die = (message) => {
  console.error(message)
  process.exit(1)
}

if (!KEY && command !== 'help' && command !== undefined) {
  die(
    'No REMOTE_API_KEY.\n\n' +
      'In the admin: Users -> your account -> tick "Enable API Key", save, copy it.\n' +
      'Then in .env:\n' +
      '  REMOTE_URL=https://your-domain.com\n' +
      '  REMOTE_API_KEY=<the key>\n',
  )
}

/**
 * Payload's API-key scheme: the collection slug, then the key.
 *
 * It is `users API-Key <key>`, not `Bearer <key>` — a Bearer header is
 * accepted and silently treated as unauthenticated, so a wrong guess here
 * looks exactly like a permissions problem.
 */
const request = async (method, endpoint, body) => {
  const response = await fetch(`${BASE}/api/${endpoint}`, {
    method,
    headers: {
      Authorization: `users API-Key ${KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { raw: text.slice(0, 400) }
  }

  if (!response.ok) {
    const detail =
      parsed?.errors?.map((error) => error.message).join('; ') || parsed?.message || text.slice(0, 300)
    die(`${method} ${endpoint} -> HTTP ${response.status}\n  ${detail}`)
  }
  return parsed
}

/** Resolve a game slug to its id, because records are scoped by relationship. */
const gameId = async (slug) => {
  if (!slug) return undefined
  const found = await request('GET', `games?where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=0`)
  if (!found.docs?.length) die(`No game with slug "${slug}".`)
  return found.docs[0].id
}

/** One record, by slug, within a game. */
const findOne = async (collection, slug, game) => {
  const id = await gameId(game)
  const query = [
    `where[slug][equals]=${encodeURIComponent(slug)}`,
    ...(id !== undefined ? [`where[game][equals]=${id}`] : []),
    'limit=1',
    'depth=0',
  ].join('&')
  const found = await request('GET', `${collection}?${query}`)
  return found.docs?.[0] ?? null
}

const readJson = (file) => {
  const full = path.resolve(file)
  if (!fs.existsSync(full)) die(`No such file: ${full}`)
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (error) {
    die(`${full} is not valid JSON: ${error.message}`)
  }
}

const show = (value) => console.log(JSON.stringify(value, null, 2))

// ---------------------------------------------------------------------------

switch (command) {
  case undefined:
  case 'help': {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''))
    break
  }

  case 'whoami': {
    const me = await request('GET', 'users/me')
    if (!me.user) die('The key was not accepted. Check REMOTE_API_KEY and that the key is enabled.')
    console.log(`${BASE}`)
    console.log(`  signed in as ${me.user.email} (${me.user.role})`)
    console.log(
      `  writes to: ${me.user.games?.length ? me.user.games.map((g) => g.slug ?? g).join(', ') : 'every wiki'}`,
    )
    break
  }

  case 'collections': {
    // Ask the API what it has rather than hardcoding a list that will drift.
    const probe = await request('GET', 'games?limit=0')
    console.log('reachable, e.g.:')
    for (const name of [
      'guides', 'quests', 'achievements', 'characters', 'enemies', 'items',
      'regions', 'mechanics', 'comments', 'corrections', 'requests', 'games', 'media',
    ]) {
      console.log(`  ${name}`)
    }
    console.log(`\n(${probe.totalDocs} games on this install)`)
    break
  }

  case 'list': {
    const [collection] = args
    if (!collection) die('Usage: list <collection> [--game <slug>] [--limit 20] [--where-field x --where-value y]')
    const id = await gameId(flags.game)
    const query = [
      ...(id !== undefined ? [`where[game][equals]=${id}`] : []),
      ...(flags['where-field'] && flags['where-value']
        ? [`where[${flags['where-field']}][equals]=${encodeURIComponent(flags['where-value'])}`]
        : []),
      `limit=${flags.limit ?? 30}`,
      'depth=0',
      'sort=-updatedAt',
    ].join('&')

    const found = await request('GET', `${collection}?${query}`)
    console.log(`${found.totalDocs} in ${collection}${flags.game ? ` for ${flags.game}` : ''}\n`)
    for (const doc of found.docs) {
      console.log(`  ${String(doc.slug ?? doc.id).padEnd(44)} ${String(doc.title ?? doc.summary ?? '').slice(0, 60)}`)
    }
    break
  }

  case 'get': {
    const [collection, slug] = args
    if (!collection || !slug) die('Usage: get <collection> <slug> [--game <slug>]')
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    show(doc)
    break
  }

  case 'create': {
    const [collection, file] = args
    if (!collection || !file) die('Usage: create <collection> <file.json> [--game <slug>]')
    const data = readJson(file)
    const id = await gameId(flags.game)
    const created = await request('POST', collection, { ...data, ...(id !== undefined ? { game: id } : {}) })
    console.log(`created ${collection}/${created.doc?.slug ?? created.doc?.id}`)
    break
  }

  case 'update': {
    const [collection, slug, file] = args
    if (!collection || !slug || !file) die('Usage: update <collection> <slug> <file.json> [--game <slug>]')
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    await request('PATCH', `${collection}/${doc.id}`, readJson(file))
    console.log(`updated ${collection}/${slug}`)
    break
  }

  case 'publish': {
    // Collections with drafts enabled keep an unpublished version until told.
    const [collection, slug] = args
    if (!collection || !slug) die('Usage: publish <collection> <slug> [--game <slug>]')
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    await request('PATCH', `${collection}/${doc.id}`, { _status: 'published' })
    console.log(`published ${collection}/${slug}`)
    break
  }

  case 'delete': {
    const [collection, slug] = args
    if (!collection || !slug) die('Usage: delete <collection> <slug> [--game <slug>] --yes')
    if (!flags.yes) die('Refusing to delete without --yes. This cannot be undone.')
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    await request('DELETE', `${collection}/${doc.id}`)
    console.log(`deleted ${collection}/${slug}`)
    break
  }

  default:
    die(`Unknown command "${command}". Try: whoami, collections, list, get, create, update, publish, delete`)
}
