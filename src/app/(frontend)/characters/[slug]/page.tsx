import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { EntityImage } from '@/components/EntityImage'
import { getAll, getBySlug, relMany } from '@/lib/payload'
import type { Character, Quest } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Character>('characters', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Character>('characters', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — questline, romance and role`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/characters/${doc.slug}` },
  }
}

export default async function CharacterPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Character>('characters', slug, 2)
  if (!doc) notFound()
  const questline = relMany<Quest>(doc.questline)

  return (
    <>
      <PageHeader
        eyebrow="Character"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Characters', href: '/characters' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            {doc.romanceable ? <Badge>Romanceable</Badge> : null}
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <EntityImage media={doc.portrait} shape="portrait" />

        <RichText data={doc.body} />
        {questline.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Their questline, in order</h2>
              <span className="eyebrow">{questline.length} quests</span>
            </div>
            <p className="note">
              Each link only appears once the previous one closes, so this chain cannot be
              parallelised or compressed. That is what makes it expensive to start late.
            </p>
            <ol className="chain">
              {questline.map((quest, index) => (
                <li key={quest.id}>
                  <span className="step">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                    <span className="sub">
                      {quest.phase === 'either' ? 'Day or night' : `${quest.phase} only`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}
