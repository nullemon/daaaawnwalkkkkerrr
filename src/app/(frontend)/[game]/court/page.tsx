import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { asThumb } from '@/lib/media'
import { Badge, Confidence } from '@/components/Badges'
import { Callout } from '@/components/Callout'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Court } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

/** A function rather than a static object — see the note in `endings/page.tsx`. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
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

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'court')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Court' }]}
        icon="crown"
        title={copy.heading}
        lede={copy.lede}
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
        <Callout game={doc} where="courts-index" heading="You do not need to clear everything">
          <p>
            Reporting puts the duel threshold at roughly three quarters of a vassal&rsquo;s
            activities, not all of them. Across all three courts that is the single biggest saving
            available to a tight run. Treat the figure as unconfirmed — it is widely repeated but we
            have not seen it stated by the developer.
          </p>
        </Callout>
      </div>
    </>
  )
}
