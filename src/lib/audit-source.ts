import fs from 'fs'
import path from 'path'
import type { Finding } from './audit'

/**
 * The launch checks that read the repository rather than the database.
 *
 * Split out of `audit.ts` so that module can be imported by the admin panel
 * without dragging `fs` and `path` in behind it. Neither of these findings is
 * something anybody can act on from a CMS — one is a source file to edit, the
 * other a file to add to `public/` — so the admin has nothing to do with them,
 * and a client component that one day imports a type from `audit.ts` should
 * not fail to bundle because of a Node builtin it never asked for.
 *
 * Both are resolved against `process.cwd()`, which is the repository root when
 * `pnpm check:launch` runs it. That is the only caller, and it is the reason
 * these are not in the shared module: the admin's working directory in a
 * standalone deployment is not the repository, so the same walk would find
 * nothing there and report a clean bill of health it had not earned.
 */

/** A whole `export const metadata: Metadata = { … }` object, braces included. */
const METADATA_OBJECT = new RegExp(String.raw`export const metadata: Metadata = \{[\s\S]*?\n\}`)
const TITLE_OR_DESCRIPTION = new RegExp(String.raw`\btitle:|\bdescription:`)

const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(full) : entry.name === 'page.tsx' ? [full] : []
      })
    : []

/**
 * The network hosts whose layout never emits a verification tag.
 *
 * Exported because `pnpm seo:search-console` has to say the same thing while
 * walking somebody through adding ten properties, and a second regex over the
 * same two files is the drift this project keeps meeting. One reader, two
 * callers.
 *
 * Only the two non-wiki hosts are asked. `[game]/layout.tsx` and the hub's
 * both call `verificationMetadata`, and a wiki that stopped would be caught by
 * every wiki losing its tag at once — a failure loud enough to find. These two
 * lost it by never having it, which is the quiet kind.
 */
export function hostsServingNoVerificationTag(): string[] {
  const routes = path.resolve('src', 'app', '(frontend)')
  return ['companies', 'people'].filter((host) => {
    const layout = path.join(routes, host, 'layout.tsx')
    if (!fs.existsSync(layout)) return false
    return !/verification/.test(fs.readFileSync(layout, 'utf8'))
  })
}

export function auditSource(): Finding[] {
  const findings: Finding[] = []

  // --- Copy that cannot vary per wiki --------------------------------------
  /*
    A `export const metadata` object under `[game]` is one title and one
    description served by all eight wikis at once — eight pages competing for
    the same search result, seven of them describing a game they are not about.
    It is invisible: the page renders, the build is green, and the only symptom
    is a ranking nobody was watching. Ten pages shipped like this.

    A noindex page is exempt, because nothing is competing for anything.
  */
  const routes = path.resolve('src', 'app', '(frontend)')
  for (const file of walk(path.join(routes, '[game]'))) {
    const source = fs.readFileSync(file, 'utf8')
    const block = source.match(METADATA_OBJECT)
    if (!block) continue
    if (/index: false/.test(block[0])) continue
    if (!TITLE_OR_DESCRIPTION.test(block[0])) continue
    findings.push({
      level: 'blocking',
      actor: 'editorial',
      area: 'per-wiki copy',
      detail: `${path.relative(process.cwd(), file)} exports a static metadata title or description — every wiki serves the same one`,
      count: 1,
    })
  }

  // --- Hosts whose <head> cannot carry a verification tag -------------------
  /*
    `companies.<domain>` and `people.<domain>` are separate origins, so each is
    its own Search Console property and each needs its own verification. This
    deployment verifies by meta tag — `verificationMetadata` in `lib/tags.ts`,
    read from the database and emitted by the layout that asks for it — and
    these two layouts never ask.

    So the network token, which is the only one they could inherit, is not
    served on either host. `audit.ts` already reports that neither has a field
    of its own; what it cannot see is that the fallback does not reach them
    either, which turns "paste the token in" into an instruction that cannot
    work. It is a source fact — two `generateMetadata` functions — so it is
    here, and `pnpm seo:search-console` prints it beside the property list
    rather than deciding it again.

    A page in `public/` is not an answer: `proxy.ts` only serves a path whose
    first segment is in `PASS_THROUGH`, so Google's HTML-file method cannot
    reach these hosts. A DNS TXT record on the apex can — one Domain property
    covers every label — which is the recommendation the script makes.
  */
  for (const host of hostsServingNoVerificationTag()) {
    findings.push({
      level: 'warn',
      actor: 'owner',
      area: host,
      detail: `${host}.<domain> serves no verification tag at all — its layout never calls verificationMetadata, so the network token cannot reach this host and the HTML-tag method cannot verify it. Use a DNS Domain property, or have this layout emit the tag.`,
      count: 1,
    })
  }

  // --- Shared static files -------------------------------------------------
  const publicDir = path.resolve('public')
  for (const file of [
    'icon.svg',
    'favicon-32.png',
    'icon-512.png',
    'apple-touch-icon.png',
    'og.png',
  ]) {
    if (!fs.existsSync(path.join(publicDir, file))) {
      findings.push({
        level: 'blocking',
        actor: 'editorial',
        area: 'static',
        detail: `public/${file} is missing`,
        count: 1,
      })
    }
  }

  return findings
}
