import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { ICON_FOR_CATEGORY } from '@/components/Icon'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll } from '@/lib/payload'
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
    return {
      id: item.id,
      icon: ICON_FOR_CATEGORY[item.category] ?? 'key',
      title: item.title,
      titleHref: `/items/${item.slug}`,
      category: item.category,
      rarity: item.rarity ?? '',
      region: region?.title ?? '',
      regionHref: region ? `/regions/${region.slug}` : '',
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
          searchPlaceholder="Search items by name, type or region…"
          facets={[
            { key: 'category', label: 'Type' },
            { key: 'rarity', label: 'Rarity' },
            { key: 'region', label: 'Region' },
          ]}
          columns={[
            { key: 'title', label: 'Item', type: 'name' },
            { key: 'category', label: 'Type' },
            { key: 'rarity', label: 'Rarity', type: 'rarity' },
            { key: 'region', label: 'Region', type: 'link' },
          ]}
        />
      </div>
    </>
  )
}
