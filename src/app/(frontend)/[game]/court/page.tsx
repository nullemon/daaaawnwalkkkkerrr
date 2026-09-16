import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { Badge, Confidence } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Court } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export const metadata: Metadata = {
  title: 'The three courts and their Court Activities',
  description:
    'Ambrus, Bakir and Xanthe — the three vassal courts of The Blood of Dawnwalker, their 41 Court Activities, and how much of each court you actually need to clear.',
  alternates: { canonical: '/court' },
}

export default async function CourtIndex({ params }: Props) {
  const { game } = await params
  const courts = await getAll('courts', { game, depth: 0 })

  /*
   * A section with no records is not this game's section. The rail and the
   * sitemap already derive from what a game has, so an empty index here was
   * reachable only by typing the URL - and what it served was the copy for
   * the one game that does have the section. A 404 is the honest answer.
   */
  if (courts.length === 0) notFound()
  const total = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'court')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Court' }]}
        icon="crown"
        title="The Court"
        lede={`After the prologue there is no linear main quest. Progression is ${total} Court Activities across three vassals — anger each of them enough and they will meet you in a duel.`}
      />
      <div className="page body-main">
        <div className="grid">
          {courts.map((court) => (
            <EntityCard
              key={court.id}
              href={`/court/${court.slug}`}
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
        <div className="callout">
          <h3>You do not need to clear everything</h3>
          <p>
            Reporting puts the duel threshold at roughly three quarters of a vassal&rsquo;s
            activities, not all of them. Across all three courts that is the single biggest saving
            available to a tight run. Treat the figure as unconfirmed — it is widely repeated but we
            have not seen it stated by the developer.
          </p>
        </div>
      </div>
    </>
  )
}
