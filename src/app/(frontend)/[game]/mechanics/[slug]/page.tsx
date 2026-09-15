import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { getBySlug } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'
import type { Mechanic } from '@/payload-types'
import { mechanicMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('mechanics')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('mechanics', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = mechanicMeta(doc)
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: doc.seo?.description || meta.description,
    alternates: { canonical: `/mechanics/${doc.slug}` },
  }
}

export default async function MechanicPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('mechanics', slug, { game, depth: 1 })
  if (!doc) notFound()

  return (
    <>
      <PageHeader
        eyebrow="Mechanic"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mechanics', href: '/mechanics' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        {doc.keyFacts?.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Figure</th>
                  <th>Value</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {doc.keyFacts.map((fact) => (
                  <tr key={fact.id ?? fact.label}>
                    <td>{fact.label}</td>
                    <td className="num">{fact.value}</td>
                    <td>
                      <Confidence level={fact.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <RichText data={doc.body} />
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}
