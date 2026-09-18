import type { Metadata, ResolvingMetadata } from 'next'
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
