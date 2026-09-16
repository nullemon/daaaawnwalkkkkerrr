import type { Field } from 'payload'

/**
 * The factsheet a reader wants before anything else: what the game is, what it
 * costs, who made it, and how you play it.
 *
 * Split into two halves on purpose, because they have different standards of
 * proof and the admin should say so.
 *
 * **Derived** fields are filled by `pnpm seed:game-profile` from the store
 * listing and the game's Wikipedia infobox — price, editions, DLC, whether the
 * store declares in-app purchases, the multiplayer and co-op categories,
 * engine, director, composer. Editing one by hand is fine; the next run will
 * overwrite it, which is the right way round for a figure a publisher can
 * change.
 *
 * **Editorial** fields have no source anywhere and are left empty: a budget, a
 * marketing spend, a headcount. Almost no publisher discloses any of them, and
 * the two or three that do say it in an interview rather than in a feed. They
 * exist as fields so somebody can fill one in with a citation, and they stay
 * blank until somebody does — a profile that says "Budget: unknown" is honest,
 * and one that says "Budget: $200 million" because a forum did is the exact
 * failure this project refuses everywhere else.
 */
export const gameProfileGroup = (): Field => ({
  name: 'profile',
  type: 'group',
  label: 'Game profile',
  admin: {
    description:
      'The factsheet on the wiki home. Most of it is filled from the store listing and Wikipedia by `pnpm seed:game-profile`; the commercial figures are blank because nobody publishes them.',
  },
  fields: [
    // --- what it costs ----------------------------------------------------
    {
      type: 'row',
      fields: [
        {
          name: 'priceText',
          type: 'text',
          label: 'Price',
          admin: { width: '34%', description: 'As the store shows it, e.g. "$69.99". From the listing.' },
        },
        {
          name: 'isFree',
          type: 'checkbox',
          label: 'Free to play',
          admin: { width: '33%' },
        },
        {
          name: 'microtransactions',
          type: 'checkbox',
          label: 'In-app purchases',
          admin: {
            width: '33%',
            description: 'Ticked when the store declares them. Absence is not proof there are none.',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'dlcCount',
          type: 'number',
          label: 'DLC / add-ons',
          admin: { width: '50%', description: 'How many the store lists.' },
        },
        {
          name: 'editionCount',
          type: 'number',
          label: 'Editions',
          admin: { width: '50%' },
        },
      ],
    },

    // --- how you play it --------------------------------------------------
    {
      name: 'modes',
      type: 'select',
      hasMany: true,
      label: 'Play modes',
      options: [
        { label: 'Single-player', value: 'single-player' },
        { label: 'Multiplayer', value: 'multiplayer' },
        { label: 'Co-op', value: 'co-op' },
        { label: 'Online co-op', value: 'online-co-op' },
        { label: 'PvP', value: 'pvp' },
        { label: 'Online PvP', value: 'online-pvp' },
        { label: 'Cross-platform', value: 'cross-platform' },
      ],
      admin: { description: 'Read from the store listing’s own categories.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'maxPlayers',
          type: 'text',
          label: 'Players',
          admin: { width: '50%', description: 'e.g. "1–4". Only where a source states it.' },
        },
        {
          name: 'onlineRequired',
          type: 'select',
          label: 'Internet required',
          options: [
            { label: 'Not stated', value: 'unknown' },
            { label: 'No — plays offline', value: 'no' },
            { label: 'For multiplayer only', value: 'multiplayer' },
            { label: 'Yes — always online', value: 'yes' },
          ],
          defaultValue: 'unknown',
          admin: { width: '50%' },
        },
      ],
    },

    // --- who made it ------------------------------------------------------
    {
      type: 'row',
      fields: [
        { name: 'engine', type: 'text', admin: { width: '50%', description: 'From Wikipedia’s infobox.' } },
        { name: 'series', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'director', type: 'text', admin: { width: '50%' } },
        { name: 'composer', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'designer', type: 'text', admin: { width: '50%' } },
        { name: 'artist', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'writer', type: 'text', admin: { width: '50%' } },
        {
          name: 'genre',
          type: 'text',
          admin: { width: '50%', description: 'As the infobox states it, e.g. "Action role-playing".' },
        },
      ],
    },
    {
      /*
        Where the store and the encyclopedia disagree about the release date.

        Three of the eight do, by one day each — a storefront dates a release
        in its own region and an encyclopedia usually gives the earliest or the
        publisher's stated day. Picking one and printing it would look tidier
        and would be a coin flip. The rule here is the same one the Slits/Silts
        spelling follows: record the conflict in the copy.
      */
      name: 'releaseNote',
      type: 'text',
      label: 'Release date note',
      admin: {
        description:
          'Filled automatically when the store listing and Wikipedia give different dates. Shown under the release row.',
      },
    },
    {
      name: 'metacritic',
      type: 'number',
      label: 'Metacritic score',
      admin: { description: 'Only where the store reports one.' },
    },

    // --- the commercial half nobody publishes -----------------------------
    {
      type: 'row',
      fields: [
        {
          name: 'budget',
          type: 'text',
          admin: {
            width: '34%',
            description: 'Development budget, with a source. Blank unless one exists — almost no publisher discloses this.',
          },
        },
        {
          name: 'marketingSpend',
          type: 'text',
          admin: { width: '33%', description: 'Marketing spend, with a source. Almost never published.' },
        },
        {
          name: 'teamSize',
          type: 'text',
          admin: { width: '33%', description: 'How many people worked on it, with a source.' },
        },
      ],
    },
    {
      name: 'commercialNote',
      type: 'textarea',
      label: 'Note on the commercial figures',
      admin: {
        description:
          'Shown under the budget row when any of those three is filled in — say where the figure came from.',
      },
    },

    // --- the picture ------------------------------------------------------
    {
      name: 'poster',
      type: 'upload',
      relationTo: 'media',
      label: 'Poster / box art',
      admin: {
        description:
          'Portrait key art for the profile panel. Falls back to the wiki’s hero image when empty.',
      },
    },
  ],
})
