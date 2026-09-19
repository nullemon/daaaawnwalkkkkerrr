/**
 * Telling the engines about one page, the moment it is published.
 *
 * `docs/DEPLOY.md` section 6 used to say that nothing triggers IndexNow
 * automatically and that this was deliberate. The owner has since asked for
 * the site to ping on publish, and the two arguments that were recorded
 * against it are both real, so this module is the answer to them rather than a
 * decision to ignore them.
 *
 * ## The two arguments, and what is done about each
 *
 * **"A save hook would submit the whole sitemap for a typo fix."** It would, if
 * it submitted the sitemap. This submits *the URL of the record that was
 * published* and nothing else — one page, the one that changed. IndexNow is
 * priced in trust rather than in requests, and re-submitting unchanged URLs is
 * the documented way to get a key throttled, so the ceilings below are not
 * politeness: they are the thing that stops one `pnpm db:reset` against a live
 * database from spending the only reputation this key has.
 *
 * **"Every public page is prerendered, so a saved record is not live until the
 * next build."** Also true, and it is why nothing is announced without asking
 * the host for the URL first. A page that answers 404 because the build has
 * not run yet is not submitted — announcing it would be inviting a crawler to
 * fetch a 404 and remember it. A page that answers 200 is a real page whose
 * text may be one revision behind, which is a re-crawl doing exactly what a
 * re-crawl is for.
 *
 * ## The guards, in the order they fire
 *
 *   1. **Only the serving site pings.** A seed script is not a deployment
 *      announcing a change, and `pnpm db:reset` republishes thousands of
 *      records. The discriminator is `NEXT_RUNTIME`, which the Next server
 *      sets on its own process and a `tsx` script does not have.
 *   2. **Only a real public origin.** No localhost, no unset site URL.
 *   3. **Only a publish**, not every save — the transition into published, or
 *      a create that is already published.
 *   4. **Coalesced**, so twenty edits in a minute are one submission.
 *   5. **A burst ceiling**, above which the batch is *dropped* with a sentence
 *      naming the count. Twenty-six URLs arriving in ten seconds is not an
 *      editor publishing a page, it is a script, and a script's worth of URLs
 *      belongs in `pnpm indexnow -- --send` after the deploy where somebody
 *      can see what is being submitted.
 *   6. **An hourly ceiling**, for the slow version of the same thing.
 *
 * Every one of those is a refusal to submit rather than a delay, and each says
 * so once. Silence would be the failure this project keeps a list of: a run
 * that looks successful and did nothing.
 *
 * No Payload import and no I/O, so all of it is a unit test away — the split
 * `appearance.ts`/`appearance-settings.ts` and `email.ts`/`email-adapter.ts`
 * already make. The half that touches a database and the network is
 * `src/lib/indexnow-publish.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Whether to ping at all                                                      */
/* -------------------------------------------------------------------------- */

export type PingVerdict = { ok: true; origin: string } | { ok: false; why: string }

/**
 * Is this process one that should be announcing pages?
 *
 * `NEXT_RUNTIME` is set by the Next server on its own process and by nothing
 * else here. That is the whole of the seed guard, and it is a property of the
 * process rather than a flag somebody has to remember to pass: `pnpm seed`,
 * `pnpm ingest`, `pnpm db:reset` and every generator run under `tsx`, so none
 * of them can announce anything however many records they publish. A flag
 * would have to be threaded through thirty scripts and would be missing from
 * the thirty-first.
 *
 * `INDEXNOW_PING=off` turns it off on a deployment that wants the old
 * manual-only behaviour. There is no `on` value that overrides the checks
 * below — a switch that could force submissions from a local machine would be
 * a switch that submits `http://localhost:3000/...` to Bing.
 *
 * **Where `NEXT_RUNTIME` is not set, nothing is announced**, and that is the
 * right direction for a guard to fail in. The `next` binary sets it for `dev`,
 * `build` and `start`, and hosting platforms set it themselves, but a
 * standalone build started as `node server.js` has no `next` binary in the
 * chain and therefore no variable. Such a deployment sets `NEXT_RUNTIME=nodejs`
 * in its own environment — the same value, stated deliberately — and
 * `docs/DEPLOY.md` says so. Making the variable optional instead would mean a
 * seed run is only silent by luck.
 */
export const pingAllowed = (
  env: Record<string, string | undefined> = process.env,
): PingVerdict => {
  if ((env.INDEXNOW_PING ?? '').trim().toLowerCase() === 'off') {
    return { ok: false, why: 'INDEXNOW_PING=off' }
  }
  if (!env.NEXT_RUNTIME) {
    return {
      ok: false,
      why: 'not the serving site — a script publishing records announces nothing',
    }
  }
  const site = (env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '')
  if (!site) return { ok: false, why: 'NEXT_PUBLIC_SITE_URL is unset' }
  let origin: URL
  try {
    origin = new URL(site)
  } catch {
    return { ok: false, why: `NEXT_PUBLIC_SITE_URL is not a URL: ${site}` }
  }
  if (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') {
    return { ok: false, why: 'the site URL is localhost, which no engine can fetch' }
  }
  return { ok: true, origin: origin.origin }
}

/* -------------------------------------------------------------------------- */
/* Whether this particular change is a publication                            */
/* -------------------------------------------------------------------------- */

export type ChangeShape = {
  operation: 'create' | 'update'
  status?: unknown
  previousStatus?: unknown
  /** Absent on a collection without drafts, where every save is live. */
  hasDrafts: boolean
}

/**
 * Did this save put a page in front of a reader who could not see it before?
 *
 * On `guides`, the one collection with drafts, that is the transition into
 * `published` — a draft edited and saved as a draft is not a publication, and
 * a published record edited again is a change to a page the engines already
 * know, which the sitemap's `lastmod` carries. On every other collection a
 * create is the publication and an update is a change to a live page; both are
 * announced, because there is no draft state to distinguish them and a wiki
 * page that gained a section is worth a re-crawl.
 *
 * The one case deliberately *not* announced is a draft save. Announcing a URL
 * that 404s is worse than announcing nothing: the crawler fetches it, records
 * the 404, and the page starts life having already failed once.
 */
export const isPublication = (change: ChangeShape): boolean => {
  if (!change.hasDrafts) return true
  if (change.status !== 'published') return false
  if (change.operation === 'create') return true
  return change.previousStatus !== 'published'
}

/* -------------------------------------------------------------------------- */
/* The queue                                                                  */
/* -------------------------------------------------------------------------- */

/** How long a quiet spell ends a batch. Twenty edits in a minute are one send. */
export const QUIET_MS = 10_000

/** However busy it stays, a batch goes after this long. */
export const MAX_WAIT_MS = 60_000

/**
 * More URLs than this in one batch is not an editor, it is a script.
 *
 * The batch is dropped rather than trimmed. Sending the first twenty-five of
 * four hundred would be a submission that looks successful and is arbitrary —
 * the wrong twenty-five, with nothing saying which, which is worse than a
 * sentence telling somebody to run the tool that submits all of them on
 * purpose.
 */
export const MAX_PER_FLUSH = 25

/** And the slow version of the same thing. */
export const HOURLY_MAX = 200
export const HOUR_MS = 3_600_000

export type QueueDeps = {
  /** Submit these URLs. Only ever called with at least one. */
  send: (urls: string[]) => void | Promise<void>
  now?: () => number
  /** Injected so the tests do not wait ten seconds. */
  schedule?: (run: () => void, ms: number) => void
  log?: (message: string) => void
}

/**
 * Collects URLs and decides when — and whether — a batch is submitted.
 *
 * One per process, in memory. It holds nothing durable on purpose: a queue
 * that survived a restart would be a queue that announces a page the deploy
 * that restarted it may have removed, and the thing that submits everything
 * reliably already exists and is called `pnpm indexnow -- --send`.
 */
export class PingQueue {
  private pending = new Set<string>()
  private firstAddedAt: number | null = null
  private lastAddedAt = 0
  private timerSet = false
  private sentThisHour = 0
  private hourStartedAt = 0
  private said = new Set<string>()

  private readonly send: QueueDeps['send']
  private readonly now: () => number
  private readonly schedule: (run: () => void, ms: number) => void
  private readonly log: (message: string) => void

  constructor(deps: QueueDeps) {
    this.send = deps.send
    this.now = deps.now ?? (() => Date.now())
    this.schedule =
      deps.schedule ??
      ((run, ms) => {
        const timer = setTimeout(run, ms)
        /* Never hold the process open for a submission. A page that misses its
           ping is re-announced by the next `pnpm indexnow -- --send`; a node
           process that will not exit is a deploy that hangs. */
        if (typeof (timer as { unref?: () => void }).unref === 'function') {
          ;(timer as unknown as { unref: () => void }).unref()
        }
      })
    this.log = deps.log ?? ((message) => console.log(`[indexnow] ${message}`))
  }

  /** Say something once per reason, so a loop cannot fill a log with it. */
  private once(key: string, message: string): void {
    if (this.said.has(key)) return
    this.said.add(key)
    this.log(message)
  }

  add(url: string): void {
    if (!url) return
    const now = this.now()
    if (this.firstAddedAt === null) this.firstAddedAt = now
    this.lastAddedAt = now
    this.pending.add(url)

    if (this.timerSet) return
    this.timerSet = true
    const waited = now - this.firstAddedAt
    this.schedule(() => this.flush(), Math.max(0, Math.min(QUIET_MS, MAX_WAIT_MS - waited)))
  }

  /**
   * Hand the batch over, or refuse it with a sentence.
   *
   * Public because the tests drive it directly; the timer is the only other
   * caller.
   */
  flush(): void {
    this.timerSet = false
    const now = this.now()
    const urls = [...this.pending]
    const startedAt = this.firstAddedAt

    /*
      Still busy and still inside the window: wait for the quiet spell rather
      than sending a batch that is about to grow. `MAX_WAIT_MS` is what stops
      a steady drip from deferring for ever.
    */
    if (urls.length > 0 && startedAt !== null && now - startedAt < MAX_WAIT_MS) {
      const quietFor = now - this.lastAddedAt
      if (quietFor < QUIET_MS) {
        this.timerSet = true
        this.schedule(() => this.flush(), QUIET_MS - quietFor)
        return
      }
    }

    this.pending.clear()
    this.firstAddedAt = null
    if (urls.length === 0) return

    if (urls.length > MAX_PER_FLUSH) {
      this.once(
        'burst',
        `${urls.length} pages published at once — nothing submitted. That is a script rather than an editor, and a batch that size is what gets an IndexNow key throttled. Run \`pnpm indexnow -- --send\` after the deploy, which submits every URL on every host and prints what it is doing.`,
      )
      return
    }

    if (now - this.hourStartedAt >= HOUR_MS) {
      this.hourStartedAt = now
      this.sentThisHour = 0
      this.said.delete('hourly')
    }

    if (this.sentThisHour + urls.length > HOURLY_MAX) {
      this.once(
        'hourly',
        `${HOURLY_MAX} URLs already submitted this hour, so these ${urls.length} were not. Nothing is lost: \`pnpm indexnow -- --send\` submits the sitemap in full, and IndexNow is priced in trust rather than in requests.`,
      )
      return
    }

    this.sentThisHour += urls.length
    void this.send(urls)
  }

  /** For the tests and for a status line: what is waiting, and how much has gone. */
  get state(): { pending: number; sentThisHour: number } {
    return { pending: this.pending.size, sentThisHour: this.sentThisHour }
  }
}
