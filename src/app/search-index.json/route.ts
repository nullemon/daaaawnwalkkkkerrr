import { getAll, siteUrl } from '@/lib/payload'
import type { CollectionSlug } from 'payload'

export const dynamic = 'force-static'

type Doc = { slug: string; title: string; summary?: string | null }

/** Every searchable record, flattened. Built once at build time. */
const SECTIONS: { collection: CollectionSlug; path: string; kind: string }[] = [
  { collection: 'quests', path: 'quests', kind: 'Quest' },
  { collection: 'items', path: 'items', kind: 'Item' },
  { collection: 'perks', path: 'perks', kind: 'Perk' },
  { collection: 'characters', path: 'characters', kind: 'Character' },
  { collection: 'enemies', path: 'enemies', kind: 'Enemy' },
  { collection: 'court-activities', path: 'court-activities', kind: 'Court activity' },
  { collection: 'endings', path: 'endings', kind: 'Ending' },
  { collection: 'regions', path: 'regions', kind: 'Region' },
  { collection: 'builds', path: 'builds', kind: 'Build' },
  { collection: 'guides', path: 'guides', kind: 'Guide' },
  { collection: 'mechanics', path: 'mechanics', kind: 'Mechanic' },
  { collection: 'skill-trees', path: 'skills', kind: 'Skill tree' },
  { collection: 'courts', path: 'court', kind: 'Court' },
]

export async function GET(): Promise<Response> {
  const rows: { t: string; u: string; k: string; s: string }[] = []
  for (const section of SECTIONS) {
    const docs = await getAll<Doc>(section.collection, { depth: 0 })
    for (const doc of docs) {
      rows.push({
        t: doc.title,
        u: `/${section.path}/${doc.slug}`,
        k: section.kind,
        s: (doc.summary ?? '').slice(0, 160),
      })
    }
  }
  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  })
}
