import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { Badge, Confidence } from '@/components/Badges'
import { Callout } from '@/components/Callout'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Build, SkillTree } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

/** A function rather than a static object — see the note in `endings/page.tsx`. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, builds] = await Promise.all([
    getGame(slug),
    getAll('builds', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('builds', game, { total: builds.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/builds' },
  }
}

const PLAYSTYLE: Record<string, string> = {
  day: 'Day',
  night: 'Night',
  hybrid: 'Hybrid',
}

export default async function BuildsIndex({ params }: Props) {
  const { game } = await params
  const [doc, builds] = await Promise.all([
    getGame(game),
    getAll('builds', { game, depth: 1 }),
  ])

  /*
   * A section with no records is not this game's section. The rail and the
   * sitemap already derive from what a game has, so an empty index here was
   * reachable only by typing the URL - and what it served was the copy for
   * the one game that does have the section. A 404 is the honest answer.
   */
  if (builds.length === 0) notFound()
  const copy = sectionCopy('builds', doc, { total: builds.length })

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'builds')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Builds' }]}
        icon="shield"
        title={copy.heading}
        lede={copy.lede}
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
        <Callout
          game={doc}
          where="builds-index"
          heading="Build your own"
          builtIn={(doc?.features ?? []).includes('build-planner')}
        >
          <p>
            The <Link href="/tools/build-planner">build planner</Link> lets you pick perks across the
            three trees, shows what it costs in segments, and gives you a link you can share.
          </p>
        </Callout>
      </div>
    </>
  )
}
