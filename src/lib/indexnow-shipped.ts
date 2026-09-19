import fs from 'node:fs'
import path from 'node:path'
import { KEY_PATTERN } from './indexnow'

/**
 * The IndexNow key that shipped in the repository, found on disk.
 *
 * Found by **shape** rather than by name — a `.txt` file in `public/` whose
 * stem is its own contents — so rotating the committed key stays what
 * `docs/DEPLOY.md` says it is: drop a new file in, delete the old one, and
 * change nothing in the code.
 *
 * It is a module of its own because two server-side callers need it and a
 * second copy of ten lines is how the route and the publish hook come to
 * resolve different keys — which is the one failure IndexNow reports without
 * saying what it was (HTTP 422, "key not valid", naming neither the key nor
 * the host). `tools/indexnow.mjs` still has its own copy, and has to: it is
 * plain node and cannot import TypeScript. `indexnow.test.ts` is what holds
 * those two together.
 *
 * `fs` is why this is separate from `lib/indexnow.ts`: that module is imported
 * by `proxy.ts`, which must stay free of node built-ins.
 *
 * Read once per process. It cannot change without a deploy, and a deploy is a
 * new process.
 */
let cache: string | null | undefined

export const shippedIndexNowKey = (dir = path.join(process.cwd(), 'public')): string | null => {
  if (cache !== undefined) return cache
  cache = null
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.txt')) continue
      const stem = name.slice(0, -4)
      if (!KEY_PATTERN.test(stem)) continue
      if (fs.readFileSync(path.join(dir, name), 'utf8').trim() === stem) {
        cache = stem
        break
      }
    }
  } catch {
    /* No public directory, or it is unreadable. A key set in the admin still
       works, and a missing fallback is a 404 on the key file rather than a 500
       on a route every host serves. */
  }
  return cache
}

/** Test seam, and what a hot reload needs. Nothing in the app calls it. */
export const forgetShippedIndexNowKey = (): void => {
  cache = undefined
}
