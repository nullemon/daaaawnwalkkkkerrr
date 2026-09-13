import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence, PhaseBadge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { getAll, getBySlug } from '@/lib/payload'
import type { Perk, SkillTree } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<SkillTree>('skill-trees', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<SkillTree>('skill-trees', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — skills, perks and when to use them`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/skills/${doc.slug}` },
  }
}

export default async function SkillTreePage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<SkillTree>('skill-trees', slug, 1)
  if (!doc) notFound()
  const perks = (await getAll<Perk>('perks', { depth: 1 })).filter(
    (perk) => typeof perk.tree === 'object' && perk.tree?.slug === slug,
  )

  return (
    <>
      <PageHeader
        eyebrow="Skill tree"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Skills', href: '/skills' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            <PhaseBadge phase={doc.phase} />
            {doc.gatedByCorruption ? <Badge>Corruption-gated</Badge> : null}
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <RichText data={doc.body} />
        {perks.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Perks in this tree</h2>
            </div>
            <ul className="chain">
              {perks.map((perk) => (
                <li key={perk.id}>
                  <span className="step">·</span>
                  <span>
                    <strong>{perk.title}</strong>
                    <span className="sub">{perk.effect}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Sources sources={doc.sources} />
      </div>
    </>
  )
}
