import type { Metadata, ResolvingMetadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { EntityImage } from '@/components/EntityImage'
import { Confidence, PhaseBadge } from '@/components/Badges'
import { Facts } from '@/components/Facts'
import { Linked, LinkedRichText } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { getBySlug, getGame, rel } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Court, Region } from '@/payload-types'
import { activityMeta, clamp } from '@/lib/seo'
import { recordImage, socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('court-activities')

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('court-activities', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = activityMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: clamp(doc.seo?.description || meta.description || ''),
    alternates: { canonical: `/court-activities/${doc.slug}` },
    ...(await socialMeta(parent, {
      path: `/court-activities/${doc.slug}`,
      image: recordImage('court-activities', doc.image),
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

export default async function CourtActivityPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('court-activities', slug, { game, depth: 2 })
  if (!doc) notFound()

  /*
    Where this page is, for the inline linker.

    `self` is the whole reason it is passed: composed prose names the record it
    is about in its own first sentence, and a link from a page to itself reads
    as a bug. See `src/components/Linked.tsx`.
  */
  const scope: LinkScope = { host: 'wiki', game, self: `court-activities:${doc.id}` }
  const court = rel<Court>(doc.court)
  const region = rel<Region>(doc.region)
  // Read the flag, not the number: a confirmed zero-cost activity is a real
  // thing and must not read as unresearched.
  const known = Boolean(doc.time?.known)

  return (
    <>
      <PageHeader
        eyebrow="Court Activity"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Court', href: '/court' },
          ...(court ? [{ label: court.title, href: `/court/${court.slug}` }] : []),
          { label: doc.title },
        ]}
        title={doc.title}
        lede={doc.summary ? <Linked text={doc.summary} scope={scope} /> : undefined}
        badges={
          <>
            <PhaseBadge phase={doc.phase} />
            <Confidence level={doc.confidence} />
          </>
        }
      />
      <div className="page body-main">
        {/* Generated emblem, not art from the game. See `make-emblems.mjs`. */}
        <EntityImage media={doc.image} shape="square" priority />
        <Facts
          items={[
            {
              label: 'Court',
              value: court ? <Link href={`/court/${court.slug}`}>{court.title}</Link> : '—',
            },
            {
              /*
                The region was loaded, printed here, and linked nowhere on the
                page — the only relationship on the site that was resolved,
                rendered and never once made clickable.
              */
              label: 'Region',
              value: region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : '—',
            },
            { label: 'Time cost', value: known ? `${doc.time?.max} segments` : 'Not confirmed' },
            { label: 'Anger value', value: doc.angerValue ?? 'Not confirmed' },
          ]}
        />
        {doc.howToStart ? (
          <div className="callout">
            <h2>How to start it</h2>
            <p>{doc.howToStart}</p>
          </div>
        ) : null}
        <LinkedRichText data={doc.body} scope={scope} />
        {court ? (
          <p className="note">
            Part of <Link href={`/court/${court.slug}`}>{court.title}&rsquo;s court</Link>.
          </p>
        ) : null}
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="court-activities"
          game={game}
          slug={slug}
          label="Court Activities"
        />
        <CommentThread game={game} path={`/court-activities/${slug}`} />
      </div>
    </>
  )
}
