import { remoteSecret } from './policy'

/**
 * What happens to Payload's own API keys once this deployment has remote
 * control.
 *
 * ## The problem, stated plainly
 *
 * `REMOTE_API_KEY` predates the session flow. It is a long-lived credential
 * issued per editor in the admin, it carries that editor's full permissions,
 * it never expires, nothing approves it, and **its writes are not in
 * `remote-log`**. Remote sessions were then built with the opposite
 * properties: approved by a human against a code, scoped to a capability set
 * the owner ticks per session, expiring, revocable in one click, and logged
 * with what they were permitted to do beside what they did.
 *
 * Two credentials that both grant write access, one of them unscoped and
 * unlogged, does not make a site safer twice over. It makes the scoped one
 * decorative: "create pages, no deletions" means nothing while a second key
 * in the same `.env` can delete anything, and the trail that is supposed to
 * answer "what else did that session touch" has a hole in it shaped exactly
 * like the credential somebody reaches for when the scoped one refuses.
 *
 * ## Refuse, not warn
 *
 * The choice was between refusing the key and logging loudly that it was used.
 * This refuses, for two reasons.
 *
 * A warning is read by whoever is watching the logs, and the person using an
 * API key against a live site from a script is by definition not watching. A
 * deployment log line saying "an unscoped credential just deleted forty pages"
 * is an autopsy, not a control — and this project already has a rule about
 * that shape: `pnpm email:test` exits non-zero on the `console` provider
 * because printed is not delivered. Refused is not warned.
 *
 * And a fallback that still works is the thing that gets used. The moment the
 * scoped session refuses an operation — which is the feature working — the
 * next thing to hand is the key that does not refuse. A capability set with a
 * documented way around it is a suggestion.
 *
 * It is loud *as well*: the refusal prints once per process per collection, so
 * whoever is running the script sees the reason rather than an unexplained
 * 403.
 *
 * ## When it applies, and what still works
 *
 * Only on a deployment that has opted into remote control — that is,
 * `REMOTE_CONTROL_SECRET` set. A deployment that never turns remote control on
 * is unaffected and its API keys work exactly as they did; nothing about this
 * change reaches a site that did not ask for the feature.
 *
 * The switch read is the *environment* one rather than the admin checkbox, and
 * deliberately: an access-control function runs on every request and cannot
 * afford a database read, and more to the point a key that stops working when
 * somebody unticks a box would be a credential whose validity depends on a
 * setting nobody would think to look at. The secret being present is the
 * deployment's own statement that sessions are how this site is written to.
 *
 * Public reads are untouched, because they do not go through here —
 * `publicRead` answers `read: () => true`. What an API key loses is the
 * editor's own access: writing content, and reading the collections that are
 * editors-only. That includes `users/me`, which is what `pnpm remote whoami`
 * asks, so the CLI discovers this immediately rather than on its first write.
 *
 * No Payload import, so it is a unit test away — the split this project
 * already makes three times (`appearance`/`appearance-settings`,
 * `email`/`email-adapter`, `verdict`/`ratings`).
 */

/** The shape access control actually hands us. */
export type AuthedUser = { collection?: string; _strategy?: string | null } | null | undefined

/**
 * Was this request authenticated with an API key rather than a login?
 *
 * Payload stamps `_strategy` on the user it resolves. The API-key strategy
 * writes the literal `api-key`; the suffix test is there because the strategy
 * is registered per collection and a future version naming it
 * `users-api-key` would otherwise quietly stop matching — and a check that
 * quietly stops matching is a refusal that quietly stops refusing.
 */
export const isApiKeyUser = (user: AuthedUser): boolean => {
  const strategy = typeof user?._strategy === 'string' ? user._strategy : ''
  return strategy === 'api-key' || strategy.endsWith('-api-key')
}

/**
 * Does this deployment refuse API keys?
 *
 * True only where both halves are true: the request is on an API key, and this
 * deployment has remote control configured.
 */
export const apiKeyRefused = (
  user: AuthedUser,
  env: Record<string, string | undefined> = process.env,
): boolean => isApiKeyUser(user) && remoteSecret(env) !== null

export const API_KEY_REFUSAL = [
  'REMOTE_API_KEY was refused: this deployment has remote control, so an API key',
  'no longer carries editor access. An API key is unscoped, does not expire, and',
  'its writes are not in the Remote log — which would make the per-session',
  'capabilities pointless, since anything a session was refused could be done',
  'with the key instead.',
  '',
  'Use a session:  pnpm remote connect   then approve it at /admin/remote,',
  'ticking what that session may do. docs/REMOTE.md is the whole flow.',
  '',
  'If you genuinely want API keys back, unset REMOTE_CONTROL_SECRET on the',
  'deployment — which turns remote control off entirely. There is deliberately',
  'no setting that leaves both on.',
].join('\n')

/**
 * Say so on the server, once per process per collection.
 *
 * Loud, because a 403 with nothing behind it is a support thread; once,
 * because a script that retries would otherwise fill a log with the same
 * paragraph and bury whatever else was wrong. The refusal is what protects the
 * site — this is only what explains it.
 */
const announced = new Set<string>()

export const announceApiKeyRefusal = (
  where: string,
  log: (message: string) => void = console.error,
): void => {
  if (announced.has(where)) return
  announced.add(where)
  log(`\n[remote] ${where}: ${API_KEY_REFUSAL}\n`)
}

/** Test seam. Nothing in the app calls this. */
export const resetApiKeyAnnouncements = (): void => announced.clear()
