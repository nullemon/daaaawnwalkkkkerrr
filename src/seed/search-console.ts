import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { auditNetwork, networkRoot, searchConsoleProperties } from '../lib/audit'
import { hostsServingNoVerificationTag } from '../lib/audit-source'

/**
 * Everything around verifying this network in Google Search Console, except
 * the part only the owner can do.
 *
 *   pnpm seo:search-console
 *
 * One property has to be added by hand per origin — the apex, every wiki and
 * the two network hosts — because a search engine treats an origin as a
 * separate site and a token verified at the apex does nothing for a subdomain.
 * That is eleven today and one more with every wiki. What makes it tedious rather
 * than hard is that none of the values are anywhere convenient: the host a
 * wiki serves on is derived from its slug, the sitemap is generated per host
 * from the Host header, and which token applies to which origin is a fallback
 * rule in `lib/tags.ts`. So this prints all of them, in the order to work
 * through, with the admin URL of the box each token goes into.
 *
 * ## Why this is a report and nothing else
 *
 * Same split as `pnpm check:launch`: every question is answered in
 * `src/lib/audit.ts` and this file prints. "Has this wiki got a token" is
 * asked exactly once in this repository — `resolvedToken` — and the checklist,
 * the admin dashboard and this script all read that one answer. The day two of
 * them disagree the owner cannot tell which is lying, and the reassuring one
 * wins; that is the entry in CLAUDE.md this whole area exists because of.
 *
 * ## What it cannot do
 *
 * Verify anything. Search Console's API needs an OAuth client and a verified
 * account before it will tell you anything at all, which is a credential the
 * owner would have to create and store — for a job that is ten minutes, once.
 * Nothing here talks to Google, and nothing here needs a running site.
 */

/** The three ways this deployment can prove it owns a host, and their state. */
const METHODS = `
  HTML tag        SUPPORTED. The one this deployment is built for: paste the
                  content value into the admin and it is served from the
                  database in <head> on that origin. Site settings holds the
                  network's; each Game holds its own, and an empty one
                  inherits the network's. Nothing to deploy.

  DNS TXT         SUPPORTED, and the shortest path. One TXT record at the apex
                  registers a *Domain* property, which covers every label
                  under it — every host below, including any wiki added later,
                  with no token pasted anywhere. It is set at the
                  registrar rather than in this admin, so nothing here can
                  check it.

  HTML file       NOT AVAILABLE. Google asks for /google<token>.html at the
                  root. \`proxy.ts\` rewrites any path whose first segment is not
                  in PASS_THROUGH onto a game prefix, so that file 404s on
                  every host — the same trap the IndexNow key file fell into,
                  which is why the key is answered from the database by a route
                  instead of being a file.

  Analytics / GTM Only where that tag is already live on the origin being
                  verified. \`pnpm check:launch\` lists which wikis have a GA4 or
                  Tag Manager ID; a wiki with neither cannot use these, and the
                  network's own page-view measurement at /admin/analytics is
                  not something Google can read.
`

async function run(): Promise<void> {
  const payload = await getPayload({ config })

  /*
    One audit pass, for two reasons. It is where the record counts come from —
    so the wikis print biggest first, which is the order the work pays off in —
    and it means the token findings printed at the bottom are literally the
    findings `pnpm check:launch` prints, not a second opinion about them.
  */
  const snapshot = await auditNetwork(payload)
  const properties = await searchConsoleProperties(payload, snapshot.wikis)

  const root = networkRoot()
  const local = /localhost|127\.0\.0\.1/.test(root)

  console.log('')
  console.log(`Search Console properties for ${root} — ${properties.length} of them`)
  if (local) {
    console.log('')
    console.log(
      '  NEXT_PUBLIC_SITE_URL still points at localhost, so every URL below is the local one.\n' +
        '  Set it to the production origin and re-run before pasting anything into Google.',
    )
  }
  console.log('')
  console.log(METHODS.trimEnd())
  console.log('')
  console.log('  A Domain property covers all of them at once. Everything below assumes you are')
  console.log('  adding URL-prefix properties instead, one per origin.')
  console.log('')

  const KIND = { hub: 'hub', wiki: 'wiki', network: 'network host' }
  let index = 0
  for (const row of properties) {
    index += 1
    const state = row.token
      ? row.token.from === 'own'
        ? 'token set on this wiki'
        : 'inherits the network token'
      : 'NO TOKEN'
    console.log(`${String(index).padStart(3)}. ${row.property}`)
    console.log(
      `     ${KIND[row.kind]}${row.records ? `, ${row.records.toLocaleString('en-GB')} records` : ''} · ${state}`,
    )
    console.log(`     sitemap   ${row.sitemap}`)
    if (!row.token) console.log(`     paste at  ${row.href}  (${row.where})`)
  }

  /*
    The two hosts where pasting a token in would not work.

    Read from `audit-source.ts` rather than decided here: it is the same fact
    `pnpm check:launch` reports, and a host that quietly started serving its
    tag should drop off both lists at once.
  */
  const silent = hostsServingNoVerificationTag()
  if (silent.length > 0) {
    console.log('')
    console.log('Hosts the HTML-tag method cannot verify at all')
    for (const host of silent) {
      console.log(
        `  ${host}.${root} — its layout never emits a verification tag, so the network token\n` +
          `    does not reach it. Either verify it with a DNS Domain property, or have\n` +
          `    src/app/(frontend)/${host}/layout.tsx return verificationMetadata(await resolveTags()).`,
      )
    }
  }

  const missing = properties.filter((row) => !row.token).length
  console.log('')
  console.log(
    missing === 0
      ? 'Every property has a token to serve. Add each one above, choose "HTML tag", then submit its sitemap.'
      : `${missing} of ${properties.length} have no token to serve yet. Add the property in Google first — it hands you the token — then paste it at the admin URL above and re-run this to confirm.`,
  )
  console.log('')
  console.log('Once a property verifies, submit its sitemap URL under Sitemaps in Search Console.')
  console.log('Google does not take IndexNow submissions, so the sitemap is the only channel it has.')
  console.log('')

  /*
    Zero either way. This is a checklist rather than a gate: a property nobody
    has added yet is the state of a network that has not launched, not a
    failure, and `pnpm check:launch` is the command that decides whether
    anything is blocking.
  */
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
