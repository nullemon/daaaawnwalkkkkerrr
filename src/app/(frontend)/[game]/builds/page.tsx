import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { Badge, Confidence } from '@/components/Badges'
import { getAll } from '@/lib/payload'
import type { Build, SkillTree } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

export const metadata: Metadata = {
  title: 'Builds — day, night and hybrid',
  description:
    'Character builds for The Blood of Dawnwalker across Swordmastery, Witchcraft and Vampirism, with the perks and gear each one needs.',
  alternates: { canonical: '/builds' },
}

const PLAYSTYLE: Record<string, string> = {
  day: 'Day',
  night: 'Night',
  hybrid: 'Hybrid',
}

export default async function BuildsIndex({ params }: Props) {
  const { game } = await params
  const builds = await getAll('builds', { game, depth: 1 })

  return (
    <>
      <PageHeader
        art={sectionArt('builds')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Builds' }]}
        icon="shield"
        title="Builds"
        lede="Coen is two characters sharing a body, so a build is really a decision about which half of the clock you intend to fight in. Each of these says which, and what it costs you in the other."
      />
      <div className="page body-main">
        {builds.length === 0 ? (
          <p className="note">No builds published yet.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Build</th>
                  <th>Plays in</th>
                  <th>Primary tree</th>
                  <th>Level</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {builds.map((build) => {
                  const tree = typeof build.primaryTree === 'object' ? (build.primaryTree as SkillTree) : null
                  return (
                    <tr key={build.id}>
                      <td>
                        <Link href={`/builds/${build.slug}`}>{build.title}</Link>
                      </td>
                      <td>{PLAYSTYLE[build.playstyle] ?? build.playstyle}</td>
                      <td>{tree ? <Link href={`/skills/${tree.slug}`}>{tree.title}</Link> : '—'}</td>
                      <td>{build.difficulty ?? '—'}</td>
                      <td>
                        <Confidence level={build.confidence} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="callout">
          <h3>Build your own</h3>
          <p>
            The <Link href="/tools/build-planner">build planner</Link> lets you pick perks across the
            three trees, shows what it costs in segments, and gives you a link you can share.
          </p>
        </div>
      </div>
    </>
  )
}
