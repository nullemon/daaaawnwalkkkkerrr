import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Badge } from '@/components/Badges'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Faction } from '@/payload-types'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

/**
 * `detail` is how many of these have an article of their own on the source
 * wiki, as opposed to being compiled from the infoboxes that name them. The
 * two are different claims and the lede says which is which.
 */
const withOwnArticle = (factions: Faction[]) =>
  factions.filter((faction) => faction.confidence !== 'low').length

/** A function, never a module-level `metadata` object — see `endings/page.tsx`. */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [game, factions] = await Promise.all([
    getGame(slug),
    getAll('factions', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('factions', game, {
    total: factions.length,
    detail: withOwnArticle(factions),
  })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/factions' },
    ...(await socialMeta(parent, { path: '/factions' })),
  }
}

export default async function FactionsIndex({ params }: Props) {
  const { game: slug } = await params
  const [game, factions] = await Promise.all([
    getGame(slug),
    getAll('factions', { game: slug, depth: 0 }),
  ])

  /*
    A section with no records is not this game's section. Four of the eight
    wikis cover games nobody has played, and two of the harvested ones state
    no affiliation anywhere — an empty index would serve another game's copy
    to anybody who typed the URL, which is the failure `sectionCopy` exists to
    stop arriving through a different door.
  */
  if (factions.length === 0) notFound()

  const copy = sectionCopy('factions', game, {
    total: factions.length,
    detail: withOwnArticle(factions),
  })

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
        art={sectionArt(slug, 'factions')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Factions' }]}
        icon="shield"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        <div className="grid">
          {factions.map((faction) => (
            <EntityCard
              headingLevel={2}
              key={faction.id}
              href={`/factions/${faction.slug}`}
              title={faction.title}
              summary={faction.summary}
              icon="shield"
              badges={faction.kind ? <Badge>{faction.kind}</Badge> : null}
            />
          ))}
        </div>
      </div>
    </>
  )
}
