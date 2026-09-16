import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence, PhaseBadge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { getAll, getBySlug } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('skill-trees')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('skill-trees', slug, { game, depth: 0 })
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — skills, perks and when to use them`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/skills/${doc.slug}` },
  }
}

export default async function SkillTreePage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('skill-trees', slug, { game, depth: 1 })
  if (!doc) notFound()
  const perks = (await getAll('perks', { game, depth: 1, sort: 'title' })).filter(
    (perk) => typeof perk.tree === 'object' && perk.tree?.slug === slug,
  )
  const ultimates = perks.filter((perk) => perk.isUltimate)

  const perkItems: RelatedItem[] = perks.map((perk) => ({
    id: perk.id,
    title: perk.title,
    href: `/perks/${perk.slug}`,
    sub: perk.effect,
    meta: perk.isUltimate ? <span className="badge">Ultimate</span> : undefined,
  }))

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
        <div className="split">
          <div className="stack">
            <div className="prose">
              <RichText data={doc.body} />
            </div>
          </div>
          <div className="stack">
            <FactPanel
              facts={[
                { label: 'Perks', value: perks.length || undefined },
                { label: 'Ultimates', value: ultimates.length || undefined },
                {
                  label: 'Phase',
                  value: doc.phase === 'either' ? 'Day or night' : doc.phase ? `${doc.phase} only` : undefined,
                },
                { label: 'Corruption-gated', value: doc.gatedByCorruption ? 'Yes' : undefined },
              ]}
            />
            <div className="callout">
              <h2>One ultimate per tree</h2>
              <p>
                Taking any ultimate here closes the other two, so a tree is a choice as much as a
                path. The <Link href="/tools/build-planner">build planner</Link> enforces it and
                totals what a spec costs.
              </p>
            </div>
          </div>
        </div>

        {/*
          These were rendered as bare <strong>, so the one page listing a
          tree's perks was the one place you could not click through to any of
          them. Every perk has a page; this is the index for it.
        */}
        <RelatedList
          heading="Perks in this tree"
          icon="star"
          items={perkItems}
          href="/perks"
          emptyNote="No perk in the database is filed under this tree yet."
        />
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <CommentThread game={game} path={`/skills/${slug}`} />
      </div>
    </>
  )
}
