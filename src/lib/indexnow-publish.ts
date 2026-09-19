import type { CollectionAfterChangeHook, CollectionConfig, Payload } from 'payload'
import { resolveIndexNowKey } from './indexnow'
import { shippedIndexNowKey } from './indexnow-shipped'
import { PingQueue, isPublication, pingAllowed } from './indexnow-ping'
import { SECTION_PATH, type GameScopedCollection } from './tenancy'

/**
 * The half of the publish ping that touches a database and the network.
 *
 * `indexnow-ping.ts` decides *whether* and *when*; this decides *what URL* and
 * does the asking. The split is the one this project already makes three times
 * over, and it is what lets every ceiling and every refusal be a unit test
 * with no database anywhere near it.
 *
 * ## What gets announced
 *
 * One URL: the page of the record that was just published, on its own wiki's
 * host. Not the sitemap, not the section index, not the hub. A section index
 * does change when a record is added to it, and it is deliberately left out —
 * announcing two URLs per publish doubles the volume for a page crawlers
 * already revisit, and volume is the currency IndexNow is priced in.
 *
 * ## What is asked before anything is sent
 *
 * **Does the page answer 200 on its own host?** Every public page is
 * prerendered, so a record published between builds has no page yet, and
 * announcing a URL that 404s invites a crawler to fetch a 404 and remember it.
 * This is the answer to the objection `docs/DEPLOY.md` recorded against an
 * automatic trigger, and it is a question rather than an assumption.
 *
 * **Is the key file being served on that host?** An unreachable
 * `/<key>.txt` is the one thing that makes IndexNow refuse a submission, and
 * it answers HTTP 422 with a body that names neither the key nor the host. It
 * has already been wrong once on this network — `public/` was not in
 * `PASS_THROUGH`, so the key file 404'd on every wiki host. Asked once per
 * host per process, because it cannot change without a deploy.
 *
 * ## What it does not do
 *
 * It does not retry, it does not persist, and it holds nothing open: the timer
 * is unref'd, so a submission that has not fired when the process ends does
 * not fire. Everything it might miss, `pnpm indexnow -- --send` submits in
 * full, on purpose, with somebody watching.
 */

/* -------------------------------------------------------------------------- */
/* The URL of a record                                                        */
/* -------------------------------------------------------------------------- */

/** Which collections have a public page, and where it lives. Nothing else pings. */
const pingable = (collection: string): collection is GameScopedCollection =>
  Object.prototype.hasOwnProperty.call(SECTION_PATH, collection)

/**
 * A wiki's host label, cached per process.
 *
 * `subdomain` when the game sets one, otherwise the slug — the same rule
 * `gameUrl` follows, and the reason the two must agree is that an engine
 * fetching a URL this module invented would get a 404 on a host that does not
 * exist.
 */
const labels = new Map<string, string | null>()

const gameLabel = async (payload: Payload, game: unknown): Promise<string | null> => {
  const id =
    typeof game === 'object' && game !== null
      ? ((game as { id?: number | string }).id ?? null)
      : (game as number | string | null)
  if (id === null || id === undefined) return null

  const key = String(id)
  const known = labels.get(key)
  if (known !== undefined) return known

  /* The relationship may already be resolved by another hook's depth. Use it
     rather than asking again. */
  const embedded =
    typeof game === 'object' && game !== null
      ? ((game as { subdomain?: string | null; slug?: string }).subdomain ||
        (game as { slug?: string }).slug ||
        null)
      : null
  if (embedded) {
    labels.set(key, embedded)
    return embedded
  }

  try {
    const row = (await payload.findByID({
      collection: 'games',
      id: id as number,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })) as { slug?: string; subdomain?: string | null } | null
    const label = row ? row.subdomain || row.slug || null : null
    labels.set(key, label)
    return label
  } catch {
    return null
  }
}

/**
 * Where this record is served, as an absolute URL, or null when it has no
 * page — no game, no slug, a collection with no public route.
 *
 * Composed from `NEXT_PUBLIC_SITE_URL` and `SECTION_PATH`, which is the same
 * pair the sitemap and the navigation are built from. A second table of paths
 * here would be a table that disagrees the first time a section moves, and the
 * symptom would be a 404 announced to five search engines.
 */
export const recordUrl = async (args: {
  payload: Payload
  collection: string
  doc: Record<string, unknown>
  origin: string
}): Promise<string | null> => {
  const { payload, collection, doc, origin } = args
  if (!pingable(collection)) return null
  const slug = typeof doc.slug === 'string' ? doc.slug : ''
  if (!slug) return null

  const label = await gameLabel(payload, doc.game)
  if (!label) return null

  const url = new URL(origin)
  url.host = `${label}.${url.host}`
  return `${url.origin}${SECTION_PATH[collection]}/${slug}`
}

/* -------------------------------------------------------------------------- */
/* Submitting                                                                 */
/* -------------------------------------------------------------------------- */

const ENDPOINT = 'https://api.indexnow.org/IndexNow'

/*
  `Connection: close` on every request, for the reason the whole repository
  now knows: a keep-alive socket still closing when a node process exits trips
  a libuv assertion on Windows. Nothing here calls `process.exit`, but these
  requests are made from short-lived scripts' sibling code paths often enough
  that carrying the header everywhere is cheaper than remembering which file
  is which.
*/
const CLOSE = { Connection: 'close' }

const liveKey = async (payload: Payload): Promise<string | null> => {
  let stored: string | null = null
  try {
    const settings = (await payload.findGlobal({ slug: 'site-settings', depth: 0 })) as {
      indexnowKey?: string | null
    }
    stored = settings?.indexnowKey ?? null
  } catch {
    /* The shipped key is on disk and correct regardless. */
  }
  const resolved = resolveIndexNowKey({
    settings: stored,
    env: process.env.INDEXNOW_KEY ?? null,
    shipped: shippedIndexNowKey(),
  })
  return resolved?.key ?? null
}

/** Does this host serve the key file? Asked once per host per process. */
const keyFileOk = new Map<string, Promise<boolean>>()

const keyFileServed = (origin: string, key: string, log: (message: string) => void) => {
  const known = keyFileOk.get(origin)
  if (known) return known
  const asking = (async () => {
    try {
      const response = await fetch(`${origin}/${key}.txt`, {
        headers: { Accept: 'text/plain', ...CLOSE },
      })
      if (!response.ok) {
        log(
          `${origin}/${key}.txt answered HTTP ${response.status}, so nothing was submitted for that host. An unreachable key file is the one thing IndexNow refuses a submission for, and it says so only as a 422 naming nothing. \`pnpm indexnow\` prints the same check for every host.`,
        )
        return false
      }
      const body = (await response.text()).trim()
      if (body !== key) {
        log(`${origin}/${key}.txt served something other than the key, so nothing was submitted.`)
        return false
      }
      return true
    } catch (error) {
      log(`${origin}/${key}.txt could not be fetched — ${(error as Error).message}`)
      return false
    }
  })()
  keyFileOk.set(origin, asking)
  return asking
}

/**
 * Is the page actually there?
 *
 * A prerendered site publishes a record before the page exists. Announcing
 * that URL would be asking five engines to fetch a 404 — so the URL is
 * fetched first and dropped if it is not there, with a line saying the page
 * will be announced by the next `pnpm indexnow -- --send` after a build.
 */
const pageIsLive = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html', ...CLOSE } })
    return response.ok
  } catch {
    return false
  }
}

const submit = async (urls: string[], payload: Payload, log: (message: string) => void) => {
  const key = await liveKey(payload)
  if (!key) {
    log('No IndexNow key resolved, so nothing was submitted. Site settings → SEO & analytics.')
    return
  }

  /* IndexNow requires every URL in a submission to belong to the host it
     names; a mixed batch is rejected whole. */
  const byOrigin = new Map<string, string[]>()
  for (const url of urls) {
    const origin = new URL(url).origin
    byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), url])
  }

  for (const [origin, group] of byOrigin) {
    if (!(await keyFileServed(origin, key, log))) continue

    const live: string[] = []
    for (const url of group) {
      if (await pageIsLive(url)) live.push(url)
      else {
        log(
          `${url} is published but not built yet, so it was not announced. It will be in the next \`pnpm indexnow -- --send\` after a deploy — a URL announced before it exists is a 404 a crawler remembers.`,
        )
      }
    }
    if (live.length === 0) continue

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CLOSE },
        body: JSON.stringify({
          host: new URL(origin).host,
          key,
          keyLocation: `${origin}/${key}.txt`,
          urlList: live,
        }),
      })
      /* 200 accepted, 202 accepted but the key is still being verified. */
      if (response.ok || response.status === 202) {
        log(`submitted ${live.length} URL${live.length === 1 ? '' : 's'} for ${new URL(origin).host} (HTTP ${response.status})`)
      } else {
        log(`${new URL(origin).host}: IndexNow answered HTTP ${response.status}. Nothing is retried; \`pnpm indexnow -- --send\` is the tool that submits everything.`)
      }
    } catch (error) {
      log(`${new URL(origin).host}: submission failed — ${(error as Error).message}`)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                   */
/* -------------------------------------------------------------------------- */

let queue: PingQueue | null = null

const queueFor = (payload: Payload): PingQueue => {
  if (!queue) {
    const log = (message: string) => payload.logger.info(`[indexnow] ${message}`)
    queue = new PingQueue({ send: (urls) => submit(urls, payload, log), log })
  }
  return queue
}

/**
 * The `afterChange` hook that announces a published page.
 *
 * It **never throws and never delays the write**. A save is the editor's work
 * and a search engine's opinion of it is not; a hook that could fail a publish
 * because `api.indexnow.org` was slow would be trading the thing that matters
 * for the thing that does not. So everything after the queue is fire and
 * forget, and every failure is a line in the log rather than an error the
 * editor sees.
 */
export const pingOnPublish =
  (collection: CollectionConfig): CollectionAfterChangeHook =>
  ({ doc, previousDoc, operation, req }) => {
    try {
      const allowed = pingAllowed()
      if (!allowed.ok) return doc

      const record = doc as Record<string, unknown>
      const hasDrafts = Boolean(
        collection.versions && typeof collection.versions === 'object' && collection.versions.drafts,
      )
      if (
        !isPublication({
          operation,
          status: record._status,
          previousStatus: (previousDoc as Record<string, unknown> | undefined)?._status,
          hasDrafts,
        })
      ) {
        return doc
      }

      void recordUrl({
        payload: req.payload,
        collection: collection.slug,
        doc: record,
        origin: allowed.origin,
      }).then((url) => {
        if (url) queueFor(req.payload).add(url)
      })
    } catch {
      /* A publish is never failed by this. See above. */
    }
    return doc
  }

/**
 * Attach the ping to every collection that has a public page.
 *
 * Wrapping the list in `payload.config.ts` rather than editing sixteen
 * collection files: the rule is "a published page is announced", which is one
 * rule, and a rule written into sixteen files is a rule missing from the
 * seventeenth. `SECTION_PATH` is the list of collections with a page, so a new
 * section gets the behaviour by existing rather than by somebody remembering.
 *
 * Collections without a public page — `media`, `authors`, `companies`,
 * `people`, the remote tables — are left exactly as they were.
 */
export const withPublishPing = (collections: CollectionConfig[]): CollectionConfig[] =>
  collections.map((collection) => {
    if (!pingable(collection.slug)) return collection
    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterChange: [...(collection.hooks?.afterChange ?? []), pingOnPublish(collection)],
      },
    }
  })
