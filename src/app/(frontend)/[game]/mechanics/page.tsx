import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Confidence } from '@/components/Badges'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [game, mechanics] = await Promise.all([
    getGame(slug),
    getAll('mechanics', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('mechanics', game, { total: mechanics.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/mechanics' },
    ...(await socialMeta(parent, { path: '/mechanics' })),
  }
}

export default async function MechanicsIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, mechanics] = await Promise.all([
    getGame(slug),
    getAll('mechanics', { game: slug, sort: 'order', depth: 0 }),
  ])
  /*
    A section with no records is not this game's section.

    The rail, the footer and the sitemap all derive from `sectionsFor`, which
    returns only the sections a wiki has at least one record in — so an empty
    index here is reachable only by typing the URL or arriving from a search
    result, and what it serves is a heading over nothing. A 404 is the honest
    answer, and it lifts by itself the moment the first record arrives.

    `GUARDS_EMPTY_INDEX` in `lib/audit.ts` is pinned against this line by
    `audit.test.ts`, so the two cannot drift.
  */
  if (mechanics.length === 0) notFound()
  const copy = sectionCopy('mechanics', game, { total: mechanics.length })
  /*
    Where this page is, for the inline linker.

    No `self`: an index is about a section rather than about one record, so
    there is nothing on it to link to itself. The wiki's own game is still
    treated as self by `matchText`, which is what keeps a lede naming the game
    from linking to the home page the reader is already inside.
  */
  const scope: LinkScope = { host: 'wiki', game: slug }

  return (
    <>
      <PageHeader
        art={sectionArt(slug, 'mechanics')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mechanics' }]}
        icon="hourglass"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        <div className="grid">
          {mechanics.map((mechanic) => (
            <EntityCard
              headingLevel={2}
              key={mechanic.id}
              href={`/mechanics/${mechanic.slug}`}
              title={mechanic.title}
              summary={mechanic.summary}
              badges={<Confidence level={mechanic.confidence} />}
            />
          ))}
        </div>
      </div>
    </>
  )
}
