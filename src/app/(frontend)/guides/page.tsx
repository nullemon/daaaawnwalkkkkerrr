import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Confidence } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Guide } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Guides',
  description: 'Long-form guides to The Blood of Dawnwalker — planning a run, reaching an ending, and the decisions that cannot be undone.',
  alternates: { canonical: '/guides' },
}

export default async function GuidesIndex() {
  const guides = await getAll<Guide>('guides', { depth: 0 })
  return (
    <>
      <PageHeader
        art={sectionArt('guides')}
        eyebrow="Editorial"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides' }]}
        icon="book"
        title="Guides"
        lede="One page, one question, answered properly."
      />
      <div className="page body-main">
        <div className="grid">
          {guides.map((guide) => (
            <EntityCard
              key={guide.id}
              href={`/guides/${guide.slug}`}
              title={guide.title}
              summary={guide.summary}
              badges={<Confidence level={guide.confidence} />}
            />
          ))}
        </div>
      </div>
    </>
  )
}
