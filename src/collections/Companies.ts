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
      name: 'headquarters',
      type: 'text',
      admin: { description: 'Where the company is run from, as its own article states it.' },
    },
    {
      name: 'keyPeople',
      type: 'text',
      admin: {
        description:
          'Named executives, with their titles. People change job more often than this page is rebuilt, so it carries the date it was read and the page says so.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'employees',
          type: 'text',
          admin: { width: '50%', description: 'Headcount, as published, including the year it applies to.' },
        },
        {
          name: 'revenue',
          type: 'text',
          admin: { width: '50%', description: 'Annual revenue, as published, with its currency and year.' },
        },
      ],
    },
    {
      name: 'industry',
      type: 'text',
      admin: { description: 'What the company does, beyond games, where its article says.' },
    },
    {
      /*
        The corporate graph, and the reason a hundred of these are worth
        having rather than fifteen. Sony Interactive Entertainment's own
        article names Bungie; Embracer's names what it bought. Both directions
        are stored because both are read: a parent page lists what it owns,
        and a studio page says who owns it.

        Filled by `seed:companies` from each company's own infobox, so a link
        exists only where a source stated it.
      */
      name: 'parent',
      type: 'relationship',
      relationTo: 'companies',
      admin: { description: 'Who owns this company, where its own article names one.' },
    },
    {
      name: 'subsidiaries',
      type: 'relationship',
      relationTo: 'companies',
      hasMany: true,
      admin: { description: 'Companies this one owns, as its own article names them.' },
    },
    {
      /*
        How it started, in fields rather than in a paragraph.

        "How they started and how it is going" is the question a company page
        exists to answer, and the honest way to answer it is from things a
        source states outright: who founded it and when, what it used to be
        called, who owns it now, what it is known for. Composing a narrative
        from those is safe. Reading a company's history section and
        paraphrasing it is not, and would also be pasting somebody else's
        prose, which this project does not do anywhere.
      */
      type: 'collapsible',
      label: 'History',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'founders',
              type: 'text',
              admin: { width: '50%', description: 'As the article names them.' },
            },
            {
              name: 'formerNames',
              type: 'text',
              admin: { width: '50%', description: 'What it was called before, where a source says.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'acquired',
              type: 'text',
              admin: {
                width: '50%',
                description: 'Who bought it and when, e.g. "Tencent, 2024". The parent relationship is the link; this is the event.',
              },
            },
            {
              name: 'defunct',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'The year it closed, if it has. A studio that no longer exists is the single most useful thing this page can say about it, and the one most often missing elsewhere.',
              },
            },
          ],
        },
        {
          name: 'franchises',
          type: 'text',
          label: 'Known for',
          admin: {
            description: 'The series a source names as theirs, comma separated.',
          },
        },
      ],
    },
    {
      /*
        Everything they have made, not only what this network covers.

        A studio page that lists the one game we happen to have a wiki for is
        a worse page than the studio's own site, and the reason to have this
        host at all is that a body of work is the context a single game does
        not carry. These are stored rather than related because they are not
        records on this network and are not going to become records: the owner
        was explicit that a title here is information on the company's page,
        not a new wiki.

        Price is what a storefront says today in US dollars, which is a fact
        with a date on it rather than a property of the game — hence
        `catalogueNote`, which says when the catalogue was read.
      */
      name: 'titles',
      type: 'array',
      label: 'Catalogue',
      labels: { singular: 'Title', plural: 'Titles' },
      admin: {
        description:
          'Everything the company is credited on. Filled by `pnpm fetch:company-games` and `pnpm seed:company-games`; anything typed here by hand survives a re-run.',
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'title', type: 'text', required: true, admin: { width: '55%' } },
            { name: 'year', type: 'text', admin: { width: '20%' } },
            {
              name: 'role',
              type: 'select',
              defaultValue: 'developer',
              options: [
                { label: 'Developed', value: 'developer' },
                { label: 'Published', value: 'publisher' },
                { label: 'Both', value: 'both' },
              ],
              admin: { width: '25%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'priceText',
              type: 'text',
              label: 'Price',
              admin: { width: '25%', description: 'As the store shows it, in USD.' },
            },
            { name: 'isFree', type: 'checkbox', label: 'Free', admin: { width: '15%' } },
            {
              name: 'metacritic',
              type: 'number',
              admin: { width: '20%' },
            },
            {
              name: 'reviews',
              type: 'text',
              label: 'Store reviews',
              admin: { width: '40%', description: 'e.g. "Very Positive (12,481)".' },
            },
          ],
        },
        { name: 'genre', type: 'text' },
        { name: 'platforms', type: 'text', admin: { description: 'Comma separated, as the source lists them.' } },
        {
          type: 'row',
          fields: [
            { name: 'storeUrl', type: 'text', label: 'Store page', admin: { width: '50%' } },
            {
              name: 'coveredBy',
              type: 'relationship',
              relationTo: 'games',
              label: 'Wiki on this network',
              admin: {
                width: '50%',
                description:
                  'Set where this title is one of ours, so the row links into the wiki instead of out to a shop.',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'catalogueNote',
      type: 'text',
      admin: {
        description:
          'Where the catalogue came from and when it was read. A price is true on a date, and a page that shows one without saying when is claiming more than it knows.',
      },
    },
    {
      name: 'basis',
      type: 'select',
      defaultValue: 'related-company',
      options: [
        { label: 'Ranked by revenue', value: 'revenue-ranking' },
        { label: 'Makes a game covered here', value: 'network-game' },
        { label: 'In a gaming-company category', value: 'gaming-category' },
        { label: 'Named by another company’s article', value: 'related-company' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Why this company is on the network. Shown on the page, because how a name was chosen is part of what a reader is owed.',
      },
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
