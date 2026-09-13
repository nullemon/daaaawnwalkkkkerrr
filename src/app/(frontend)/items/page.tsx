import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
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
  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Items' }]}
        title="Items"
        lede="We cover the legendaries, manuals, recipes and key items rather than all 1,700-odd pickups. The rest are not worth a page and we would only be guessing at their stats."
      />
      <div className="page body-main">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Rarity</th>
                <th>Region</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const region = typeof item.region === 'object' ? (item.region as Region) : null
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/items/${item.slug}`}>{item.title}</Link>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.rarity ?? '—'}</td>
                    <td>{region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
