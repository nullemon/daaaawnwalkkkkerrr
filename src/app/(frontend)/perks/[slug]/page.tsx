import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence, PhaseBadge } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { getAll, getBySlug, rel } from '@/lib/payload'
import type { Perk, SkillTree } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Perk>('perks', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Perk>('perks', slug, 0)
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — what it does and whether it is worth it`,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/perks/${doc.slug}` },
  }
}

export default async function PerkPage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Perk>('perks', slug, 2)
  if (!doc) notFound()
  const tree = rel<SkillTree>(doc.tree)

  const siblings = tree
    ? (await getAll<Perk>('perks', { depth: 1 })).filter(
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
        {doc.effect ? (
          <div className="callout">
            <h3>What it does</h3>
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
            <h3>Taking this closes the others</h3>
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
      </div>
    </>
  )
}
