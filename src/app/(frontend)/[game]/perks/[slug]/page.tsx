import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence, PhaseBadge } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { EntityImage } from '@/components/EntityImage'
import { getAll, getBySlug, getGame, rel } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Perk, SkillTree } from '@/payload-types'
import { clamp, perkMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('perks')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('perks', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = perkMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: clamp(doc.seo?.description || meta.description || ''),
    alternates: { canonical: `/perks/${doc.slug}` },
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function PerkPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('perks', slug, { game, depth: 2 })
  if (!doc) notFound()
  const tree = rel<SkillTree>(doc.tree)

  const siblings = tree
    ? (await getAll('perks', { game, depth: 1 })).filter(
        (perk) =>
          typeof perk.tree === 'object' &&
          (perk.tree as SkillTree).slug === tree.slug &&
          perk.slug !== doc.slug,
      )
    : []
  const rivalUltimates = siblings.filter((perk) => perk.isUltimate)

  return (
    <>
      <PageHeader
        eyebrow={doc.isUltimate ? 'Ultimate perk' : 'Perk'}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Perks', href: '/perks' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            {doc.isUltimate ? <Badge>Ultimate</Badge> : null}
            {tree ? <PhaseBadge phase={tree.phase} /> : null}
            {doc.foundInWorld ? <Badge>Found in the world</Badge> : null}
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <EntityImage media={doc.image} shape="square" />

        {doc.effect ? (
          <div className="callout">
            <h2>What it does</h2>
            <p>{doc.effect}</p>
          </div>
        ) : null}

        <Facts
          items={[
            { label: 'Tree', value: tree ? tree.title : '—' },
            { label: 'Ultimate', value: doc.isUltimate ? 'Yes' : 'No' },
            {
              label: 'Segment cost',
              value: typeof doc.timeCostSegments === 'number' ? doc.timeCostSegments : 'Not confirmed',
            },
            { label: 'How it is obtained', value: doc.foundInWorld ? 'Found in the world' : 'Learned' },
          ]}
        />

        <RichText data={doc.body} />

        {doc.isUltimate && rivalUltimates.length > 0 ? (
          <div className="callout" data-tone="risk">
            <h2>Taking this closes the others</h2>
            <p>
              Only one ultimate per tree. Choosing {doc.title} means giving up{' '}
              {rivalUltimates.map((perk, index) => (
                <span key={perk.id}>
                  {index > 0 ? ' and ' : ''}
                  <Link href={`/perks/${perk.slug}`}>{perk.title}</Link>
                </span>
              ))}{' '}
              for the rest of the run.
            </p>
          </div>
        ) : null}

        {tree ? (
          <p className="note">
            Part of <Link href={`/skills/${tree.slug}`}>{tree.title}</Link>. Try it in the{' '}
            <Link href={`/tools/build-planner?perks=${doc.slug}`}>build planner</Link>.
          </p>
        ) : null}

        <Sources sources={doc.sources} />

        <Attribution sources={doc.sources} />

        <SectionNeighbours
          collection="perks"
          game={game}
          slug={slug}
          label="perks"
        />
        <CommentThread game={game} path={`/perks/${slug}`} />
      </div>
    </>
  )
}
