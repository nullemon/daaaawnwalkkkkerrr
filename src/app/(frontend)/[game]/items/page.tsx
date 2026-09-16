import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { ICON_FOR_CATEGORY } from '@/components/Icon'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll, getGame } from '@/lib/payload'
import { acquisitionLabel } from '@/lib/items'
import { sectionCopy } from '@/lib/section-copy'
import type { Region } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, items] = await Promise.all([
    getGame(slug),
    getAll('items', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('items', game, { total: items.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/items' },
  }
}

export default async function ItemsIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, items] = await Promise.all([
    getGame(slug),
    getAll('items', { game: slug, depth: 1 }),
  ])
  const copy = sectionCopy('items', game, { total: items.length })

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
        art={sectionArt(slug, 'items')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Items' }]}
        icon="sword"
        title={copy.heading}
        lede={copy.lede}
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
        {/*
          Named landmarks and a region count, so this is Dawnwalker's or it is
          nobody's. The general point holds for any wiki, but not in these
          words, and a callout naming Bakir's treasury on the Onimusha wiki is
          the same mistake as the heading that used to say "Vale Sangora".
        */}
        {game?.slug === 'dawnwalker' ? (
          <div className="callout">
            <h2>Why so few items name a region</h2>
            <p>
              Guides describe where a thing is by quest and landmark — &ldquo;the Kobold
              Nest&rdquo;, &ldquo;Bakir&rsquo;s treasury&rdquo; — and almost never say which of the
              ten regions holds it. Where a source does say, the region is linked. Where it does
              not, the column says how the item is obtained instead, because most of these have no
              single region at all: a herb that grows across the map and a reward handed over at
              the end of a questline are not missing data.{' '}
              <Link href="/regions">Browse by region</Link> for the ones that are pinned down.
            </p>
          </div>
        ) : null}
      </div>
    </>
  )
}
