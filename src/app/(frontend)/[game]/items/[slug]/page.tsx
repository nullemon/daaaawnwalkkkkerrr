import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { getBySlug, getGame } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import { ACQUISITION_SENTENCE, acquisitionLabel } from '@/lib/items'
import type { Item, Region } from '@/payload-types'
import { itemMeta } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('items')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('items', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = itemMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: doc.seo?.description || meta.description,
    alternates: { canonical: `/items/${doc.slug}` },
  }
}

export default async function ItemPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('items', slug, { game, depth: 1 })
  if (!doc) notFound()

  const region = doc.region && typeof doc.region === 'object' ? (doc.region as Region) : null
  const acquisitionSentence = doc.acquisition ? ACQUISITION_SENTENCE[doc.acquisition] : undefined

  return (
    <>
      <PageHeader
        eyebrow="Item"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Items', href: '/items' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            <Badge>{doc.category}</Badge>
            {doc.rarity ? <Badge>{doc.rarity}</Badge> : null}
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
            <EntityImage media={doc.image} shape="square" />
            <FactPanel
              facts={[
                { label: 'Type', value: doc.category },
                { label: 'Rarity', value: doc.rarity },
                {
                  label: 'Region',
                  value: region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : undefined,
                  absent: doc.acquisition ? 'no single region' : 'unrecorded',
                },
                { label: 'How to get', value: acquisitionLabel(doc) },
              ]}
            />
          </div>
        </div>

        {/*
          The index promises a "Where" for this item, so the page has to answer
          it. Region when one is sourced, otherwise the kind of acquisition —
          and when there is neither, say so plainly rather than showing nothing
          at all, which reads as though the section were still being written.
        */}
        <div className="callout">
          <h3>Where to find it</h3>
          {doc.howToGet ? <p>{doc.howToGet}</p> : null}
          {region || acquisitionSentence ? (
            <p className="note">
              {region ? (
                <>
                  In <Link href={`/regions/${region.slug}`}>{region.title}</Link>.{' '}
                </>
              ) : null}
              {acquisitionSentence}
            </p>
          ) : null}
          {!doc.howToGet && !region && !acquisitionSentence ? (
            <p>
              No source we could reach says where this one comes from. That is a gap in the public
              record rather than a shortcut here — <Link href="/corrections">tell us</Link> if you
              know it.
            </p>
          ) : null}
        </div>
        {doc.stats?.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Stat</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {doc.stats.map((stat) => (
                  <tr key={stat.id ?? stat.label}>
                    <td>{stat.label}</td>
                    <td className="num">{stat.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <CommentThread game={game} path={`/items/${slug}`} />
      </div>
    </>
  )
}
