import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { clamp } from '@/lib/seo'
import { PageHeader } from '@/components/PageHeader'
import { Confidence, Badge } from '@/components/Badges'
import { Linked, LinkedRichText } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import { getAll, getBySlug } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'
import { getUi } from '@/lib/ui'
import type { Faction } from '@/payload-types'
import { recordImage, socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('factions')

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('factions', slug, { game, depth: 1 })
  if (!doc) return {}
  return {
    title: doc.seo?.title || `${doc.title} — members, and what is recorded`,
    description: clamp(doc.seo?.description || doc.summary || ''),
    alternates: { canonical: `/factions/${doc.slug}` },
    ...(await socialMeta(parent, {
      path: `/factions/${doc.slug}`,
      image: recordImage('factions', doc.image),
    })),
    robots: doc.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

/**
 * True when a member's `faction` names this one.
 *
 * `faction` is hasMany, because a character genuinely belongs to the Republic
 * *and* the Grand Army of the Republic, so the stored value is an array — and
 * at depth 1 each entry is a populated document while at depth 0 it is a bare
 * id. Only the populated form can be compared by slug, and an id is simply not
 * a match here rather than a crash: this page loads at depth 1.
 */
const inFaction = (value: unknown, slug: string): boolean =>
  (Array.isArray(value) ? value : [value]).some(
    (entry) => Boolean(entry) && typeof entry === 'object' && (entry as Faction).slug === slug,
  )

export default async function FactionPage({ params }: Props) {
  const { game, slug } = await params
  const [doc, ui] = await Promise.all([getBySlug('factions', slug, { game, depth: 1 }), getUi()])
  if (!doc) notFound()

  /*
    Where this page is, for the inline linker.

    `self` is the whole reason it is passed: composed prose names the record it
    is about in its own first sentence, and a link from a page to itself reads
    as a bug. See `src/components/Linked.tsx`.
  */
  const scope: LinkScope = { host: 'wiki', game, self: `factions:${doc.id}` }

  /*
    Members, read backwards from the edge on each member rather than from a
    list stored here. That is the whole reason `Factions` has no `members`
    field: a stored list keeps naming a record long after the record stopped
    saying it belongs here, and nothing errors when it does.
  */
  const [allCharacters, allEnemies, allItems] = await Promise.all([
    getAll('characters', { game, depth: 1, sort: 'title' }),
    getAll('enemies', { game, depth: 1, sort: 'title' }),
    getAll('items', { game, depth: 1, sort: 'title' }),
  ])

  const characters = allCharacters.filter((record) => inFaction(record.faction, slug))
  const enemies = allEnemies.filter((record) => inFaction(record.faction, slug))
  const items = allItems.filter((record) => inFaction(record.faction, slug))
  const members = characters.length + enemies.length + items.length

  const characterItems: RelatedItem[] = characters.map((record) => ({
    id: record.id,
    title: record.title,
    href: `/characters/${record.slug}`,
    sub: record.summary,
    meta: record.role ? <Badge>{ui.label('role', record.role)}</Badge> : undefined,
  }))

  const enemyItems: RelatedItem[] = enemies.map((record) => ({
    id: record.id,
    title: record.title,
    href: `/enemies/${record.slug}`,
    sub: record.summary,
    meta: record.isBoss ? <span className="badge">Boss</span> : undefined,
  }))

  const itemItems: RelatedItem[] = items.map((record) => ({
    id: record.id,
    title: record.title,
    href: `/items/${record.slug}`,
    sub: record.howToGet,
    meta: record.rarity ? <span className={`badge rarity-${record.rarity}`}>{record.rarity}</span> : undefined,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Faction"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Factions', href: '/factions' },
          { label: doc.title },
        ]}
        icon="shield"
        title={doc.title}
        lede={doc.summary ? <Linked text={doc.summary} scope={scope} /> : undefined}
        badges={<Confidence level={doc.confidence} />}
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            <EntityImage media={doc.image} shape="wide" priority />
            <div className="prose">
              <LinkedRichText data={doc.body} scope={scope} />
            </div>
          </div>

          <div className="stack">
            <FactPanel
              facts={[
                // The stored value is never printed raw. An unlabelled enum in
                // a fact panel is how a region spent months saying "late".
                { label: 'Kind', value: doc.kind ? ui.label('faction-kind', doc.kind) : undefined },
                {
                  label: 'Members',
                  value: members || undefined,
                  /*
                    Not "none". Most of these records exist because an infobox
                    named the organisation on a page that is not itself in the
                    database — a place, a system, a page nobody harvested — so
                    an empty list is a gap in what links here rather than a
                    claim that nobody belongs to it.
                  */
                  absent: 'nothing in the database names it yet',
                },
                { label: 'Characters', value: characters.length || undefined },
                { label: 'Enemies', value: enemies.length || undefined },
                { label: 'Equipment', value: items.length || undefined },
              ]}
            />
          </div>
        </div>

        <RelatedList
          heading="Members"
          icon="person"
          items={characterItems}
          href="/characters"
          emptyNote="No character in the database names this organisation in its infobox."
        />
        <RelatedList heading="Enemies fighting for it" icon="skull" items={enemyItems} href="/enemies" />
        <RelatedList
          heading="Equipment"
          icon="sword"
          items={itemItems}
          href="/items"
          note={
            items.length > 0
              ? 'Only the gear whose own source names this organisation. Weapon infoboxes state a manufacturer more often than an owner, so it fields more than this.'
              : undefined
          }
        />

        <Sources sources={doc.sources} />

        <Attribution sources={doc.sources} />

        <SectionNeighbours collection="factions" game={game} slug={slug} label="factions" />
        <CommentThread game={game} path={`/factions/${slug}`} />
      </div>
    </>
  )
}
