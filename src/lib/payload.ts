import { cache } from 'react'
import { getPayload } from 'payload'
import type { CollectionSlug } from 'payload'
import config from '@payload-config'

/**
 * Content access for the public site. Everything is read through the local API
 * at build time, so pages render as static HTML with no database on the
 * request path — page speed is one of the few advantages a new site has over
 * the established wikis, and this is where it comes from.
 */

export const client = cache(async () => getPayload({ config }))

/** Fetch a whole collection. Sizes here are small enough to take in one page. */
export const getAll = cache(async <T = Record<string, unknown>>(
  collection: CollectionSlug,
  options: { depth?: number; sort?: string; limit?: number } = {},
): Promise<T[]> => {
  const payload = await client()
  const result = await payload.find({
    collection,
    depth: options.depth ?? 1,
    sort: options.sort ?? 'title',
    limit: options.limit ?? 1000,
    pagination: false,
  })
  return result.docs as T[]
})

export const getBySlug = cache(async <T = Record<string, unknown>>(
  collection: CollectionSlug,
  slug: string,
  depth = 2,
): Promise<T | null> => {
  const payload = await client()
  const result = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth,
  })
  return (result.docs[0] as T) ?? null
})

export const getSiteSettings = cache(async () => {
  const payload = await client()
  return payload.findGlobal({ slug: 'site-settings', depth: 0 })
})

/** Canonical origin. The environment wins so staging never claims production URLs. */
export const siteUrl = async (): Promise<string> => {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const settings = await getSiteSettings()
  return (settings.domain || 'http://localhost:3000').replace(/\/$/, '')
}

/** Relationship fields come back as an id or a populated object depending on depth. */
export const rel = <T extends { id: string | number }>(value: unknown): T | null =>
  value && typeof value === 'object' ? (value as T) : null

export const relMany = <T extends { id: string | number }>(value: unknown): T[] =>
  Array.isArray(value) ? value.filter((entry): entry is T => Boolean(entry) && typeof entry === 'object') : []
