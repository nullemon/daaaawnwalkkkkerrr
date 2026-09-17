import type { Metadata } from 'next'
import { clamp } from '@/lib/seo'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence, PhaseBadge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { Callout } from '@/components/Callout'
import { getAll, getBySlug, getGame } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('skill-trees')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('skill-trees', slug, { game, depth: 0 })
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — skills, perks and when to use them`,
    description: clamp(doc.seo?.description || doc.summary || ''),
    alternates: { canonical: `/skills/${doc.slug}` },
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function SkillTreePage({ params }: Props) {
  const { game, slug } = await params
  const [wiki, doc] = await Promise.all([
    getGame(game),
    getBySlug('skill-trees', slug, { game, depth: 1 }),
  ])
  if (!doc) notFound()
  const perks = (await getAll('perks', { game, depth: 1, sort: 'title' })).filter(
    (perk) => typeof perk.tree === 'object' && perk.tree?.slug === slug,
  )

  /*
    Builds founded on this tree. The build records name their primary tree and
    nothing read that edge backwards, so a tree page listed its perks and never
    the builds those perks are for.
  */
  const builds = (await getAll('builds', { game, depth: 1 })).filter((build) => {
    const tree = build.primaryTree
    return tree && typeof tree === 'object' && (tree as { slug?: string }).slug === slug
  })
  const fromTree: RelatedItem[] = builds.map((build) => ({
    id: build.id,
    title: build.title,
    href: `/builds/${build.slug}`,
    sub: build.summary,
  }))
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
            {/*
              The tree's emblem. Square, because it is a generated sigil rather
              than art from the game — see `tools/make-emblems.mjs`. Nothing
              rendered this at all, so a third of the emblem set was attached,
              correct, and on no page anybody could reach.
            */}
            <EntityImage media={doc.image} shape="square" />
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
            <Callout
              game={wiki}
              where="skill-trees-detail"
              heading="One ultimate per tree"
              builtIn={(wiki?.features ?? []).includes('build-planner')}
            >
              <p>
                Taking any ultimate here closes the other two, so a tree is a choice as much as a
                path. The <Link href="/tools/build-planner">build planner</Link> enforces it and
                totals what a spec costs.
              </p>
            </Callout>
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
        <RelatedList heading="Builds on this tree" icon="shield" items={fromTree} />
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="skill-trees"
          game={game}
          slug={slug}
          label="skill trees"
        />
        <CommentThread game={game} path={`/skills/${slug}`} />
      </div>
    </>
  )
}
