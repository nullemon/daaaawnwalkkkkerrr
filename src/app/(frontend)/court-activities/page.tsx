import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { getAll } from '@/lib/payload'
import type { Court, CourtActivity, Region } from '@/payload-types'

export const metadata: Metadata = {
  title: 'All Court Activities',
  description:
    'Every Court Activity in The Blood of Dawnwalker, grouped by vassal, with how each one starts and where it is.',
  alternates: { canonical: '/court-activities' },
}

export default async function CourtActivitiesIndex() {
  const [activities, courts] = await Promise.all([
    getAll<CourtActivity>('court-activities', { depth: 1 }),
    getAll<Court>('courts', { depth: 0 }),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Court', href: '/court' }, { label: 'Activities' }]}
        icon="crown"
        title="Court Activities"
        lede={`${activities.length} catalogued. These are the real main quest after the prologue — anger a vassal enough and they meet you in a duel. You do not need to clear them all.`}
      />
      <div className="page body-main">
        {courts.map((court) => {
          const mine = activities.filter(
            (activity) => typeof activity.court === 'object' && activity.court?.slug === court.slug,
          )
          if (mine.length === 0) return null
          const needed = court.activityCount && court.angerThresholdPct
            ? Math.ceil((court.activityCount * court.angerThresholdPct) / 100)
            : null
          return (
            <section className="section" key={court.id}>
              <div className="section-head">
                <h2>
                  <Link href={`/court/${court.slug}`}>{court.title}</Link>
                </h2>
                <span className="eyebrow">
                  {mine.length} documented{needed ? ` · roughly ${needed} needed` : ''}
                </span>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Activity</th>
                      <th>Region</th>
                      <th>How it starts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((activity) => {
                      const region =
                        typeof activity.region === 'object' ? (activity.region as Region) : null
                      return (
                        <tr key={activity.id}>
                          <td>
                            <Link href={`/court-activities/${activity.slug}`}>{activity.title}</Link>
                          </td>
                          <td>
                            {region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : '—'}
                          </td>
                          <td>{activity.howToStart ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
