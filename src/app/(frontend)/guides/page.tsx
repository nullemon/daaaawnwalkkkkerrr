import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { getAll } from '@/lib/payload'
import type { Guide, Media } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Guides',
  description: 'Long-form guides to The Blood of Dawnwalker — planning a run, reaching an ending, and the decisions that cannot be undone.',
  alternates: { canonical: '/guides' },
}

export default async function GuidesIndex() {
  // depth 1 so each card can show its own lead image rather than a wall of text.
  const guides = await getAll<Guide>('guides', { depth: 1, sort: '-updatedAt' })

  return (
    <>
      <PageHeader
        art={sectionArt('guides')}
        eyebrow="Editorial"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides' }]}
        icon="book"
        title="Guides"
        lede={`${guides.length} guides. One page, one question, answered properly.`}
      />
      <div className="page body-main">
        <div className="guidegrid">
          {guides.map((guide) => {
            const image = guide.image && typeof guide.image === 'object' ? (guide.image as Media) : null
            return (
              <Link key={guide.id} href={`/guides/${guide.slug}`} className="guidetile">
                {image?.url ? (
                  <img
                    className="guidetile-image"
                    src={image.sizes?.card?.url ?? image.url}
                    alt=""
                    loading="lazy"
                  />
                ) : null}
                <span className="guidetile-body">
                  {guide.targetQuery ? <span className="eyebrow">{guide.targetQuery}</span> : null}
                  <h2>{guide.title}</h2>
                  {guide.summary ? <p className="note">{guide.summary}</p> : null}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
