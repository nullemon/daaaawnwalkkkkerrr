/**
 * Submits every public URL on the network to IndexNow.
 *
 *   node tools/indexnow.mjs            # dry run, prints what it would send
 *   node tools/indexnow.mjs --send     # actually submit
 *
 * IndexNow is a push protocol: instead of waiting to be crawled, you tell the
 * engines a URL changed and they come and look.
 *
 * Who actually receives it — worth knowing before you judge the results:
 *
 *   Bing, Yandex, Seznam, Naver and Yep all consume IndexNow.
 *   GOOGLE DOES NOT. Google has said it is not participating, so nothing here
 *   affects Google indexing at all. For Google, the sitemap in Search Console
 *   remains the mechanism, and each wiki has one at its own origin.
 *
 * ## One submission per host
 *
 * The network is seven subdomains plus the hub, and IndexNow requires that
 * every URL in a submission belongs to the `host` that submission names. So
 * this makes one request per host rather than one for everything — a mixed
 * batch is rejected whole, which is a confusing way to discover the rule.
 *
 * The key file has to be reachable on each host too. That is free here: the
 * network is one deployment, and `proxy.ts` rewrites `/<key>.txt` on any host
 * to a route that answers for whichever key is live.
 *
 * ## Where the URLs come from
 *
 * Fetched from each host's live sitemap rather than read off disk. The sitemap
 * used to be a static file in `.next`, and this read it there so the two could
 * not disagree. It is now generated per host from the Host header — one route
 * answering for the hub and all seven wikis — so there is no file to read, and
 * fetching it keeps the same guarantee: whatever the sitemap says, this sends.
 *
 * ## Where the key comes from
 *
 * Setup: none. A key ships as public/<key>.txt, which is all the engines need
 * to verify it — the key is published by design rather than kept secret, so it
 * lives in the repo like any other public file.
 *
 * The owner can set their own instead, in the admin: Site settings → SEO &
 * analytics → IndexNow key. That value wins, and this reads it from the
 * running site rather than from the local database *because the running site
 * is what the engines will fetch the key file from*. A key read out of a local
 * copy could be a key the deployment has never heard of, and the failure —
 * HTTP 422, verification failed — does not say which half is wrong. Same order
 * as `lib/indexnow.ts` resolves it in: settings, then INDEXNOW_KEY, then the
 * shipped file.
 *
 * Every host is then *asked* for the key file before anything is submitted, so
 * a mismatch is a sentence naming the host rather than a rejection naming
 * nothing. Nothing is sent if any host fails.
 *
 * Re-run it after a deploy that adds or changes pages. Nothing triggers this
 * automatically, deliberately: submitting unchanged URLs repeatedly is not
 * useful and is the documented way to get a key throttled.
 */
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

const SEND = process.argv.includes('--send')
const ENDPOINT = 'https://api.indexnow.org/IndexNow'

/*
  Every request this script makes carries `Connection: close`, and it is not an
  optimisation.

  On Windows, `process.exit()` while an HTTP keep-alive socket is still closing
  aborts node with a libuv assertion — `!(handle->flags & UV_HANDLE_CLOSING)`,
  exit code 127 — and the C stack trace replaces the message the script had
  just printed. Every refusal here ends in `process.exit(1)` right after a
  fetch, so the sentence explaining what was wrong scrolled away behind an
  assertion. One request per connection and there is no socket to race.
*/
const CLOSE = { Connection: 'close' }

/*
  The IndexNow specification's own rule for a key, restated.

  This is a plain node script and cannot import `src/lib/indexnow.ts`, where
  the same pattern is the one the admin field and the routing use. The two
  disagreeing is a key the site serves and this refuses, or the reverse, so
  `src/lib/indexnow.test.ts` reads this file and pins them against each other.
*/
const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim().replace(/\/$/, '')

if (!siteUrl || siteUrl.includes('localhost')) {
  console.error(`Site URL is "${siteUrl || '(unset)'}".`)
  console.error('IndexNow needs the real public origin — set NEXT_PUBLIC_SITE_URL in .env.')
  process.exit(1)
}

const apex = new URL(siteUrl)

/**
 * The key the owner set in the admin, read from the running site.
 *
 * `site-settings` has `read: () => true`, so this needs no API key — and it
 * should not have one, because what is wanted here is precisely the value a
 * search engine's crawler could see.
 *
 * A failure here is not fatal. The site may be mid-deploy or the field may not
 * exist yet on an older build, and falling back to the shipped key is what
 * this did for its whole life before the field existed.
 */
const keyFromSite = async () => {
  try {
    const response = await fetch(`${siteUrl}/api/globals/site-settings?depth=0`, {
      headers: { Accept: 'application/json', ...CLOSE },
    })
    if (!response.ok) return undefined
    const settings = await response.json()
    const value = typeof settings?.indexnowKey === 'string' ? settings.indexnowKey.trim() : ''
    return value || undefined
  } catch {
    return undefined
  }
}

/**
 * The key that shipped in the repository.
 *
 * Found by shape — a `.txt` file whose stem is its own contents — rather than
 * by name, so rotating it is dropping a new file in and deleting the old one
 * with nothing in the code to edit. The route that serves it looks for it the
 * same way.
 */
const keyFromPublicDir = () => {
  const dir = path.resolve('public')
  if (!fs.existsSync(dir)) return undefined
  const candidate = fs
    .readdirSync(dir)
    .filter((name) => /^[a-zA-Z0-9-]{8,128}\.txt$/.test(name))
    .find((name) => {
      const stem = name.replace(/\.txt$/, '')
      return fs.readFileSync(path.join(dir, name), 'utf8').trim() === stem
    })
  return candidate?.replace(/\.txt$/, '')
}

// Settings, then environment, then the shipped file — the order `resolveIndexNowKey`
// uses. The site resolving differently from the submitter is the one failure
// IndexNow reports without saying what it was.
const fromSite = await keyFromSite()
const key = fromSite || process.env.INDEXNOW_KEY?.trim() || keyFromPublicDir()
const keySource = fromSite
  ? 'Site settings → SEO & analytics → IndexNow key'
  : process.env.INDEXNOW_KEY?.trim()
    ? 'INDEXNOW_KEY in the environment'
    : 'the key file that shipped in public/'

if (!key) {
  console.error('No IndexNow key found.')
  console.error('Set one in the admin: Site settings -> SEO & analytics -> IndexNow key.')
  console.error('Or leave a file in public/ named <key>.txt whose contents are that same key,')
  console.error('or set INDEXNOW_KEY in .env. Generate one with:')
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"')
  process.exit(1)
}
if (!KEY_PATTERN.test(key)) {
  console.error(`The key from ${keySource} is not a legal IndexNow key.`)
  console.error('It must be 8-128 characters, letters digits and dashes only.')
  process.exit(1)
}

/**
 * Ask a host for the key file, the way an engine will.
 *
 * This is the check that turns IndexNow's one unhelpful failure into a
 * sentence. A submission with a key the host does not serve comes back HTTP
 * 422 "key not valid", which does not distinguish a malformed key from an
 * unreachable file from a file containing something else — and on a network of
 * ten hosts it does not say which host either.
 */
const keyFileOk = async (host) => {
  const url = `${apex.protocol}//${host}/${key}.txt`
  try {
    const response = await fetch(url, { headers: { Accept: 'text/plain', ...CLOSE } })
    if (!response.ok) return `HTTP ${response.status} from ${url}`
    const body = (await response.text()).trim()
    if (body !== key) return `${url} served ${body ? `"${body.slice(0, 40)}"` : 'an empty body'}, not the key`
    return null
  } catch (error) {
    return `${url} could not be fetched — ${error.message}`
  }
}

/**
 * Which hosts to submit for: the hub, and every wiki that a reader can reach.
 *
 * Read from the live directory page rather than from the database, so this
 * works from anywhere with network access and describes what is actually
 * deployed rather than what is in the local copy.
 */
const hostsToSubmit = async () => {
  const hosts = [apex.host]

  const response = await fetch(`${siteUrl}/sitemap.xml`, { headers: { Accept: 'application/xml', ...CLOSE } })
  if (!response.ok) {
    console.error(`Could not read ${siteUrl}/sitemap.xml (HTTP ${response.status}).`)
    console.error('Is the site deployed at NEXT_PUBLIC_SITE_URL?')
    process.exit(1)
  }

  // Every wiki links from the directory; the directory is in the hub sitemap.
  const wikis = await fetch(`${siteUrl}/wikis`, { headers: CLOSE })
  if (wikis.ok) {
    const html = await wikis.text()
    for (const match of html.matchAll(
      new RegExp(`https?://([a-z0-9-]+)\\.${apex.host.replace(/[.]/g, '\\.')}`, 'gi'),
    )) {
      const host = `${match[1]}.${apex.host}`
      if (!hosts.includes(host)) hosts.push(host)
    }
  }

  return hosts
}

const urlsFor = async (host) => {
  const origin = `${apex.protocol}//${host}`
  const response = await fetch(`${origin}/sitemap.xml`, { headers: { Accept: 'application/xml', ...CLOSE } })
  if (!response.ok) {
    console.error(`  ${host}: sitemap returned HTTP ${response.status}, skipping`)
    return []
  }
  const xml = await response.text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
  // Only URLs on the host being submitted for. A mixed batch is rejected whole.
  return [...new Set(urls.filter((url) => url.startsWith(origin)))]
}

const hosts = await hostsToSubmit()
console.log(`${hosts.length} hosts: ${hosts.join(', ')}\n`)
console.log(`key:      ${key}`)
console.log(`from:     ${keySource}`)
console.log(`served:   /${key}.txt on every host\n`)

let grandTotal = 0
const byHost = new Map()
const keyProblems = []

for (const host of hosts) {
  const urls = await urlsFor(host)
  byHost.set(host, urls)
  grandTotal += urls.length
  const problem = await keyFileOk(host)
  if (problem) keyProblems.push(problem)
  console.log(
    `  ${host.padEnd(40)} ${String(urls.length).padStart(5)} URLs   key file ${problem ? 'NOT SERVED' : 'ok'}`,
  )
}

if (keyProblems.length) {
  console.error(`\nThe key file is not being served on ${keyProblems.length} of ${hosts.length} hosts:`)
  keyProblems.forEach((problem) => console.error(`  ${problem}`))
  console.error('\nEvery submission for those hosts would be rejected as unverified, so nothing')
  console.error('is sent. Either the key in Site settings does not match what is deployed, or')
  console.error(`the deployment is older than the /${key}.txt route. Fix that first.`)
  process.exit(1)
}

if (!SEND) {
  console.log(`\n${grandTotal} URLs across ${hosts.length} hosts.`)
  const [first] = byHost.values()
  if (first?.length) {
    console.log('\nfirst five:')
    first.slice(0, 5).forEach((url) => console.log(`  ${url}`))
  }
  console.log('\nDry run. Re-run with --send to submit.')
  console.log('Note: Google does not participate in IndexNow — use Search Console for Google.')
  process.exit(0)
}

// The API accepts up to 10,000 per request; batch anyway so a large site does
// not depend on one enormous POST succeeding.
const BATCH = 1000
let sent = 0

for (const [host, urls] of byHost) {
  if (urls.length === 0) continue
  const origin = `${apex.protocol}//${host}`

  for (let index = 0; index < urls.length; index += BATCH) {
    const batch = urls.slice(index, index + BATCH)
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CLOSE },
      body: JSON.stringify({
        host,
        key,
        // The key file is served from the deployment, so it is reachable on
        // every host. Naming it per host is what makes that verifiable.
        keyLocation: `${origin}/${key}.txt`,
        urlList: batch,
      }),
    })

    // 200 accepted, 202 accepted but key still being verified. Both are fine.
    if (response.ok || response.status === 202) {
      sent += batch.length
      console.log(`  ${host}: sent ${batch.length} (HTTP ${response.status})`)
    } else {
      const body = await response.text().catch(() => '')
      console.error(`  ${host}: batch failed HTTP ${response.status} ${body.slice(0, 200)}`)
      console.error('  422 usually means the key file is not reachable at keyLocation yet.')
      process.exitCode = 1
    }
  }
}

console.log(`\n${sent} of ${grandTotal} URLs submitted to the IndexNow network`)
console.log('Bing, Yandex, Seznam, Naver and Yep consume this. Google does not.')
