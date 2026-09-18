import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { asThumb } from '@/lib/media'
import { Badge, Confidence } from '@/components/Badges'
import { Callout } from '@/components/Callout'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Court } from '@/payload-types'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

/** A function rather than a static object — see the note in `endings/page.tsx`. */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [game, courts] = await Promise.all([
    getGame(slug),
    getAll('courts', { game: slug, depth: 0 }),
  ])
  const activities = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)
  const copy = sectionCopy('courts', game, { total: courts.length, detail: activities })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/court' },
    ...(await socialMeta(parent, { path: '/court' })),
  }
}

export default async function CourtIndex({ params }: Props) {
  const { game } = await params
  const [doc, courts] = await Promise.all([
    getGame(game),
    getAll('courts', { game, depth: 1 }),
  ])

  /*
   * A section with no records is not this game's section. The rail and the
   * sitemap already derive from what a game has, so an empty index here was
   * reachable only by typing the URL - and what it served was the copy for
   * the one game that does have the section. A 404 is the honest answer.
   */
  if (courts.length === 0) notFound()
  const total = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)
  const copy = sectionCopy('courts', doc, { total: courts.length, detail: total })

  /*
    Where this page is, for the inline linker.

    No `self`: an index is about a section rather than about one record, so
    there is nothing on it to link to itself. The wiki's own game is still
    treated as self by `matchText`, which is what keeps a lede naming the game
    from linking to the home page the reader is already inside.
  */
  const scope: LinkScope = { host: 'wiki', game }

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'court')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Court' }]}
        icon="crown"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        <div className="grid">
          {courts.map((court) => (
            <EntityCard
              headingLevel={2}
              key={court.id}
              href={`/court/${court.slug}`}
              image={asThumb(court.image)}
              title={court.title}
              summary={court.summary}
              badges={
                <>
                  <Badge>{court.activityCount} activities</Badge>
                  <Confidence level={court.confidence} />
                </>
              }
            />
          ))}
        </div>
        {/*
          `builtIn` was missing, and it defaults to true - so this was one of
          exactly two Callouts in the whole `[game]` tree with no gate on it,
          and the body is Dawnwalker's duel arithmetic. Nothing reaches it
          today because the page 404s on an empty collection and only
          Dawnwalker has courts, but `section-copy.ts` ships a generic
          `courts` builder for other games, so the architecture expects a
          second wiki to have them - and the day one does, it inherits three
          quarters of a vassal's activities as fact. Same gate as
          `court/[slug]`, which has it.
        */}
        <Callout
          game={doc}
          where="courts-index"
          heading="You do not need to clear everything"
          builtIn={(doc?.features ?? []).includes('run-checker')}
        >
          {/* `courts.length`, not "three". The number is two lines above in
              the grid this callout sits under, so a typed count is a sentence
              that contradicts the page it is on the moment a fourth court is
              added or one is corrected away — the same class of bug as a
              section heading naming one game on eight wikis, only quieter,
              because a wrong number reads exactly like a right one. */}
          <p>
            Reporting puts the duel threshold at roughly three quarters of a vassal&rsquo;s
            activities, not all of them. Across all {courts.length} courts that is the single
            biggest saving available to a tight run. Treat the figure as unconfirmed — it is widely
            repeated but we have not seen it stated by the developer.
          </p>
        </Callout>
      </div>
    </>
  )
}
