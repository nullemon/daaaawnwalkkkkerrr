import type { Metadata, ResolvingMetadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { Linked, LinkedRichText } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { EntityImage } from '@/components/EntityImage'
import { getBySlug, getGame } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Mechanic } from '@/payload-types'
import { clamp, mechanicMeta } from '@/lib/seo'
import { recordImage, socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('mechanics')

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('mechanics', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = mechanicMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: clamp(doc.seo?.description || meta.description || ''),
    alternates: { canonical: `/mechanics/${doc.slug}` },
    ...(await socialMeta(parent, {
      path: `/mechanics/${doc.slug}`,
      image: recordImage('mechanics', doc.image),
    })),
    /*
      The admin's own "Hide this page from search engines" box.
      `seoGroup()` puts it on every content collection and only the
      quest page read it, so ticking it anywhere else did nothing at
      all — a control that is present, reachable and inert.
    */
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function MechanicPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('mechanics', slug, { game, depth: 1 })
  if (!doc) notFound()

  /*
    Where this page is, for the inline linker.

    `self` is the whole reason it is passed: composed prose names the record it
    is about in its own first sentence, and a link from a page to itself reads
    as a bug. See `src/components/Linked.tsx`.
  */
  const scope: LinkScope = { host: 'wiki', game, self: `mechanics:${doc.id}` }

  return (
    <>
      <PageHeader
        eyebrow="Mechanic"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mechanics', href: '/mechanics' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary ? <Linked text={doc.summary} scope={scope} /> : undefined}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        {/*
          The image the collection has a field for.

          `Mechanics.image` was added because these pages — release, system
          requirements, credits — are the ones every wiki opens with and were
          walls of text, and fifty-one images were attached to them. Nothing
          here rendered any of them: an upload that saves, appears in the
          admin, counts in `pnpm check:launch`'s credit tally, and is on no
          page anywhere. Above the key facts, because the facts table is what
          a reader came for and a picture under it would be a footer.
        */}
        <EntityImage media={doc.image} shape="wide" priority />
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
        <LinkedRichText data={doc.body} scope={scope} />
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="mechanics"
          game={game}
          slug={slug}
          label="mechanics"
        />
        <CommentThread game={game} path={`/mechanics/${slug}`} />
      </div>
    </>
  )
}
