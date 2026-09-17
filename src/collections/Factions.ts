import type { CollectionConfig } from 'payload'
import { slugField, confidenceField, commonContentFields, publicRead } from '../fields/shared'

/**
 * The organisations a game's people, creatures and gear belong to.
 *
 * Every harvested wiki states these in its infoboxes — `affiliation`,
 * `allegiance`, `faction` — and until this collection existed there was
 * nowhere to put them. A previous pass deliberately refused to match those
 * values against `regions`, and it was right to: "Federal Bureau of Control"
 * is itself filed as a region on the Control wiki, so matching would have
 * written ninety characters into a *place* that is an organisation. The fix
 * was never a looser match, it was a collection of the right kind.
 *
 * ## There is no `members` field, and there must not be
 *
 * The edge lives on the member — `faction` on characters, enemies and items —
 * and this page reads it backwards with a query. A list copied onto the
 * faction is a second copy of the same fact, and it drifts the first time a
 * member is corrected, moved to another game or deleted: nothing errors, the
 * list simply keeps naming a record that no longer says it belongs here. Same
 * reasoning as the actor→character edge living on the person.
 */
export const Factions: CollectionConfig = {
  slug: 'factions',
  admin: {
    group: 'World',
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'confidence', 'updatedAt'],
    description:
      'Armies, governments, corporations, cults and criminal outfits. Members are listed on the member, not here.',
  },
  access: publicRead,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional. An emblem or piece of art for this record. Until one is set, the site falls back to its own icon, so a missing image never leaves a hole.',
      },
    },
    {
      /*
        Deliberately not required and deliberately without a default.

        Most of these records exist because twenty infoboxes named the same
        organisation, which is evidence that it exists and no evidence at all
        of what kind of thing it is. A default of "other" would read as an
        answer; an empty field reads as the gap it is. Set it only where a
        source actually says — the seeder fills it from the organisation's own
        wiki page and from nothing else.
      */
      name: 'kind',
      type: 'select',
      options: [
        { label: 'Military', value: 'military' },
        { label: 'Government', value: 'government' },
        { label: 'Corporation', value: 'corporation' },
        { label: 'Cult or religious order', value: 'cult' },
        { label: 'Criminal', value: 'criminal' },
        { label: 'Other', value: 'other' },
      ],
      admin: {
        description:
          'Only where a source supports it. Leave empty rather than inferring a kind from the name.',
      },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
