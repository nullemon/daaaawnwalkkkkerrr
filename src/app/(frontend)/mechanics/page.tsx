import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Confidence } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Mechanic } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Game mechanics explained',
  description:
    'The systems that decide a run in The Blood of Dawnwalker: the thirty-day clock, Corruption, Infamy and the Edicts, quickslots and levelling.',
  alternates: { canonical: '/mechanics' },
}

export default async function MechanicsIndex() {
  const mechanics = await getAll<Mechanic>('mechanics', { sort: 'order', depth: 0 })
  return (
    <>
      <PageHeader
        art={sectionArt('mechanics')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mechanics' }]}
        icon="hourglass"
        title="Mechanics"
        lede="The four systems that actually decide a run: the clock, Corruption, Infamy, and what you can reach in a given phase."
      />
      <div className="page body-main">
        <div className="grid">
          {mechanics.map((mechanic) => (
            <EntityCard
              key={mechanic.id}
              href={`/mechanics/${mechanic.slug}`}
              title={mechanic.title}
              summary={mechanic.summary}
              badges={<Confidence level={mechanic.confidence} />}
            />
          ))}
        </div>
      </div>
    </>
  )
}
