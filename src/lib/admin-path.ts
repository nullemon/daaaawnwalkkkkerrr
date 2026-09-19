/**
 * Where the admin lives, said once.
 *
 * `/admin1621`, not `/admin`. Moving it is not a security control and nothing
 * here pretends it is — every route under it is access-checked, and a path is
 * not a password. What it does buy is real and worth having on a site with no
 * staff: the default path is what every commodity scanner and credential-
 * stuffing script tries first, on every domain it can reach, forever. Off
 * `/admin` that traffic never reaches a login form at all, which keeps the
 * logs readable and the rate limits for things that matter.
 *
 * ## Changing it is two edits, and they have to match
 *
 * This constant **and** the route folder name under `src/app/(payload)/`.
 * Payload mounts its admin at `routes.admin` and Next serves whatever folder
 * is on disk; if the two disagree the admin answers 404 with nothing anywhere
 * explaining why. `src/proxy.test.ts` pins the pair so the mismatch fails on
 * the commit that makes it rather than on the day somebody tries to sign in.
 *
 * Not an environment variable, and the folder is the reason: a route folder
 * name is fixed at build time, so `ADMIN_PATH=/x` in `.env` would move
 * Payload's router and leave the pages where they were. One value that cannot
 * be set two ways is better than two that can disagree.
 *
 * ## Everything that has to follow it
 *
 * - `PASS_THROUGH` in `src/proxy.ts`, or the admin is rewritten onto a game
 *   prefix on every wiki host and redirected to a subdomain on the apex.
 * - `Disallow:` in `src/app/robots.ts`. A moved admin that is still named in
 *   robots.txt has published the new path to everyone who reads it.
 * - The reset link in `src/collections/Users.ts`.
 * - Every `href` in `src/components/admin/` and the findings in
 *   `src/lib/audit.ts`, which is what `adminUrl` is for.
 */
export const ADMIN_PATH = '/admin1621'

/** An absolute-path URL inside the admin. Always built, never typed. */
export const adminUrl = (path = ''): string =>
  `${ADMIN_PATH}${path.startsWith('/') || path === '' ? path : `/${path}`}`

/**
 * The first path segment, which is what the router matches on.
 *
 * `proxy.ts` exempts a request by its first segment, so it needs `admin1621`
 * rather than `/admin1621`, and deriving it here means the two cannot drift.
 */
export const ADMIN_SEGMENT = ADMIN_PATH.replace(/^\//, '')
