import fs from 'node:fs'
import path from 'node:path'
import { getSiteSettings } from '@/lib/payload'
import { KEY_PATTERN, resolveIndexNowKey, type ResolvedKey } from '@/lib/indexnow'

/**
 * The IndexNow key file, answered from the database on every host.
 *
 * ## What has to be true
 *
 * IndexNow verifies ownership by fetching `https://<host>/<key>.txt` and
 * checking the body is that same key. The network is ten hosts — the hub,
 * seven wikis, `companies` and `people` — and each is its own origin to an
 * engine, so each has to answer.
 *
 * A key committed as `public/<key>.txt` is served on all of them, because
 * there is one deployment. A key the owner types into Site settings has no
 * file anywhere, which is why this route exists.
 *
 * ## Why it is reached by a rewrite rather than by its own path
 *
 * `/<key>.txt` is a single root segment, and root segments belong to
 * `[game]` — a second dynamic segment there is a route conflict, not a
 * fallback. So `proxy.ts` matches the *shape* `<8-128 chars>.txt` and rewrites
 * it here, the same exemption that already kept the committed key file from
 * being read as a wiki slug. `/api` is in `PASS_THROUGH`, so this answers
 * identically on every host and is never rewritten onto a game prefix.
 *
 * It sits outside both route groups so the static `/api/indexnow` segment wins
 * over Payload's generated `(payload)/api/[...slug]` catch-all — the same
 * reason `/api/rate` does. If that stops being true the symptom is a Payload
 * 404 body coming back from this URL, not a build error.
 *
 * ## Why a wrong key must 404
 *
 * A route that echoed back whatever key it was asked for would confirm any key
 * anybody guessed, which is an ownership proof that proves nothing: a third
 * party could submit URLs on this network's behalf by inventing a key and
 * pointing `keyLocation` at us. So exactly one key answers 200 and everything
 * else answers 404, including the key that was live before a rotation.
 */

/* Reads a global and the filesystem, and must reflect a settings change
   without a rebuild. Never prerendered. */
export const dynamic = 'force-dynamic'

/**
 * The key that shipped in the repository, or null.
 *
 * Found by shape rather than by name — a file whose stem matches its own
 * contents — so rotating the committed key stays what `docs/DEPLOY.md` says it
 * is: drop a new file into `public/` and delete the old one, with nothing in
 * the code to edit. `tools/indexnow.mjs` looks for it exactly this way.
 *
 * Read once per process rather than per request. This cannot change without a
 * deploy, and a deploy is a new process.
 */
let shippedKeyCache: string | null | undefined
const shippedKey = (): string | null => {
  if (shippedKeyCache !== undefined) return shippedKeyCache
  shippedKeyCache = null
  try {
    const dir = path.join(process.cwd(), 'public')
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.txt')) continue
      const stem = name.slice(0, -4)
      if (!KEY_PATTERN.test(stem)) continue
      if (fs.readFileSync(path.join(dir, name), 'utf8').trim() === stem) {
        shippedKeyCache = stem
        break
      }
    }
  } catch {
    /* No public directory, or it is unreadable. A settings key still works,
       and a missing fallback is a 404 on the key file rather than a 500 on a
       route every host serves. */
  }
  return shippedKeyCache
}

/**
 * The key this deployment is serving, resolved the same way `tools/indexnow.mjs`
 * resolves the key it submits. The two agreeing is the whole point — see
 * `lib/indexnow.ts`.
 */
/* Not exported: Next type-checks a route file's exports against a fixed set,
   and an extra one is a build error rather than a lint note. */
const activeKey = async (): Promise<ResolvedKey> => {
  let stored: string | null = null
  try {
    const settings = await getSiteSettings()
    stored = (settings.indexnowKey as string | null | undefined) ?? null
  } catch {
    /* The database being unavailable must not take the shipped key down with
       it; that key is on disk and correct regardless. */
  }
  return resolveIndexNowKey({
    settings: stored,
    env: process.env.INDEXNOW_KEY ?? null,
    shipped: shippedKey(),
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params
  const active = await activeKey()

  if (!active || key !== active.key) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(active.key, {
    status: 200,
    headers: {
      /* Engines check the content type as well as the body; a key file served
         as HTML is a failed verification with no other symptom. */
      'Content-Type': 'text/plain; charset=utf-8',
      /* Short, because rotating the key in the admin has to take effect before
         the next submission rather than whenever a cache decides. */
      'Cache-Control': 'public, max-age=300',
    },
  })
}
