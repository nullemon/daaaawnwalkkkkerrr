import type { MetadataRoute } from 'next'
import { getAll, siteUrl } from '@/lib/payload'
import type { CollectionSlug } from 'payload'

type Doc = { slug: string; updatedAt?: string }

/** Collections that get a page each, and the path they live under. */
const SECTIONS: { collection: CollectionSlug; path: string; priority: number }[] = [
  { collection: 'quests', path: 'quests', priority: 0.8 },
  { collection: 'endings', path: 'endings', priority: 0.9 },
  { collection: 'court-activities', path: 'court-activities', priority: 0.7 },
  { collection: 'courts', path: 'court', priority: 0.7 },
  { collection: 'mechanics', path: 'mechanics', priority: 0.8 },
  { collection: 'regions', path: 'regions', priority: 0.6 },
  { collection: 'characters', path: 'characters', priority: 0.6 },
  { collection: 'skill-trees', path: 'skills', priority: 0.6 },
  { collection: 'items', path: 'items', priority: 0.6 },
  { collection: 'guides', path: 'guides', priority: 0.7 },
  { collection: 'builds', path: 'builds', priority: 0.8 },
  { collection: 'enemies', path: 'enemies', priority: 0.6 },
  { collection: 'perks', path: 'perks', priority: 0.7 },
]

const STATIC_PATHS: { path: string; priority: number }[] = [
  { path: '', priority: 1 },
  { path: 'run', priority: 0.9 },
  { path: 'tools/run-checker', priority: 1 },
  { path: 'tools/build-planner', priority: 0.9 },
  { path: 'builds', priority: 0.8 },
  { path: 'enemies', priority: 0.6 },
  { path: 'perks', priority: 0.7 },
  { path: 'court-activities', priority: 0.8 },
  { path: 'quests', priority: 0.9 },
  { path: 'endings', priority: 0.9 },
  { path: 'court', priority: 0.8 },
  { path: 'mechanics', priority: 0.8 },
  { path: 'regions', priority: 0.7 },
  { path: 'characters', priority: 0.7 },
  { path: 'skills', priority: 0.7 },
  { path: 'items', priority: 0.7 },
  { path: 'guides', priority: 0.7 },
  { path: 'about', priority: 0.4 },
  { path: 'privacy', priority: 0.3 },
  { path: 'terms', priority: 0.3 },
  { path: 'contact', priority: 0.4 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl()
  const now = new Date()

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((entry) => ({
    url: `${base}/${entry.path}`.replace(/\/$/, '') || base,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: entry.priority,
  }))

  for (const section of SECTIONS) {
    const docs = await getAll<Doc>(section.collection, { depth: 0 })
    for (const doc of docs) {
      entries.push({
        url: `${base}/${section.path}/${doc.slug}`,
        lastModified: doc.updatedAt ? new Date(doc.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: section.priority,
      })
    }
  }

  /*
    Contributor profiles, but only the ones that are indexable.

    A profile still marked provisional renders with `noindex`, and listing a
    noindex page in a sitemap is a contradiction — it asks a crawler to fetch
    something and then tells it to forget what it found. They appear here the
    moment the flag comes off in the admin.
  */
  const authors = await getAll<Doc & { provisional?: boolean | null }>('authors', { depth: 0 })
  for (const author of authors) {
    if (author.provisional) continue
    entries.push({
      url: `${base}/authors/${author.slug}`,
      lastModified: author.updatedAt ? new Date(author.updatedAt) : now,
      changeFrequency: 'monthly',
      priority: 0.4,
    })
  }

  return entries
}
