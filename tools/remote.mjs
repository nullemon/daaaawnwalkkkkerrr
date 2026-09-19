#!/usr/bin/env node
/**
 * Content operations against a running site, from a terminal.
 *
 *   node tools/remote.mjs connect          # ask for a session; approve it in /admin/remote
 *   node tools/remote.mjs status
 *   node tools/remote.mjs disconnect
 *   node tools/remote.mjs device           # this machine's key fingerprint
 *
 *   node tools/remote.mjs whoami
 *   node tools/remote.mjs list guides --game onimusha-way-of-the-sword
 *   node tools/remote.mjs get guides all-items --game onimusha-way-of-the-sword
 *   node tools/remote.mjs create guides ./new-guide.json --game onimusha…
 *   node tools/remote.mjs update guides all-items ./patch.json --game onimusha…
 *   node tools/remote.mjs publish guides all-items --game onimusha…
 *   node tools/remote.mjs delete guides old-slug --game onimusha… --yes
 *   node tools/remote.mjs collections
 *
 * ## What this is for
 *
 * Once the network is deployed, adding a page means opening the admin in a
 * browser. That is right for editing prose and wrong for everything else: a
 * batch of forty generated guides, a correction applied across eight wikis, a
 * scheduled refresh after a game ships. Those are terminal jobs.
 *
 * ## Two ways in, and the difference matters
 *
 * **An approved session** (`connect`) is the one to use on a live site. The
 * terminal asks, a human approves it in `/admin/remote` after comparing a
 * sixteen-character code printed in both places, and every write it makes is
 * recorded in the Remote log with what changed and which session did it. It
 * expires. It can be revoked from a browser in one click.
 *
 * **An API key** (`REMOTE_API_KEY`) is the older path. It is a long-lived
 * credential issued per user in the admin, it carries exactly that user's
 * permissions, it never expires, and its writes are **not** in the Remote log.
 *
 * On a deployment that has remote control it is **refused**, server-side, and
 * this tool says so rather than letting a generic 403 read as a permissions
 * problem with the account. The reason is that a key which still worked would
 * be a way around every per-session capability the owner ticks: "create pages,
 * no deletions" means nothing while a second credential in the same `.env` can
 * delete anything. `src/lib/remote/api-key.ts` has the argument in full.
 *
 * It still works exactly as it did on a deployment that has never set
 * `REMOTE_CONTROL_SECRET` — a staging site, a local copy, a network that wants
 * nothing to do with sessions.
 *
 * A session wins when both are present, because if you went to the trouble of
 * having somebody approve one, that is the credential you meant to use.
 *
 * ## The device key
 *
 * `connect` generates an Ed25519 keypair on first run and keeps the private
 * half in `.remote/device.key`, mode 600, gitignored. Every request is signed
 * with it. The first connect from a new key is refused and registers the
 * device in the admin, where you name it and enable it — see `docs/REMOTE.md`,
 * which is the design and the threat model, including an honest paragraph on
 * what a key file does and does not prove.
 *
 * ## Setup
 *
 *   .env:  REMOTE_URL=https://example.com
 *          REMOTE_API_KEY=<optional; the key from Users → Enable API Key>
 *
 * Never commit either. `.env` and `.remote/` are both gitignored.
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const BASE = (process.env.REMOTE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
  .trim()
  .replace(/\/$/, '')
const KEY = (process.env.REMOTE_API_KEY || '').trim()

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STATE_DIR = path.join(ROOT, '.remote')
const KEY_FILE = path.join(STATE_DIR, 'device.key')
const SESSION_FILE = path.join(STATE_DIR, 'session.json')

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

/*
  Every fetch below carries `Connection: close`, and the reason is the whole of
  a gotcha this repository has already paid for: a keep-alive socket that is
  still closing when `process.exit()` runs trips a libuv assertion on Windows —
  `!(handle->flags & UV_HANDLE_CLOSING)`, exit code 127 — and the C stack trace
  lands *after* the message the script just printed, so a refusal reads as a
  crash and the sentence explaining it scrolls away. `die()` exits non-zero
  after a fetch on every path in this file, so every request needs it.
  `tools/indexnow.mjs` carries the same header for the same reason and no other.
*/
const CLOSE = { Connection: 'close' }

/* -------------------------------------------------------------------------- */
/* Device key                                                                 */
/* -------------------------------------------------------------------------- */

const ensureStateDir = () => {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true })
}

/**
 * This machine's Ed25519 key, generating one on first use.
 *
 * `mode: 0o600` is set on the write and again with `chmod`, because on Windows
 * the mode argument is largely decorative — NTFS permissions are not POSIX
 * bits. That is worth knowing rather than pretending otherwise: on Windows the
 * protection for this file is the user profile it sits in, and `docs/REMOTE.md`
 * says so in the threat model rather than implying the mode did something.
 */
const deviceKey = () => {
  ensureStateDir()
  if (!fs.existsSync(KEY_FILE)) {
    const { privateKey } = crypto.generateKeyPairSync('ed25519')
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' })
    fs.writeFileSync(KEY_FILE, pem, { mode: 0o600 })
    try {
      fs.chmodSync(KEY_FILE, 0o600)
    } catch {
      /* Windows. See above. */
    }
    console.log(`Generated a device key at ${path.relative(ROOT, KEY_FILE)}. It never leaves this machine.`)
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE, 'utf8'))
  const publicKey = crypto
    .createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .toString('base64')
  return { privateKey, publicKey }
}

/** The same formula the server uses, so the two strings can be compared by eye. */
const fingerprint = (publicKey) =>
  crypto
    .createHmac('sha256', 'remote-device')
    .update(publicKey)
    .digest('hex')
    .slice(0, 32)
    .match(/.{4}/g)
    .join(':')

/* -------------------------------------------------------------------------- */
/* Session state                                                              */
/* -------------------------------------------------------------------------- */

const readSessionFile = () => {
  if (!fs.existsSync(SESSION_FILE)) return null
  try {
    const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
    /*
      Tied to the site it was approved for. Without this, changing REMOTE_URL
      would silently send a production token to a staging host — which would
      fail, but only after the token had been transmitted somewhere it was
      never meant to go.
    */
    if (saved.base !== BASE) return null
    return saved
  } catch {
    return null
  }
}

const writeSessionFile = (state) => {
  ensureStateDir()
  fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2), { mode: 0o600 })
}

const clearSessionFile = () => {
  if (fs.existsSync(SESSION_FILE)) fs.rmSync(SESSION_FILE, { force: true })
}

/* -------------------------------------------------------------------------- */
/* Signed requests                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The canonical string, which must match `src/lib/remote/signing.ts` exactly.
 *
 *     remote-v1\n<METHOD>\n<pathname>\n<timestamp>\n<nonce>\n<sha256(body)>
 *
 * The version prefix is why a change to this shape fails loudly instead of
 * being interpreted as something else.
 */
const signed = async (endpoint, body, token) => {
  const { privateKey, publicKey } = deviceKey()
  const payload = body === undefined ? '' : JSON.stringify(body)
  const timestamp = String(Date.now())
  const nonce = crypto.randomBytes(16).toString('hex')
  const digest = crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
  const message = ['remote-v1', 'POST', endpoint, timestamp, nonce, digest].join('\n')
  const signature = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64')

  const response = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-remote-key': publicKey,
      'x-remote-timestamp': timestamp,
      'x-remote-nonce': nonce,
      'x-remote-signature': signature,
      ...(token ? { Authorization: `Remote ${token}` } : {}),
      ...CLOSE,
    },
    body: payload,
  })

  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { ok: false, error: text.slice(0, 300) || `HTTP ${response.status}` }
  }
  return { status: response.status, body: parsed }
}

/* -------------------------------------------------------------------------- */
/* The API-key path, unchanged                                                */
/* -------------------------------------------------------------------------- */

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
      ...CLOSE,
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

/* -------------------------------------------------------------------------- */
/* Which credential is in play                                                */
/* -------------------------------------------------------------------------- */

const session = readSessionFile()

/**
 * Run one operation through the session endpoint.
 *
 * Every refusal is printed as the server wrote it. The server composes those
 * sentences because it is the only side that knows why — which collection is
 * denied and which is merely outside the allow-list, whether a session expired
 * or was revoked — and a CLI that paraphrased them would be a second, worse
 * copy of an explanation that already exists.
 */
const op = async (payload) => {
  const { status, body } = await signed('/api/remote/op', payload, session.token)
  if (status === 401 || status === 403) {
    if (status === 401) clearSessionFile()
    die(`${body.error ?? `HTTP ${status}`}`)
  }
  if (!body?.ok) die(body?.error ?? `HTTP ${status}`)
  return body
}

/**
 * Does this deployment have remote control at all?
 *
 * An unsigned POST to the pairing route answers **404** when
 * `REMOTE_CONTROL_SECRET` is unset — the route does not exist — and something
 * else (403 for the admin switch, 401 for the missing signature) when it does.
 * So one request with no body and no side effects distinguishes the two, which
 * is exactly what is needed before falling back to an API key.
 *
 * Asking is worth a round trip because the alternative is Payload's own
 * "You are not allowed to perform this action" — a sentence that reads as a
 * permissions problem with the account and sends somebody to tick boxes in
 * Users, when the actual answer is that this site takes sessions now.
 */
const remoteControlPresent = async () => {
  try {
    const response = await fetch(`${BASE}/api/remote/session`, { method: 'POST', headers: CLOSE })
    return response.status !== 404
  } catch {
    /* Unreachable site: let the real request produce the real error. */
    return false
  }
}

const requireSessionOrKey = async () => {
  if (session) return
  if (KEY) {
    /*
      The API key is refused server-side on a deployment that has remote
      control — `src/lib/remote/api-key.ts` says why at length, and the short
      version is that an unscoped, unexpiring, unlogged credential makes the
      per-session capabilities decorative. Saying so here turns a generic 403
      into the one sentence that names what to do instead.
    */
    if (await remoteControlPresent()) {
      die(
        `${BASE} has remote control, so REMOTE_API_KEY no longer carries editor access.\n\n` +
          'An API key is unscoped, does not expire, and its writes are not in the\n' +
          'Remote log — which would make the per-session capabilities pointless, since\n' +
          'anything a session was refused could be done with the key instead.\n\n' +
          '  pnpm remote connect        then approve it at /admin/remote, ticking what\n' +
          '                             this session may do\n\n' +
          'docs/REMOTE.md is the flow. If you want API keys back, unset\n' +
          'REMOTE_CONTROL_SECRET on the deployment — which turns remote control off\n' +
          'entirely. There is deliberately no setting that leaves both on.',
      )
    }
    return
  }
  die(
    'No session and no API key.\n\n' +
      'For a live site, the session is the one you want:\n' +
      '  pnpm remote connect        then approve it at /admin/remote\n\n' +
      'For a scripted job, an API key still works — in the admin, Users -> your\n' +
      'account -> tick "Enable API Key", save, copy it, then in .env:\n' +
      '  REMOTE_URL=https://your-domain.com\n' +
      '  REMOTE_API_KEY=<the key>\n\n' +
      'The difference is the audit trail: a session logs every write, a key does not.\n',
  )
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* -------------------------------------------------------------------------- */

switch (command) {
  case undefined:
  case 'help': {
    /* Everything up to and including the opening `/**`, so the shebang above
       it does not end up in the help text. */
    console.log(
      fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^[\s\S]*?\/\*\*?/, ''),
    )
    break
  }

  case 'device': {
    const { publicKey } = deviceKey()
    console.log(`fingerprint  ${fingerprint(publicKey)}`)
    console.log(`site         ${BASE}`)
    console.log('')
    console.log('The admin shows this same fingerprint on the device row. The two being')
    console.log('identical is how you know the row you are enabling is this machine.')
    break
  }

  case 'connect': {
    /*
      What this session is asking to be allowed to do.

      `--can create,update` names capabilities outright; `--scope write` is the
      old shorthand for a bundle of them and still works. Either way this is
      only the *upper* bound: the owner ticks their own boxes in the admin and
      the session is granted the intersection, so asking for everything grants
      nothing by itself.

      An unknown name is refused by the server rather than dropped here, so the
      terminal and the site agree about what a capability is — one list, in
      `src/lib/remote/policy.ts`, and no second copy in this file to drift.
    */
    const scope = typeof flags.scope === 'string' ? flags.scope : 'write'
    if (!['read', 'write', 'full'].includes(scope)) {
      die('--scope must be read, write or full. Or name capabilities: --can read,create,update')
    }
    const capabilities =
      typeof flags.can === 'string'
        ? flags.can
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean)
        : undefined

    const label = typeof flags.name === 'string' ? flags.name : `${os.hostname()} (${os.platform()})`
    const asked = await signed('/api/remote/session', {
      label,
      scope,
      ...(capabilities ? { capabilities } : {}),
      agent: `remote.mjs on ${os.platform()} ${process.version}`,
    })

    if (asked.status === 404) {
      die(
        `${BASE} has no remote control.\n\n` +
          'Set REMOTE_CONTROL_SECRET in the deployment environment (32+ characters),\n' +
          'redeploy, then tick the box at /admin/globals/remote-access.\n' +
          'docs/REMOTE.md has the whole setup.',
      )
    }
    if (!asked.body?.ok) {
      const extra = asked.body?.device
        ? `\n\n  device       ${asked.body.device.label}\n  fingerprint  ${asked.body.device.fingerprint}\n\n${asked.body.hint ?? ''}`
        : ''
      die(`${asked.body?.error ?? `HTTP ${asked.status}`}${extra}`)
    }

    const { session: id, code, device } = asked.body
    console.log('')
    console.log(`  ${code}`)
    console.log('')
    console.log(`  device   ${device.label}  (${device.fingerprint})`)
    console.log(`  site     ${BASE}`)
    console.log(`  asking   ${asked.body.asking ?? scope}`)
    console.log('')
    console.log('  The approval screen shows one box per line above. Untick anything this')
    console.log('  session does not need — you get the narrower of the two lists.')
    console.log('')
    console.log(`  ${asked.body.next}`)
    console.log('')
    console.log('  Waiting. Ctrl-C to give up — nothing is granted until you approve it.')

    const deadline = Date.now() + 10 * 60_000
    let announced = 0
    for (;;) {
      if (Date.now() > deadline) {
        die('\nNobody approved it within ten minutes. Run `pnpm remote connect` again.')
      }
      await sleep(2000)
      const polled = await signed('/api/remote/poll', { session: id })
      if (!polled.body?.ok) die(`\n${polled.body?.error ?? `HTTP ${polled.status}`}`)

      if (polled.body.status === 'open' && polled.body.token) {
        writeSessionFile({
          base: BASE,
          token: polled.body.token,
          capabilities: polled.body.capabilities,
          expiresAt: polled.body.expiresAt,
          idleMinutes: polled.body.idleMinutes,
        })
        console.log('')
        console.log(`  Approved. This session may ${polled.body.may ?? 'do what was granted'}.`)
        console.log(`  Expires ${new Date(polled.body.expiresAt).toLocaleString()}`)
        console.log(`  Closes itself after ${polled.body.idleMinutes} idle minutes.`)
        console.log('')
        console.log('  `pnpm remote status` any time. `pnpm remote disconnect` when you are done.')
        break
      }

      if (polled.body.status !== 'pending') {
        die(`\n${polled.body.reason ?? polled.body.status}`)
      }

      announced += 1
      if (announced % 15 === 0) console.log(`  still waiting (${Math.round((deadline - Date.now()) / 60_000)} minutes left)`)
    }
    break
  }

  case 'status': {
    if (!session) {
      console.log(`No session for ${BASE}.`)
      if (KEY) {
        console.log('An API key is set. On a deployment with remote control it is refused —')
        console.log('unscoped and unlogged is the thing per-session capabilities exist to end.')
      }
      console.log('`pnpm remote connect` to open one.')
      break
    }
    const result = await op({ op: 'whoami' })
    console.log(`${BASE}`)
    console.log(`  session    ${result.session.id}, may ${result.session.may}`)
    console.log(`  as         ${result.user.email} (${result.user.role})`)
    console.log(`  device     ${result.device.label} (${result.device.fingerprint})`)
    console.log(`  expires    ${new Date(result.session.expiresAt).toLocaleString()}`)
    console.log(`  so far     ${result.session.writes} writes, ${result.session.reads} reads`)
    break
  }

  case 'disconnect': {
    if (!session) {
      console.log('No session to close.')
      break
    }
    const result = await op({ op: 'close' })
    clearSessionFile()
    console.log(`Closed. ${result.writes} writes and ${result.reads} reads this session.`)
    console.log('The Remote log in the admin has every one of the writes.')
    break
  }

  case 'whoami': {
    await requireSessionOrKey()
    if (session) {
      const result = await op({ op: 'whoami' })
      console.log(`${BASE}`)
      console.log(`  approved session as ${result.user.email} (${result.user.role}), may ${result.session.may}`)
      break
    }
    const me = await request('GET', 'users/me')
    if (!me.user) die('The key was not accepted. Check REMOTE_API_KEY and that the key is enabled.')
    console.log(`${BASE}`)
    console.log(`  signed in as ${me.user.email} (${me.user.role}) — API key, writes are not logged`)
    console.log(
      `  writes to: ${me.user.games?.length ? me.user.games.map((g) => g.slug ?? g).join(', ') : 'every wiki'}`,
    )
    break
  }

  case 'collections': {
    console.log('reachable, e.g.:')
    for (const name of [
      'guides', 'quests', 'achievements', 'characters', 'enemies', 'items',
      'regions', 'mechanics', 'comments', 'corrections', 'requests', 'games', 'media',
    ]) {
      console.log(`  ${name}`)
    }
    console.log('')
    console.log('Never, through a session: users, players, remote-devices, remote-sessions,')
    console.log('remote-log. Accounts, devices, sessions and the audit trail are browser-only,')
    console.log('on purpose — see docs/REMOTE.md.')
    break
  }

  case 'list': {
    await requireSessionOrKey()
    const [collection] = args
    if (!collection) die('Usage: list <collection> [--game <slug>] [--limit 20]')

    if (session) {
      const result = await op({
        op: 'list',
        collection,
        game: flags.game,
        limit: flags.limit ? Number(flags.limit) : undefined,
      })
      console.log(`${result.total} in ${collection}${flags.game ? ` for ${flags.game}` : ''}\n`)
      for (const doc of result.docs) {
        console.log(`  ${String(doc.slug ?? doc.id).padEnd(44)} ${String(doc.title ?? '').slice(0, 60)}`)
      }
      break
    }

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
    await requireSessionOrKey()
    const [collection, slug] = args
    if (!collection || !slug) die('Usage: get <collection> <slug> [--game <slug>]')
    if (session) {
      const result = await op({ op: 'get', collection, slug, game: flags.game })
      show(result.doc)
      break
    }
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    show(doc)
    break
  }

  case 'create': {
    await requireSessionOrKey()
    const [collection, file] = args
    if (!collection || !file) die('Usage: create <collection> <file.json> [--game <slug>]')
    const data = readJson(file)
    if (session) {
      const result = await op({ op: 'create', collection, data, game: flags.game })
      console.log(`created ${collection}/${result.slug ?? result.id}`)
      break
    }
    const id = await gameId(flags.game)
    const created = await request('POST', collection, { ...data, ...(id !== undefined ? { game: id } : {}) })
    console.log(`created ${collection}/${created.doc?.slug ?? created.doc?.id}`)
    break
  }

  case 'update': {
    await requireSessionOrKey()
    const [collection, slug, file] = args
    if (!collection || !slug || !file) die('Usage: update <collection> <slug> <file.json> [--game <slug>]')
    const data = readJson(file)
    if (session) {
      await op({ op: 'update', collection, slug, data, game: flags.game })
      console.log(`updated ${collection}/${slug}`)
      break
    }
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    await request('PATCH', `${collection}/${doc.id}`, data)
    console.log(`updated ${collection}/${slug}`)
    break
  }

  case 'publish': {
    /*
      Its own verb rather than `update ... {"_status":"published"}`, because
      what it is for is a whole entry in this project's gotchas list: Payload
      defaults a document it *creates* to draft, and 335 guides were written,
      counted, verified and reported as finished while every one of them
      returned 404.
    */
    await requireSessionOrKey()
    const [collection, slug] = args
    if (!collection || !slug) die('Usage: publish <collection> <slug> [--game <slug>]')
    if (session) {
      await op({ op: 'publish', collection, slug, game: flags.game })
      console.log(`published ${collection}/${slug}`)
      break
    }
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    await request('PATCH', `${collection}/${doc.id}`, { _status: 'published' })
    console.log(`published ${collection}/${slug}`)
    break
  }

  case 'delete': {
    await requireSessionOrKey()
    const [collection, slug] = args
    if (!collection || !slug) die('Usage: delete <collection> <slug> [--game <slug>] --yes')
    if (!flags.yes) die('Refusing to delete without --yes. This cannot be undone.')
    if (session) {
      await op({ op: 'delete', collection, slug, game: flags.game })
      console.log(`deleted ${collection}/${slug}`)
      break
    }
    const doc = await findOne(collection, slug, flags.game)
    if (!doc) die(`Not found: ${collection}/${slug}`)
    await request('DELETE', `${collection}/${doc.id}`)
    console.log(`deleted ${collection}/${slug}`)
    break
  }

  default:
    die(
      `Unknown command "${command}". Try: connect, status, disconnect, device,\n` +
        'whoami, collections, list, get, create, update, publish, delete',
    )
}
