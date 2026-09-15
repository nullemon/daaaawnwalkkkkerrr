import type { CollectionConfig, Field, FieldHook, TextFieldSingleValidation } from 'payload'

/** Turn any string into a URL-safe slug. */
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const formatSlug: FieldHook = ({ data, operation, value }) => {
  if (typeof value === 'string' && value.length > 0) return slugify(value)
  if (operation === 'create' || !value) {
    const fallback = data?.title
    if (typeof fallback === 'string') return slugify(fallback)
  }
  return value
}

/**
 * URL segment for the entity. Auto-derived from the title on create, but
 * editable — once a page is indexed, its slug must be able to stay put even
 * if the title is corrected.
 */
export const slugField = (options: { validate?: TextFieldSingleValidation } = {}): Field => ({
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'URL segment. Auto-filled from the title. Changing it breaks existing links.',
  },
  hooks: { beforeValidate: [formatSlug] },
  ...(options.validate ? { validate: options.validate } : {}),
})

/**
 * How much we trust this entry. Every figure on this site comes from third-party
 * sources that contradict each other, so confidence is surfaced to readers
 * rather than hidden.
 */
export const confidenceField = (): Field => ({
  name: 'confidence',
  type: 'select',
  required: true,
  defaultValue: 'medium',
  options: [
    { label: 'High — agreed by multiple independent sources', value: 'high' },
    { label: 'Medium — single good source, or minor disagreement', value: 'medium' },
    { label: 'Low — contested, inferred, or placeholder', value: 'low' },
  ],
  admin: {
    position: 'sidebar',
    description: 'Shown to readers as a badge. Be honest — it is the whole point of this site.',
  },
})

/** Where each claim came from. Displayed publicly at the foot of the page. */
export const sourcesField = (): Field => ({
  name: 'sources',
  type: 'array',
  labels: { singular: 'Source', plural: 'Sources' },
  admin: { description: 'Cite every figure. Two independent sources before marking confidence high.' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'url', type: 'text', required: true },
    {
      name: 'retrieved',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
  ],
})

/** Per-page search metadata. Falls back to title/summary when left empty. */
export const seoGroup = (): Field => ({
  name: 'seo',
  type: 'group',
  admin: { description: 'Leave blank to derive from the title and summary.' },
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: { description: 'Under ~60 characters. Overrides the <title> tag.' },
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: 180,
      admin: { description: 'Under ~155 characters. Overrides the meta description.' },
    },
    {
      name: 'noindex',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Hide this page from search engines.' },
    },
  ],
})

/** Short plain-text lede. Doubles as the meta description and card blurb. */
export const summaryField = (): Field => ({
  name: 'summary',
  type: 'textarea',
  required: true,
  maxLength: 320,
  admin: { description: 'One or two sentences. Used on cards, in search results and as the page lede.' },
})

/** Fields every public content collection carries. */
export const commonContentFields = (): Field[] => [
  summaryField(),
  { name: 'body', type: 'richText', admin: { description: 'The main article. Original prose only — never paste from another site.' } },
  sourcesField(),
  seoGroup(),
]

/**
 * An editor is a member of the `users` collection. Reader accounts live in
 * `players` and must never be able to write content.
 *
 * This matters because Payload's default write access is "any authenticated
 * user". Once a second auth collection exists, that default silently grants
 * every signed-up reader the ability to create and edit content, so every
 * content collection has to state its write rules explicitly.
 */
export const isEditor = ({ req }: { req: { user?: { collection?: string } | null } }): boolean =>
  req.user?.collection === 'users'

/** Published content is world-readable; writing it is editors only. */
export const publicRead: CollectionConfig['access'] = {
  read: () => true,
  create: isEditor,
  update: isEditor,
  delete: isEditor,
}

/**
 * Which game this record belongs to.
 *
 * This is the single most load-bearing field in the network. Every public
 * query filters on it, so a record with the wrong game does not merely show up
 * in the wrong place — it shows up as another game's content, which is the one
 * mistake a wiki cannot be caught making.
 *
 * It is required, and deliberately has no blanket default. A hook that quietly
 * filed everything under the first game would work perfectly while there is one
 * game and then silently misfile records forever after the second one is added,
 * which is exactly the class of bug that is invisible until it is expensive.
 *
 * The one exception is a network of exactly one game, where there is nothing to
 * get wrong and asking would be noise. As soon as a second game exists the
 * default disappears and the editor has to choose.
 */
export const gameField = (): Field => ({
  name: 'game',
  type: 'relationship',
  relationTo: 'games',
  required: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'Which wiki this belongs to. Moving a record between games changes its URL.',
  },
  defaultValue: async ({ req }) => {
    const result = await req.payload.find({
      collection: 'games',
      limit: 2,
      pagination: false,
      depth: 0,
    })
    return result.docs.length === 1 ? result.docs[0].id : undefined
  },
})

/**
 * Make a collection belong to a game.
 *
 * Three changes have to happen together, and applying two of the three leaves
 * a subtly broken collection, so they are one call rather than three things to
 * remember per collection:
 *
 *   1. The `game` relationship is added.
 *   2. The slug stops being globally unique. Two games can each have a
 *      "Lockpick", and under a global unique index the second game to be
 *      seeded would simply fail to import half its records.
 *   3. A compound unique index on (game, slug) takes over, which is the
 *      constraint actually wanted: unique within a wiki, free across the
 *      network.
 *
 * Step 2 without step 3 is the dangerous one — it silently permits two records
 * with the same slug in the same game, and the detail page then renders
 * whichever the database returns first.
 */
export const scopedToGame = (collection: CollectionConfig): CollectionConfig => ({
  ...collection,
  fields: [
    ...collection.fields.map((field) =>
      'name' in field && field.name === 'slug' ? { ...field, unique: false } : field,
    ),
    gameField(),
  ],
  indexes: [...(collection.indexes ?? []), { fields: ['game', 'slug'], unique: true }],
})
