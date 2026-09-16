import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
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
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { ROLE } from '@/lib/characters'
import { getAll, getBySlug, getGame, relMany } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Character, Quest, Region } from '@/payload-types'
import { characterMeta, clamp } from '@/lib/seo'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('characters')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const doc = await getBySlug('characters', slug, { game, depth: 1 })
  if (!doc) return {}
  const meta = characterMeta(doc, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: doc.seo?.title || meta.title,
    description: clamp(doc.seo?.description || meta.description || ''),
    alternates: { canonical: `/characters/${doc.slug}` },
  }
}

export default async function CharacterPage({ params }: Props) {
  const { game, slug } = await params
  const doc = await getBySlug('characters', slug, { game, depth: 2 })
  if (!doc) notFound()
  const questline = relMany<Quest>(doc.questline)

  const region = doc.region && typeof doc.region === 'object' ? (doc.region as Region) : null

  /*
    Which endings this person's chain is the gate for.

    The site's whole argument is that two endings are lost by finishing a
    questline too late, and the character page was the one place that never
    said which. Read off the ending's own requiredQuests rather than stored on
    the character, so a correction in the admin moves both at once.
  */
  const questlineIds = new Set(questline.map((quest) => String(quest.id)))
  const endings = (await getAll('endings', { game, depth: 1, sort: 'title' })).filter((ending) =>
    relMany<Quest>(ending.requiredQuests).some((quest) => questlineIds.has(String(quest.id))),
  )

  const nightOnly = questline.filter((quest) => quest.phase === 'night').length
  const costed = questline.filter((quest) => quest.time?.known)
  const knownSegments = costed.reduce((total, quest) => total + (quest.time?.max ?? 0), 0)

  const endingItems: RelatedItem[] = endings.map((ending) => ({
    id: ending.id,
    title: ending.title,
    href: `/endings/${ending.slug}`,
    sub: ending.summary,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Character"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Characters', href: '/characters' }, { label: doc.title }]}
        title={doc.title}
        lede={doc.summary}
        badges={
          <>
            {doc.romanceable ? <Badge>Romanceable</Badge> : null}
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
            {/* The portrait belongs beside the facts, not across the full
                width — these are 810x1080 and a full-bleed one pushes every
                word of the article below the fold. */}
            <EntityImage media={doc.portrait} shape="portrait" />
            <FactPanel
              facts={[
                { label: 'Role', value: doc.role ? ROLE[doc.role] ?? doc.role : undefined },
                { label: 'Romance', value: doc.romanceable ? 'Available' : undefined },
                {
                  label: 'Home region',
                  value: region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : undefined,
                },
                { label: 'Questline', value: questline.length ? `${questline.length} quests` : undefined },
                { label: 'Night-locked', value: nightOnly || undefined },
                {
                  label: 'Chain cost',
                  value: costed.length > 0 ? `${knownSegments}+ segments` : undefined,
                  absent: questline.length > 0 ? 'no quest in it is costed' : undefined,
                },
              ]}
            />
          </div>
        </div>

        {questline.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Their questline, in order</h2>
              <span className="eyebrow">{questline.length} quests</span>
            </div>
            <p className="note">
              Each link only appears once the previous one closes, so this chain cannot be
              parallelised or compressed. That is what makes it expensive to start late.
            </p>
            <ol className="chain">
              {questline.map((quest, index) => (
                <li key={quest.id}>
                  <span className="step">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <Link href={`/quests/${quest.slug}`}>{quest.title}</Link>
                    <span className="sub">
                      {quest.phase === 'either' ? 'Day or night' : `${quest.phase} only`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <RelatedList
          heading="Endings this chain gates"
          icon="crown"
          items={endingItems}
          note="Reach the finale without the chain finished and these are simply not offered. There is no catching up at the end."
        />
        <Sources sources={doc.sources} />
        <Attribution sources={doc.sources} />
        <SectionNeighbours
          collection="characters"
          game={game}
          slug={slug}
          label="characters"
        />
        <CommentThread game={game} path={`/characters/${slug}`} />
      </div>
    </>
  )
}
