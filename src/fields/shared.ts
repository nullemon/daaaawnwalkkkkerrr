import type { CollectionConfig, Field, FieldHook } from 'payload'

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
export const slugField = (): Field => ({
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

/** Published content is world-readable; everything else needs a logged-in editor. */
export const publicRead: CollectionConfig['access'] = {
  read: () => true,
}
