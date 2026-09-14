/**
 * Submits every public URL to the IndexNow network.
 *
 *   node tools/indexnow.mjs            # dry run, prints what it would send
 *   node tools/indexnow.mjs --send     # actually submit
 *
 * IndexNow is a push protocol: instead of waiting to be crawled, you tell the
 * engines a URL changed and they come and look. One submission reaches every
 * participant, so this posts once.
 *
 * Who actually receives it — worth knowing before you judge the results:
 *
 *   Bing, Yandex, Seznam, Naver and Yep all consume IndexNow.
 *   GOOGLE DOES NOT. Google has said it is not participating, so nothing here
 *   affects Google indexing at all. For Google, the sitemap in Search Console
 *   remains the mechanism, and that is already wired up at /sitemap.xml.
 *
 * Setup, once:
 *
 *   1. Invent a key — any 8-128 hex characters. `openssl rand -hex 16` is fine.
 *   2. Put it in .env as INDEXNOW_KEY=<key>.
 *   3. Run this script once with --send. It writes public/<key>.txt, which is
 *      how the engines verify the key belongs to you, then submits.
 *   4. Commit that file. Without it every submission is rejected.
 *
 * Re-run it after a deploy that adds or changes pages. Submitting unchanged
 * URLs repeatedly is not useful and some participants rate-limit it.
 */
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

const SEND = process.argv.includes('--send')
const ENDPOINT = 'https://api.indexnow.org/IndexNow'

const key = process.env.INDEXNOW_KEY?.trim()
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '').trim()

if (!key) {
  console.error('No INDEXNOW_KEY in .env.')
  console.error('Generate one (openssl rand -hex 16) and add INDEXNOW_KEY=<key> to .env.')
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

const host = new URL(siteUrl).host

// The key file proves the key is yours. Engines fetch it before accepting a
// submission, so it has to be committed and deployed, not just generated.
const keyFile = path.resolve('public', `${key}.txt`)
if (!fs.existsSync(keyFile)) {
  fs.writeFileSync(keyFile, key)
  console.log(`Wrote public/${key}.txt — commit and deploy this before submitting.`)
}

/**
 * Read the URL list out of the built sitemap rather than rebuilding it here.
 * One source of truth: anything excluded from the sitemap is excluded from
 * this too, which is what you want for a noindex page.
 */
const sitemapPath = path.resolve('.next/server/app/sitemap.xml.body')
let urls = []

if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, 'utf8')
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
} else {
  console.error('No built sitemap found. Run `pnpm build` first — this reads the URLs from it')
  console.error(`so that the two can never disagree. Looked in ${sitemapPath}`)
  process.exit(1)
}

// Only ours, and only the origin we are submitting for.
urls = [...new Set(urls.filter((url) => url.startsWith(siteUrl)))]

console.log(`${urls.length} URLs for ${host}`)
console.log(`key file: public/${key}.txt`)

if (!SEND) {
  console.log('\nfirst five:')
  urls.slice(0, 5).forEach((url) => console.log(`  ${url}`))
  console.log('\nDry run. Re-run with --send to submit.')
  console.log('Note: Google does not participate in IndexNow — use Search Console for Google.')
  process.exit(0)
}

// The API accepts up to 10,000 per request; batch anyway so a large site does
// not depend on one enormous POST succeeding.
const BATCH = 1000
let sent = 0

for (let index = 0; index < urls.length; index += BATCH) {
  const batch = urls.slice(index, index + BATCH)
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key,
      keyLocation: `${siteUrl}/${key}.txt`,
      urlList: batch,
    }),
  })

  // 200 accepted, 202 accepted but key still being verified. Both are fine.
  if (response.ok || response.status === 202) {
    sent += batch.length
    console.log(`  sent ${batch.length} (HTTP ${response.status})`)
  } else {
    const body = await response.text().catch(() => '')
    console.error(`  batch failed: HTTP ${response.status} ${body.slice(0, 200)}`)
    console.error('  422 usually means the key file is not reachable at keyLocation yet.')
    process.exitCode = 1
  }
}

console.log(`\n${sent} of ${urls.length} URLs submitted to the IndexNow network`)
console.log('Bing, Yandex, Seznam, Naver and Yep consume this. Google does not.')
