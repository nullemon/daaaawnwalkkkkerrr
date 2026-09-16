import type { GlobalConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * Every reader-visible string that is not a record and not page copy: form
 * labels, empty states, table headers, the run tools' running commentary, and
 * the enum-to-English maps that turn `late-run` into "Late run".
 *
 * ## Why this is one keyed table and not four hundred named fields
 *
 * There are roughly three hundred of these. A global with three hundred named
 * fields is three hundred columns, an unusable edit screen, and a schema
 * migration every time somebody adds a button. So this is an override table:
 * each row is a key and the text to use instead of the built-in.
 *
 * The defaults live in `src/lib/ui-registry.ts` next to nothing else, which
 * makes that file the single list of every string the interface can say. A
 * call site asks for a key and gets the override if there is one, the registry
 * default if there is not, and — if the key is unknown to both — the key
 * itself, visibly, rather than an empty span. `pnpm seed:copy` writes the
 * registry into this table so an editor scrolls a list of real sentences.
 *
 * A row whose key matches nothing in the registry is ignored and flagged by
 * `pnpm check:launch`. That is the failure mode worth guarding: a renamed key
 * silently orphaning an edit somebody made, which looks exactly like the edit
 * never saving.
 *
 * ## Labels are separate because they are not sentences
 *
 * The second tab holds the enum maps. They were declared in thirteen files and
 * had already drifted: achievement rarity labels exist in three places, and
 * the region danger enum is written `late` in the index and `late-run` in the
 * detail page — one of those has been producing an unlabelled badge for as
 * long as both have existed.
 */

const overrides = (
  name: string,
  label: string,
  description: string,
): import('payload').Field => ({
  name,
  type: 'array',
  label,
  labels: { singular: 'Override', plural: 'Overrides' },
  admin: { description, initCollapsed: false },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
          admin: {
            width: '38%',
            description: 'Must match a key in the registry. An unknown key does nothing.',
          },
        },
        { name: 'text', type: 'text', admin: { width: '62%' } },
      ],
    },
  ],
})

export const InterfaceStrings: GlobalConfig = {
  slug: 'ui-strings',
  label: 'Interface text',
  admin: {
    group: 'Admin',
    description:
      'Buttons, empty states, form hints and badge labels. Everything here has a working default in the code; a row only overrides one.',
  },
  access: { read: () => true, update: isEditor },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Interface text',
          description:
            'Keyed by where it appears — search.*, form.*, table.*, run.*, comments.*, account.*.',
          fields: [
            overrides(
              'strings',
              'Overrides',
              'One row per string you want to change. Leave the table empty and the interface reads exactly as it does today.',
            ),
          ],
        },
        {
          label: 'Labels',
          description:
            'The words shown for a stored value: rarities, phases, danger levels, roles, confidence.',
          fields: [
            overrides(
              'labels',
              'Label overrides',
              'Keyed as <group>.<stored value>, e.g. rarity.legendary or danger.late-run.',
            ),
          ],
        },
      ],
    },
  ],
}
