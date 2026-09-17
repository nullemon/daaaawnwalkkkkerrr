import type { CollectionConfig } from 'payload'
import { commonContentFields, confidenceField, publicRead, slugField } from '../fields/shared'

/**
 * The people behind the games: directors, designers, composers, the actors who
 * play the characters.
 *
 * Network-wide, like `companies` and `authors`, and for the same reason with
 * more force. Olivier Derivière scored two of the eight games in this network;
 * Matthew Porretta is in three Remedy titles. A person filed under a game is a
 * thin page per game that disagrees the first time one is corrected, and it
 * throws away the only thing that makes these pages worth having — that a
 * composer's body of work is the answer to "why does this sound like that".
 *
 * Served from `people.<network domain>` by the same rewrite every wiki uses.
 *
 * ## Where the names come from, which is also what limits them
 *
 * Three sources, all of them already in the repository:
 *
 *   - each game's Wikipedia infobox (director, designer, artist, writer,
 *     composer) — 52 names across the eight games
 *   - the `actor`, `voiced by` and `portrayed by` facts the community-wiki
 *     harvester already reads off character infoboxes
 *   - the named executives on company records
 *
 * A name is here because a sourced page named it in one of those roles. Nobody
 * is here because it seemed like they should be, and `basis` says which of the
 * three routes brought each one — the same disclosure the companies host makes,
 * for the same reason: how a name was chosen is part of what a reader is owed.
 *
 * ## Biography is the field most likely to go wrong
 *
 * A game's release date is a fact about a product. A person's date of birth is
 * a fact about a living individual, and the cost of getting one wrong is not
 * the same. So: every field is what a cited source states, `born` is text
 * rather than a date because sources give "c. 1970" and a date picker cannot,
 * and nothing here is inferred from a photograph, a name or a language.
 */
export const People: CollectionConfig = {
  slug: 'people',
  admin: {
    group: 'Network',
    useAsTitle: 'name',
    defaultColumns: ['name', 'roles', 'knownFor', 'basis', 'updatedAt'],
    listSearchableFields: ['name', 'summary', 'knownFor'],
    description:
      'Directors, designers, composers and actors, shared across every wiki. One page per person, listing everything of theirs the network covers.',
  },
  access: publicRead,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'As the person writes it, with the diacritics they use.' },
    },
    slugField(),
    {
      /*
        Surname first, for sorting only.

        A directory ordered on `name` files Bartłomiej Gaweł under B, which is
        not where anybody looks. It is a separate stored field rather than a
        rule applied at render time because "last word of the name" is wrong
        for a great many people — Japanese names in their own order, Spanish
        double surnames, mononyms — and a wrong guess about somebody's name is
        exactly the kind of small disrespect that is worth one column to avoid.
      */
      name: 'sortName',
      type: 'text',
      admin: {
        description:
          'How the name files in a list, e.g. "Gaweł, Bartłomiej". Left blank, the directory sorts on the full name as written.',
      },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['developer'],
      options: [
        { label: 'Director', value: 'director' },
        { label: 'Designer', value: 'designer' },
        { label: 'Artist', value: 'artist' },
        { label: 'Writer', value: 'writer' },
        { label: 'Composer', value: 'composer' },
        { label: 'Producer', value: 'producer' },
        { label: 'Programmer', value: 'programmer' },
        { label: 'Developer (role not stated)', value: 'developer' },
        { label: 'Actor', value: 'actor' },
        { label: 'Voice actor', value: 'voice-actor' },
        { label: 'Motion capture', value: 'motion-capture' },
        { label: 'Executive', value: 'executive' },
      ],
      admin: {
        description:
          'What a source says they did on something this network covers — not their whole career. Several is normal.',
      },
    },
    {
      name: 'knownFor',
      type: 'text',
      admin: {
        description:
          'The one line under the name in a list, e.g. "Composer, A Plague Tale". Kept short on purpose.',
      },
    },

    // --- Who they are, as a source states it ------------------------------
    {
      type: 'row',
      fields: [
        {
          name: 'born',
          type: 'text',
          admin: {
            width: '50%',
            description:
              'As the source writes it — "12 March 1978", "c. 1970", "1980s". Text, not a date: a date picker cannot hold a source that is not sure, and turning "c. 1970" into 1 January 1970 invents precision about a living person.',
          },
        },
        {
          name: 'birthPlace',
          type: 'text',
          admin: { width: '50%', description: 'Only where a source states it.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'nationality',
          type: 'text',
          admin: {
            width: '50%',
            description:
              'Only where a source states it. Never inferred from a name, a language or a studio’s address.',
          },
        },
        {
          name: 'activeSince',
          type: 'text',
          admin: { width: '50%', description: 'e.g. "2004" or "2004–present".' },
        },
      ],
    },
    {
      name: 'alsoKnownAs',
      type: 'text',
      admin: { description: 'Stage name, romanisation, or the other spelling a source uses.' },
    },
    {
      name: 'website',
      type: 'text',
      admin: {
        description: 'Their own site. Linked with rel="nofollow", like every outbound link here.',
      },
    },

    // --- What they have worked on -----------------------------------------
    {
      /*
        Credits beyond this network.

        The reason a person page is worth opening at all: "what else have they
        done". A relationship cannot hold it, because almost none of these
        works are games this network covers — they are other games, films and
        albums — so it is an array of what a source lists, with the year and
        the role it states.
      */
      name: 'works',
      type: 'array',
      label: 'Credits',
      labels: { singular: 'Credit', plural: 'Credits' },
      admin: {
        description:
          'What a source lists them on, inside this network or outside it. Year and role exactly as stated; leave either blank rather than guessing.',
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'title', type: 'text', required: true, admin: { width: '55%' } },
            { name: 'year', type: 'text', admin: { width: '20%' } },
            {
              name: 'kind',
              type: 'select',
              defaultValue: 'game',
              options: [
                { label: 'Game', value: 'game' },
                { label: 'Film', value: 'film' },
                { label: 'Television', value: 'tv' },
                { label: 'Album', value: 'album' },
                { label: 'Other', value: 'other' },
              ],
              admin: { width: '25%' },
            },
          ],
        },
        { name: 'role', type: 'text', admin: { description: 'e.g. "Composer", "Voice of Jesse Faden".' } },
      ],
    },
    {
      name: 'games',
      type: 'relationship',
      relationTo: 'games',
      hasMany: true,
      admin: {
        description:
          'Games of this network they worked on. Derived by `pnpm seed:people` from each game’s own infobox fields, so the game record stays the source of truth and this is the reverse index.',
      },
    },
    {
      name: 'characters',
      type: 'relationship',
      relationTo: 'characters',
      hasMany: true,
      admin: {
        description:
          'Characters they play, where a character’s own infobox names them. This is what makes an actor’s page a route back into the wikis.',
      },
    },
    {
      name: 'companies',
      type: 'relationship',
      relationTo: 'companies',
      hasMany: true,
      admin: { description: 'Companies whose own article names them.' },
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Only a freely licensed photograph, credited. A press shot of somebody’s face is not the same kind of image as box art and is not used here on the same argument.',
      },
    },
    {
      name: 'basis',
      type: 'select',
      defaultValue: 'game-credit',
      options: [
        { label: 'Credited on a game we cover', value: 'game-credit' },
        { label: 'Named in a character’s infobox', value: 'character-credit' },
        { label: 'Named by a company’s article', value: 'company-officer' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Why this person is on the network. Shown on the page — how a name was chosen is part of what a reader is owed, and it is also what stops this becoming a directory of everyone.',
      },
    },
    confidenceField(),
    ...commonContentFields(),
  ],
}
