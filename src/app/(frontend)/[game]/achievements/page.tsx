import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Linked } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll, getGame } from '@/lib/payload'
import { sectionCopy } from '@/lib/section-copy'
import { socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string }> }

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very rare',
  'ultra-rare': 'Ultra rare',
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game: slug } = await params
  const [doc, achievements] = await Promise.all([
    getGame(slug),
    getAll('achievements', { game: slug, depth: 0 }),
  ])
  const copy = sectionCopy('achievements', doc, {
    total: achievements.length,
    // The second number this section has: how many almost nobody has.
    detail: achievements.filter((a) => a.rarity === 'ultra-rare').length,
  })
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/achievements' },
    ...(await socialMeta(parent, { path: '/achievements' })),
  }
}

/**
 * The full achievement list.
 *
 * Sorted rarest first rather than alphabetically, because the question a
 * reader brings to this page is "which of these is going to be the problem",
 * and an alphabetical list answers it only by accident.
 */
export default async function AchievementsIndex({ params }: Props) {
  const { game } = await params
  const [doc, achievements] = await Promise.all([
    getGame(game),
    getAll('achievements', { game, depth: 1 }),
  ])
  /*
    A section with no records is not this game's section.

    The rail, the footer and the sitemap all derive from `sectionsFor`, which
    returns only the sections a wiki has at least one record in — so an empty
    index here is reachable only by typing the URL or arriving from a search
    result, and what it serves is a heading over nothing. A 404 is the honest
    answer, and it lifts by itself the moment the first record arrives.

    Four of these eight games are not out, so nobody has published an
    achievement list for them. That is the world, not a gap in the data, and
    `pnpm refresh` the week each launches is what lights this page up.

    `GUARDS_EMPTY_INDEX` in `lib/audit.ts` is pinned against this line by
    `audit.test.ts`, so the two cannot drift.
  */
  if (achievements.length === 0) notFound()

  const sorted = [...achievements].sort((a, b) => {
    // Unknown percentages sort last: a blank is not a zero, and putting them
    // at the top would claim they are the rarest thing here.
    const left = a.globalPercent ?? Number.POSITIVE_INFINITY
    const right = b.globalPercent ?? Number.POSITIVE_INFINITY
    return left - right
  })

  const rows: Row[] = sorted.map((achievement) => {
    const icon = typeof achievement.icon === 'object' ? achievement.icon : null
    return {
      id: achievement.id,
      title: achievement.title,
      titleHref: `/achievements/${achievement.slug}`,
      avatar: icon?.url ?? '',
      avatarAlt: icon?.alt ?? '',
      description: achievement.hidden
        ? 'Hidden until unlocked'
        : (achievement.description ?? ''),
      rarity: achievement.rarity ? RARITY_LABEL[achievement.rarity] : 'Not published',
      percent: achievement.globalPercent ?? '',
      kind: achievement.hidden ? 'Hidden' : 'Visible',
    }
  })

  const ultraRare = achievements.filter((a) => a.rarity === 'ultra-rare').length
  const copy = sectionCopy('achievements', doc, { total: achievements.length, detail: ultraRare })

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
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Achievements' }]}
        icon="star"
        title={copy.heading}
        lede={copy.lede ? <Linked text={copy.lede} scope={scope} /> : undefined}
      />
      <div className="page body-main">
        <>
          <p className="note">
            Unlock percentages are read from the platform and move over time — an achievement gets
            commoner as more people finish the game. Each page records when its figure was taken.
          </p>
          <DataTable
            rows={rows}
            noun="achievements"
            searchPlaceholder="Search achievements by name or description…"
            facets={[
              { key: 'rarity', label: 'Rarity' },
              { key: 'kind', label: 'Type' },
            ]}
            columns={[
              { key: 'title', label: 'Achievement', type: 'name' },
              { key: 'description', label: 'How it is described', sortable: false },
              { key: 'rarity', label: 'Rarity' },
              { key: 'percent', label: '% of players', type: 'num' },
            ]}
          />
        </>
      </div>
    </>
  )
}
