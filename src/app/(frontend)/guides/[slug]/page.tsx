import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Byline } from '@/components/Byline'
import { EntityImage } from '@/components/EntityImage'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import Link from 'next/link'
import { getAll, getBySlug, relMany } from '@/lib/payload'
import { JsonLd } from '@/components/JsonLd'
import type { Author, Ending, Guide, Quest } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const docs = await getAll<Guide>('guides', { depth: 0 })
  return docs.map((doc) => ({ slug: doc.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const doc = await getBySlug<Guide>('guides', slug, 1)
  if (!doc) return {}
  // Each article has its own lead image, so each gets its own social card
  // instead of every share showing the same site-wide og.png.
  const image = doc.image && typeof doc.image === 'object' ? doc.image.url : undefined
  return {
    title: doc.seo?.title || doc.title,
    description: doc.seo?.description || doc.summary,
    alternates: { canonical: `/guides/${doc.slug}` },
    openGraph: image ? { images: [{ url: image }] } : undefined,
  }
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  const doc = await getBySlug<Guide>('guides', slug, 1)
  if (!doc) notFound()

  const person = doc.author && typeof doc.author === 'object' ? (doc.author as Author) : null

  // What this guide is about, as links: the quests and endings an editor
  // attached to it. These are the records the reader most likely wants next.
  const covered: RelatedItem[] = [
    ...relMany<Quest>(doc.relatedQuests).map((quest) => ({
      id: `q${quest.id}`,
      title: quest.title,
      href: `/quests/${quest.slug}`,
      sub: quest.summary,
    })),
    ...relMany<Ending>(doc.relatedEndings).map((ending) => ({
      id: `e${ending.id}`,
      title: ending.title,
      href: `/endings/${ending.slug}`,
      sub: ending.summary,
    })),
  ]

  // Six others, this one excluded. Newest first, so a guide written today is
  // linked from every guide written before it.
  const more: RelatedItem[] = (await getAll<Guide>('guides', { depth: 0, sort: '-updatedAt' }))
    .filter((other) => other.slug !== slug)
    .slice(0, 6)
    .map((other) => ({ id: other.id, title: other.title, href: `/guides/${other.slug}` }))

  /*
    Article markup, so the byline and the date are readable by something other
    than a person squinting at the page.

    A placeholder author is deliberately left out of it. Publishing an invented
    name as a structured `author` is a claim to a machine as much as to a
    reader, and the point of the provisional flag is that we do not make it
    until somebody real is behind the page.
  */
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: doc.seo?.title || doc.title,
    description: doc.seo?.description || doc.summary,
    ...(doc.updated ? { dateModified: new Date(doc.updated).toISOString() } : {}),
    ...(person && !person.provisional
      ? { author: { '@type': 'Person', name: person.name, url: `/authors/${person.slug}` } }
      : {}),
  }

  return (
    <>
      <JsonLd data={articleLd} />
      <PageHeader
        eyebrow="Guide"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        <Byline author={doc.author} updated={doc.updated} />
        <div className="split">
          <div className="stack">
            <EntityImage media={doc.image} shape="wide" />
            <div className="prose">
              <RichText data={doc.body} />
            </div>
            <Sources sources={doc.sources} />
          </div>

          {/*
            The column beside a guide was empty, which on a wide screen is half
            the window doing nothing. It now carries the things a reader of this
            particular guide is most likely to want next: the records it is
            about, the tools that answer the same question with their own run in
            it, and the rest of the series.
          */}
          <div className="stack">
            {person ? (
              <section className="panel">
                <div className="panel-head">
                  <h2>Written by</h2>
                </div>
                <p>
                  <Link href={`/authors/${person.slug}`}>{person.name}</Link>
                  {person.role ? <span className="note"> · {person.role}</span> : null}
                </p>
                {person.bio ? <p className="note">{person.bio}</p> : null}
              </section>
            ) : null}

            <RelatedList heading="Covered here" icon="scroll" items={covered} />

            <div className="callout">
              <h3>Answer this for your own run</h3>
              <p>
                The <Link href="/tools/run-checker">run checker</Link> takes the quests you have
                actually finished and works out which endings are still reachable. The{' '}
                <Link href="/tools/build-planner">build planner</Link> does the same for a spec.
              </p>
            </div>

            <RelatedList heading="More guides" icon="book" items={more} href="/guides" />
          </div>
        </div>
      </div>
    </>
  )
}
