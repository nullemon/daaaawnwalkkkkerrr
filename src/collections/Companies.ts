import type { CollectionConfig } from 'payload'
import { commonContentFields, confidenceField, publicRead, slugField } from '../fields/shared'

/**
 * The studios and publishers behind the games this network covers.
 *
 * Network-wide rather than game-scoped, and that is the whole point of it:
 * Capcom made Onimusha, Konami published Silent Hill, and a studio that
 * appears on three wikis should be one page with its full body of work rather
 * than three thin copies that disagree with each other the first time one is
 * corrected. The same reasoning as `authors`.
 *
 * It also gives a home to records that had nowhere sensible to go. The entity
 * harvester had filed thirteen studios as *Regions* - Bloober Team and Konami
 * as places in Silent Hill: Townfall, The Coalition as a place in Gears of War
 * - each with a real source URL and a composed summary reading "<name>, a
 * location in <game>". They are companies; they are not places. Rather than
 * delete sourced research, the migration moves them here and keeps the
 * citation that came with them.
 *
 * Served from its own host, `companies.<network domain>`, by the same rewrite
 * every wiki uses: `proxy.ts` maps a subdomain label onto the matching first
 * path segment, so `companies.example.com/bloober-team` is
 * `/companies/bloober-team` internally and the reader never sees the prefix.
 */
export const Companies: CollectionConfig = {
  slug: 'companies',
  admin: {
    group: 'Network',
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'country', 'founded', 'updatedAt'],
    listSearchableFields: ['name', 'summary', 'country'],
    description:
      'Developers and publishers, shared across every wiki. One page per company, listing everything of theirs the network covers.',
  },
  access: publicRead,
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'The company’s name as it writes it.' } },
    slugField(),
    {
      name: 'role',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['developer'],
      options: [
        { label: 'Developer', value: 'developer' },
        { label: 'Publisher', value: 'publisher' },
      ],
      admin: {
        description:
          'Both is normal — Capcom develops and publishes its own games. Drives how the company is described and which lists it appears in.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'founded',
          type: 'text',
          admin: {
            width: '50%',
            description: 'Year, as a source states it. Leave empty rather than guessing.',
          },
        },
        {
          name: 'country',
          type: 'text',
          admin: { width: '50%', description: 'Where the company is based, e.g. "Japan".' },
        },
      ],
    },
    {
      name: 'website',
      type: 'text',
      admin: { description: 'The company’s own site. Linked with rel="nofollow" like every outbound link here.' },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional. A logo is a trademark used for identification; credit it like any other art.',
      },
    },
    {
      /*
        Which of this network's games are theirs. Set by `seed:companies` from
        each game's own `developer` and `publisher` fields, so the two cannot
        drift: the game record stays the source of truth for who made it, and
        this is the reverse index that makes a company page worth opening.
      */
      name: 'games',
      type: 'relationship',
      relationTo: 'games',
      hasMany: true,
      admin: {
        description:
          'Games of theirs that this network covers. Derived from each game’s developer and publisher fields.',
      },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
