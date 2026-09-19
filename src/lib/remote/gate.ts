import type { Finding } from '../audit'

/**
 * "Only works when we have entered all details" — the owner's requirement,
 * wired to the audit rather than to a second opinion.
 *
 * `src/lib/audit.ts` is the only module on this project that decides whether
 * something is missing. `pnpm check:launch` prints those findings and the
 * admin dashboard renders them, and the reason both read one module is in
 * CLAUDE.md: two implementations of one check means that the day they disagree
 * the reassuring one wins, and the owner has no way to tell which.
 *
 * So nothing here asks a question. It filters an answer.
 *
 * ## Which findings close the gate
 *
 * `level: 'blocking'` **and** `actor: 'owner'`. Both halves are load-bearing:
 *
 *   - `blocking` because a warning is a judgement call, and a gate built on
 *     judgement calls is a gate the owner learns to resent.
 *   - `owner` because those are the details only they can supply, which is
 *     precisely what they asked to be gated on.
 *
 * Three deliberate exclusions, each of which would turn this into something
 * worse than no gate at all:
 *
 *   - **`editorial` findings do not close it.** A missing image credit is not
 *     a reason to refuse the owner access to their own site, and fixing that
 *     class of gap is the commonest thing this tool is for. Locking the tool
 *     behind the work the tool exists to do is a circle.
 *   - **`blocked` findings never close it.** Seventy-eight quests with no
 *     published segment cost is the state of the world. CLAUDE.md is explicit
 *     that a `blocked` finding is never presented as an action, and a gate is
 *     an action.
 *   - **`auditSource()` is not consulted.** It reads the repository from
 *     `process.cwd()`, which in a standalone deployment is not the repository,
 *     so it would return a clean bill of health it had not earned — its own
 *     docstring says so. A check that passes because it looked in the wrong
 *     place is the failure mode this project has a list of.
 */

export type Blocker = { area: string; detail: string }

export const remoteBlockers = (findings: readonly Finding[]): Blocker[] =>
  findings
    .filter((finding) => finding.level === 'blocking' && finding.actor === 'owner')
    .map((finding) => ({ area: finding.area, detail: finding.detail }))

/**
 * The refusal, as the CLI prints it.
 *
 * Named, every one of them. A gate that says "the site is not ready" and
 * leaves somebody to work out which of two hundred checks it meant has moved
 * the work rather than done it — the same rule the dashboard rows follow.
 */
export const gateRefusal = (blockers: readonly Blocker[]): string =>
  [
    `Remote control will not open a session while ${blockers.length} launch ${
      blockers.length === 1 ? 'check is' : 'checks are'
    } outstanding:`,
    '',
    ...blockers.map((blocker) => `  ${blocker.area.padEnd(20)} ${blocker.detail}`),
    '',
    'These are the details only you can supply. Fix them in the admin, or run',
    '`pnpm check:launch` for the same list with everything else it found.',
  ].join('\n')
