import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { sectionArt } from '@/lib/art'
import { EntityCard } from '@/components/EntityCard'
import { asThumb } from '@/lib/media'
import { Badge, PhaseBadge } from '@/components/Badges'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Perk } from '@/payload-types'

type Props = { params: Promise<{ game: string }> }

/** A function rather than a static object — see the note in `endings/page.tsx`. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [game, trees] = await Promise.all([
    getGame(slug),
    getAll('skill-trees', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('skill-trees', game, { total: trees.length })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/skills' },
  }
}

export default async function SkillsIndex({ params }: Props) {
  const { game } = await params
  const [doc, trees, perks] = await Promise.all([
    getGame(game),
    getAll('skill-trees', { game, depth: 1 }),
    getAll('perks', { game, depth: 1 }),
  ])

  /*
   * A section with no records is not this game's section. The rail and the
   * sitemap already derive from what a game has, so an empty index here was
   * reachable only by typing the URL - and what it served was the copy for
   * the one game that does have the section. A 404 is the honest answer.
   */
  if (trees.length === 0) notFound()
  const copy = sectionCopy('skill-trees', doc, { total: trees.length })

  return (
    <>
      <PageHeader
        art={sectionArt(game, 'skills')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Skills' }]}
        icon="spark"
        title={copy.heading}
        lede={copy.lede}
      />
      <div className="page body-main">
        <div className="grid">
          {trees.map((tree) => (
            <EntityCard
              headingLevel={2}
              key={tree.id}
              href={`/skills/${tree.slug}`}
              image={asThumb(tree.image)}
              title={tree.title}
              summary={tree.summary}
              badges={
                <>
                  <PhaseBadge phase={tree.phase} />
                  {tree.gatedByCorruption ? <Badge>Corruption-gated</Badge> : null}
                </>
              }
            />
          ))}
        </div>
        <section className="section">
          <div className="section-head">
            <h2>Ultimate perks</h2>
            <span className="eyebrow">One per tree</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Perk</th>
                  <th>Tree</th>
                  <th>Effect</th>
                  <th className="num">Segments</th>
                </tr>
              </thead>
              <tbody>
                {perks.map((perk) => (
                  <tr key={perk.id}>
                    <td>{perk.title}</td>
                    <td>{typeof perk.tree === 'object' ? perk.tree?.title : '—'}</td>
                    <td>{perk.effect}</td>
                    <td className="num">{perk.timeCostSegments ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}
