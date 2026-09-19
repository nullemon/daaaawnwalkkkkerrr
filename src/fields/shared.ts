import type {
  CollectionConfig,
  Field,
  FieldHook,
  GeneratePreviewURL,
  TextFieldSingleValidation,
  Where,
} from 'payload'
import { SECTION_PATH, type GameScopedCollection } from '../lib/tenancy'
import { announceApiKeyRefusal, apiKeyRefused } from '../lib/remote/api-key'

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
 * How much we trust this entry.
 *
 * Every figure on this site comes from third-party sources that contradict
 * each other, so each record says how far we stand behind it.
 *
 * **It is an editorial field, not a reader-facing one.** It was printed as a
 * badge on every record page until the owner decided a reader has no use for
 * one: a badge reading "Low" beside a fact is a hedge, and the reader's real
 * question - where did this come from - is answered by the citations
 * underneath, which are shown to everybody. `Confidence` in
 * `src/components/Badges.tsx` renders it only for a signed-in editor, so it is
 * a working queue for the people who can act on it and nothing at all for
 * anyone else.
 *
 * What it still governs is unchanged, and that is the point: a `low` record is
 * one somebody has to go and source, and hiding the badge must not become
 * hiding the problem.
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
    description:
      'Editorial only — readers do not see this; signed-in editors do. Be honest: a Low here is a job, and nothing else on the site records that it is one.',
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
    {
      name: 'url',
      type: 'text',
      required: true,
      /*
        Relative is allowed and is the right answer for a page citing its own
        site — `/` on a wiki's own host resolves wherever the site is deployed.
        What is refused is an absolute loopback URL. See `LOOPBACK` above.
      */
      validate: (value: unknown) =>
        typeof value === 'string' && LOOPBACK.test(value.trim())
          ? 'A source URL cannot point at localhost — it would be published as a dead link. Use a relative path for a page on this site, or the real public URL.'
          : true,
    },
    {
      name: 'retrieved',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
  ],
})

/**
 * A citation that only works on the machine it was written on.
 *
 * `seed:cite` builds its URL from `gameUrl`, which reads
 * `NEXT_PUBLIC_SITE_URL` — so a pass run in development writes
 * `http://dawnwalker.localhost:3000/` into the database, and it stays there
 * through the deploy. One guide was published with exactly that as its only
 * source. It is the trap `[game]/layout.tsx` names about the footer: storing
 * an absolute local URL survives the deploy that stops it being true.
 *
 * Nothing about it errors. The page renders, the link is blue, the launch
 * checklist counts the guide as cited, and the only way to notice is to click
 * it from another machine.
 *
 * A validate rather than a check somebody runs, because it has to catch the
 * seeders, the remote API and the admin alike, and there is no legitimate
 * public citation of a loopback address.
 */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]*\.localhost)(:|\/|$)/i

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
 *
 * ## The second thing it states, and why it is here
 *
 * On a deployment that has remote control (`REMOTE_CONTROL_SECRET` set), a
 * request authenticated with a Payload **API key** is not an editor.
 *
 * That is deliberate and it is a refusal rather than a warning. An API key is
 * unscoped, unexpiring and unlogged, so while one works there is a way around
 * every per-session capability the owner ticks — "create pages, no deletions"
 * means nothing if the same `.env` holds a key that deletes anything, and the
 * Remote log cannot answer "what else touched this" about a credential it
 * never sees. `src/lib/remote/api-key.ts` has the whole argument.
 *
 * It lives in this function because this function is the one place every
 * content collection routes its write access through. A second implementation
 * per collection is the failure this project keeps a list of, and a rule that
 * is stated in twenty places is a rule that is missing from the twenty-first.
 */
export const isEditor = ({
  req,
}: {
  req: { user?: { collection?: string; _strategy?: string | null } | null }
}): boolean => {
  if (req.user?.collection !== 'users') return false
  if (apiKeyRefused(req.user)) {
    announceApiKeyRefusal('an API key was used against this site')
    return false
  }
  return true
}

/** Published content is world-readable; writing it is editors only. */
export const publicRead: CollectionConfig['access'] = {
  read: () => true,
  create: isEditor,
  update: isEditor,
  delete: isEditor,
}

/**
 * The games an editor is assigned to, or null for "all of them".
 *
 * An admin is never restricted. An editor with an empty `games` list is also
 * unrestricted, which is the right default for a one-person network and the
 * only way the existing account keeps working — a list that defaulted to empty
 * *meaning none* would have locked the owner out of their own site on the
 * deploy that introduced it.
 */
const assignedGames = (user: unknown): (number | string)[] | null => {
  const account = user as
    | { collection?: string; role?: string; games?: (number | string | { id: number | string })[] }
    | null
    | undefined

  if (account?.collection !== 'users') return []
  if (account.role === 'admin') return null

  const games = account.games ?? []
  if (games.length === 0) return null

  return games.map((game) => (typeof game === 'object' ? game.id : game))
}

/**
 * Write access for a game-scoped collection.
 *
 * Returns `true` for an unrestricted editor, `false` for anyone who is not an
 * editor, and a `Where` for an editor assigned to particular games — which
 * Payload applies as a filter, so a restricted editor cannot reach another
 * game's records by guessing an id, and does not see them in a list either.
 *
 * It carries the same API-key refusal `isEditor` does, and has to: this is the
 * function the thirteen game-scoped content collections write through, so a
 * rule stated only on the other one would be a rule that covers the
 * collections nobody edits and misses every page on the site.
 */
export const isEditorForGame = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (apiKeyRefused(req.user as { collection?: string; _strategy?: string | null })) {
    announceApiKeyRefusal('an API key was used against this site')
    return false
  }
  const games = assignedGames(req.user)
  if (games === null) return true
  if (games.length === 0) return false
  return { game: { in: games } }
}

/**
 * Access for content that belongs to a game: public to read, and writable by
 * the editors assigned to that game.
 */
export const gameScopedAccess: CollectionConfig['access'] = {
  read: () => true,
  create: isEditorForGame,
  update: isEditorForGame,
  delete: isEditorForGame,
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
/**
 * "View on site", for the admin's edit screen.
 *
 * Every record lives on a different host — its game's subdomain — which is
 * exactly the thing an editor cannot work out from the admin, where all seven
 * wikis look identical. Without this, checking how a page actually reads means
 * knowing which wiki you are in and typing the subdomain by hand.
 *
 * The URL uses the internal path form on the apex, and `proxy.ts` redirects it
 * to the right host. That keeps this to one lookup and means it stays correct
 * if a game's subdomain is ever changed.
 */
const previewUrlFor = (collection: string): GeneratePreviewURL =>
  async (doc, { req }) => {
    const path = SECTION_PATH[collection as GameScopedCollection]
    const slug = (doc as { slug?: string }).slug
    if (!path || !slug) return null

    const reference = (doc as { game?: unknown }).game
    const gameId = typeof reference === 'object' && reference
      ? (reference as { id: number | string }).id
      : reference

    if (gameId === undefined || gameId === null) return null

    const game = await req.payload.findByID({
      collection: 'games',
      id: gameId as number,
      depth: 0,
      disableErrors: true,
    })
    if (!game) return null

    const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
    return `${base}/${game.slug}${path}/${slug}`
  }

export const scopedToGame = (collection: CollectionConfig): CollectionConfig => ({
  ...collection,
  /*
    Write access becomes per-game at the same time, for the same reason the
    three schema changes are bundled: a collection that gained the field but
    kept `publicRead` would let an editor hired for one wiki edit all seven,
    and nothing about the admin would look wrong.
  */
  access: { ...collection.access, ...gameScopedAccess },
  admin: {
    ...collection.admin,
    // Which wiki a record belongs to is the first thing a network editor needs
    // from a list, so it goes in the columns rather than behind a filter.
    defaultColumns: ['game', ...(collection.admin?.defaultColumns ?? ['title'])],
    preview: collection.admin?.preview ?? previewUrlFor(collection.slug),
    /*
      Search the summary as well as the title.

      Payload's default searches only the `useAsTitle` field, which on a
      database of four hundred quests means you can find a record if you
      already remember its exact name — and the times you reach for search are
      precisely the times you do not. Slug is in there because editors think in
      URLs when they are chasing a broken link.
    */
    listSearchableFields: collection.admin?.listSearchableFields ?? ['title', 'slug', 'summary'],
    pagination: collection.admin?.pagination ?? {
      // Ten rows is a page of scrolling to see a tenth of one section.
      defaultLimit: 50,
      limits: [25, 50, 100, 250],
    },
  },
  fields: [
    ...collection.fields.map((field) =>
      'name' in field && field.name === 'slug' ? { ...field, unique: false } : field,
    ),
    gameField(),
  ],
  indexes: [...(collection.indexes ?? []), { fields: ['game', 'slug'], unique: true }],
})
