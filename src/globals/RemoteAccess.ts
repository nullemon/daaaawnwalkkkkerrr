import type { GlobalConfig } from 'payload'
import { isEditor } from '../fields/shared'
import { DEFAULT_IDLE_MS, DEFAULT_SESSION_MS, MAX_SESSION_MS, MINUTE } from '../lib/remote/policy'

/**
 * The switch, the clocks and the allow-list for remote control.
 *
 * ## Why this is a global of its own and not a tab on Site settings
 *
 * Site settings is copy, SEO and legal — things an editor changes while
 * writing. This is the one screen on the network that decides whether a
 * terminal somewhere can write to a live site, and burying it as a tab beside
 * a meta description is how it gets ticked by somebody who was looking for
 * something else.
 *
 * ## It does not turn anything on by itself
 *
 * `enabled` is half of a two-key switch. The other half is
 * `REMOTE_CONTROL_SECRET` in the deployment's environment, and without it
 * every `/api/remote/*` route answers 404 — not 403, because a 403 tells an
 * attacker the feature exists and is one setting away. Ticking this box on a
 * deployment that has no secret changes nothing, which is the correct
 * behaviour and is stated on the field.
 *
 * `read` is editors only, unlike every other global here. The others are read
 * by public pages; this one is read by four API routes and one admin screen,
 * and whether remote control is switched on is not a reader's business.
 *
 * ## What is deliberately not on this screen
 *
 * **What a session may do.** That is chosen per session, on the approval form
 * at `/admin/remote`, by ticking boxes — create, update, publish, delete. A
 * default here would be a grant nobody looked at on the day it was used, which
 * is the opposite of what the owner asked for: a session scoped to the job in
 * hand. The list below is the other axis — which *collections* are reachable
 * at all — and it is a property of the deployment rather than of one session.
 */
export const RemoteAccess: GlobalConfig = {
  slug: 'remote-access',
  label: 'Remote control',
  admin: {
    group: 'Remote control',
    description:
      'Whether a terminal may write to this site, and within what limits. Off unless both this box and REMOTE_CONTROL_SECRET are set. The screen for approving a session is Remote control in the sidebar; docs/REMOTE.md is the design.',
  },
  access: { read: isEditor, update: isEditor },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Remote sessions are enabled',
      admin: {
        description:
          'Off by default. With this off, a terminal asking for a session is refused with a sentence saying so. With it on and REMOTE_CONTROL_SECRET unset on the deployment, the routes still answer 404 — both keys are needed.',
      },
    },
    {
      name: 'sessionMinutes',
      type: 'number',
      min: 1,
      max: MAX_SESSION_MS / MINUTE,
      admin: {
        description: `How long an approved session lives, whatever it is doing. Blank means ${DEFAULT_SESSION_MS / MINUTE} minutes; the ceiling is ${MAX_SESSION_MS / MINUTE} and cannot be raised from here. Blank is the default, not zero.`,
      },
    },
    {
      name: 'idleMinutes',
      type: 'number',
      min: 1,
      max: MAX_SESSION_MS / MINUTE,
      admin: {
        description: `How long a session may sit doing nothing before it closes itself. Blank means ${DEFAULT_IDLE_MS / MINUTE} minutes.`,
      },
    },
    {
      name: 'collections',
      type: 'text',
      hasMany: true,
      label: 'Collections a session may write',
      admin: {
        description:
          'Collection slugs, one per entry — guides, quests, characters. Leave empty for "everything a session is not forbidden": accounts, devices, sessions and the remote log are refused whatever is typed here, and that is not a setting. Same shape as an editor’s Games list, where empty means unrestricted.',
      },
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Note to yourself',
      admin: {
        description:
          'Why remote control is on, or why you turned it off. Nothing reads this; it is here because the next person to open this screen will want to know.',
      },
    },
  ],
}
