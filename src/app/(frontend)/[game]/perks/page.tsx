import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { sectionArt } from '@/lib/art'
import { Badge } from '@/components/Badges'
import { DataTable, type Row } from '@/components/DataTable'
import { asThumb } from '@/lib/media'
import { Callout } from '@/components/Callout'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import type { Perk, SkillTree } from '@/payload-types'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

/** A function rather than a static object — see the note in `endings/page.tsx`. */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [game, perks] = await Promise.all([
    getGame(slug),
    getAll('perks', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('perks', game, {
    total: perks.length,
    detail: perks.filter((perk) => perk.isUltimate).length,
  })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/perks' },
    ...(await socialMeta(parent, { path: '/perks' })),
  }
}

export default async function PerksIndex({ params }: Props) {
  const { game } = await params
  const [doc, perks] = await Promise.all([
    getGame(game),
    getAll('perks', { game, depth: 1, sort: 'title' }),
  ])

  /*
   * A section with no records is not this game's section. The rail and the
   * sitemap already derive from what a game has, so an empty index here was
   * reachable only by typing the URL - and what it served was the copy for
   * the one game that does have the section. A 404 is the honest answer.
   */
  if (perks.length === 0) notFound()

  const rows: Row[] = perks.map((perk) => {
    const tree = typeof perk.tree === 'object' ? (perk.tree as SkillTree) : null
    return {
      id: perk.id,
      /*
        The emblem where the record has one, the icon set where it does not.
        `avatar` wins over `icon` in DataTable, and both are declared so a perk
        that never got an emblem still has a mark rather than an empty cell.
      */
      icon: perk.isUltimate ? 'star' : 'spark',
      avatar: asThumb(perk.image)?.url ?? '',
      title: perk.title,
      titleHref: `/perks/${perk.slug}`,
      tree: tree?.title ?? '',
      treeHref: tree ? `/skills/${tree.slug}` : '',
      kind: perk.isUltimate ? 'Ultimate' : 'Standard',
      effect: perk.effect ?? '',
      segments: typeof perk.timeCostSegments === 'number' ? String(perk.timeCostSegments) : '',
    }
  })
  const ultimates = perks.filter((perk) => perk.isUltimate)
  const copy = sectionCopy('perks', doc, { total: perks.length, detail: ultimates.length })

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
        art={sectionArt(game, 'perks')}
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Perks' }]}
        icon="star"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        <DataTable
          rows={rows}
          noun="perks"
          searchPlaceholder="Search perks by name, tree or effect…"
          facets={[
            { key: 'tree', label: 'Tree' },
            { key: 'kind', label: 'Kind' },
          ]}
          columns={[
            { key: 'title', label: 'Perk', type: 'name' },
            { key: 'tree', label: 'Tree', type: 'link' },
            { key: 'effect', label: 'Effect', sortable: false },
            { key: 'segments', label: 'Segments', type: 'num' },
          ]}
        />
        <Callout
          game={doc}
          where="perks-index"
          heading="Plan a full build"
          builtIn={(doc?.features ?? []).includes('build-planner')}
        >
          <p>
            The <Link href="/tools/build-planner">build planner</Link> enforces one ultimate per
            tree, totals what a spec costs in segments, and gives you a link to share.
          </p>
        </Callout>
      </div>
    </>
  )
}
