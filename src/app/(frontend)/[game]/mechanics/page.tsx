import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Confidence } from '@/components/Badges'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, mechanics] = await Promise.all([
    getGame(slug),
    getAll('mechanics', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('mechanics', game, { total: mechanics.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/mechanics' },
  }
}

export default async function MechanicsIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, mechanics] = await Promise.all([
    getGame(slug),
    getAll('mechanics', { game: slug, sort: 'order', depth: 0 }),
  ])
  const copy = sectionCopy('mechanics', game, { total: mechanics.length })
  return (
    <>
      <PageHeader
        art={sectionArt(slug, 'mechanics')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mechanics' }]}
        icon="hourglass"
        title={copy.heading}
        lede={copy.lede}
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
