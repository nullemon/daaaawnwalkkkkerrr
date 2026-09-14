import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { ICON_FOR_CATEGORY } from '@/components/Icon'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll } from '@/lib/payload'
import { acquisitionLabel } from '@/lib/items'
import type { Item, Region } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Legendary weapons, armour and key items',
  description:
    'The gear worth going out of your way for in The Blood of Dawnwalker, and where to find it.',
  alternates: { canonical: '/items' },
}

export default async function ItemsIndex() {
  const items = await getAll<Item>('items', { depth: 1 })

  const rows: Row[] = items.map((item) => {
    const region = typeof item.region === 'object' ? (item.region as Region) : null
    const acquisition = acquisitionLabel(item)
    return {
      id: item.id,
      icon: ICON_FOR_CATEGORY[item.category] ?? 'key',
      title: item.title,
      titleHref: `/items/${item.slug}`,
      category: item.category,
      rarity: item.rarity ?? '',
      // A named region when one is sourced; otherwise how the thing is got.
      // Only an item with neither falls through to the table's own dash.
      where: region?.title ?? acquisition ?? '',
      whereHref: region ? `/regions/${region.slug}` : '',
      // Faceted separately so "show me everything in Rockfalls" still works
      // without the acquisition kinds cluttering the region list.
      region: region?.title ?? '',
      acquisition: acquisition ?? '',
    }
  })
  return (
    <>
      <PageHeader
        art={sectionArt('items')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Items' }]}
        icon="sword"
        title="Items"
        lede="We cover the legendaries, manuals, recipes and key items rather than all 1,700-odd pickups. The rest are not worth a page and we would only be guessing at their stats."
      />
      <div className="page body-main">
        <DataTable
          rows={rows}
          noun="items"
          searchPlaceholder={`Search ${items.length} items by name, type or where to get it…`}
          facets={[
            { key: 'category', label: 'Type' },
            { key: 'rarity', label: 'Rarity' },
            { key: 'region', label: 'Region' },
            { key: 'acquisition', label: 'How to get' },
          ]}
          columns={[
            { key: 'title', label: 'Item', type: 'name' },
            { key: 'category', label: 'Type' },
            { key: 'rarity', label: 'Rarity', type: 'rarity' },
            { key: 'where', label: 'Where', type: 'link' },
          ]}
        />
        <div className="callout">
          <h3>Why so few items name a region</h3>
          <p>
            Guides describe where a thing is by quest and landmark — &ldquo;the Kobold Nest&rdquo;,
            &ldquo;Bakir&rsquo;s treasury&rdquo; — and almost never say which of the ten regions
            holds it. Where a source does say, the region is linked. Where it does not, the column
            says how the item is obtained instead, because most of these have no single region at
            all: a herb that grows across the map and a reward handed over at the end of a
            questline are not missing data. <Link href="/regions">Browse by region</Link> for the
            ones that are pinned down.
          </p>
        </div>
      </div>
    </>
  )
}
