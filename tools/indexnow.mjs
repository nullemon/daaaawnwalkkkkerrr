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
 * network is one deployment, so `/<key>.txt` from the public directory is
 * served by every subdomain already.
 *
 * ## Where the URLs come from
 *
 * Fetched from each host's live sitemap rather than read off disk. The sitemap
 * used to be a static file in `.next`, and this read it there so the two could
 * not disagree. It is now generated per host from the Host header — one route
 * answering for the hub and all seven wikis — so there is no file to read, and
 * fetching it keeps the same guarantee: whatever the sitemap says, this sends.
 *
 * Setup: none. A key is already generated and committed as public/<key>.txt,
 * which is all the engines need to verify it — the key is published by design
 * rather than kept secret, so it lives in the repo like any other public file.
 *
 * Re-run it after a deploy that adds or changes pages. Submitting unchanged
 * URLs repeatedly is not useful and some participants rate-limit it.
 */
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

const SEND = process.argv.includes('--send')
const ENDPOINT = 'https://api.indexnow.org/IndexNow'

/**
 * Find the key.
 *
 * An IndexNow key is not a credential. It is a random string you invent and
 * then publish at `/<key>.txt` — the file being reachable is the whole of the
 * proof that the key is yours. So the committed key file is the source of
 * truth, and the env var only exists to override it.
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

const key = process.env.INDEXNOW_KEY?.trim() || keyFromPublicDir()
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim().replace(/\/$/, '')

if (!key) {
  console.error('No IndexNow key found.')
  console.error('Expected a file in public/ named <key>.txt whose contents are that same key,')
  console.error('or INDEXNOW_KEY set in .env. Generate one with:')
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"')
  process.exit(1)
}
if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
  console.error('INDEXNOW_KEY must be 8-128 characters, letters digits and dashes only.')
  process.exit(1)
}
if (!siteUrl || siteUrl.includes('localhost')) {
  console.error(`Site URL is "${siteUrl || '(unset)'}".`)
  console.error('IndexNow needs the real public origin — set NEXT_PUBLIC_SITE_URL in .env.')
  process.exit(1)
}

const apex = new URL(siteUrl)

// The key file proves the key is yours. Engines fetch it before accepting a
// submission, so it has to be committed and deployed, not just generated.
const keyFile = path.resolve('public', `${key}.txt`)
if (!fs.existsSync(keyFile)) {
  fs.writeFileSync(keyFile, key)
  console.log(`Wrote public/${key}.txt — commit and deploy it before submitting.`)
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

  const response = await fetch(`${siteUrl}/sitemap.xml`, { headers: { Accept: 'application/xml' } })
  if (!response.ok) {
    console.error(`Could not read ${siteUrl}/sitemap.xml (HTTP ${response.status}).`)
    console.error('Is the site deployed at NEXT_PUBLIC_SITE_URL?')
    process.exit(1)
  }

  // Every wiki links from the directory; the directory is in the hub sitemap.
  const wikis = await fetch(`${siteUrl}/wikis`)
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
  const response = await fetch(`${origin}/sitemap.xml`, { headers: { Accept: 'application/xml' } })
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
console.log(`key file: public/${key}.txt\n`)

let grandTotal = 0
const byHost = new Map()

for (const host of hosts) {
  const urls = await urlsFor(host)
  byHost.set(host, urls)
  grandTotal += urls.length
  console.log(`  ${host.padEnd(40)} ${String(urls.length).padStart(5)} URLs`)
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
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
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
