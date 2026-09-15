import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type Row } from '@/components/DataTable'
import { getAll, getGame } from '@/lib/payload'

type Props = { params: Promise<{ game: string }> }

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very rare',
  'ultra-rare': 'Ultra rare',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [doc, achievements] = await Promise.all([
    getGame(slug),
    getAll('achievements', { game: slug, depth: 0 }),
  ])
  const name = doc?.shortTitle || doc?.title || 'this game'

  const ultraRare = achievements.filter((a) => a.rarity === 'ultra-rare').length

  return {
    title: achievements.length > 0 ? `All ${achievements.length} achievements` : 'Achievements',
    description:
      achievements.length === 0
        ? `No achievement list has been published for ${name} yet. This page fills itself in when the developer publishes one.`
        : [
            `Every achievement in ${name}, with the share of players who have unlocked each one.`,
            // Only worth a sentence when there is a number in it. "0 are held
            // by fewer than one player in twenty" is worse than silence.
            ultraRare > 0
              ? `${ultraRare} are held by fewer than one player in twenty.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
    alternates: { canonical: '/achievements' },
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
  const name = doc?.shortTitle || doc?.title || 'this game'

  return (
    <>
      <PageHeader
        eyebrow="Database"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Achievements' }]}
        icon="star"
        title="Achievements"
        lede={
          achievements.length === 0
            ? `No achievement list has been published for ${name} yet. Developers usually add one at launch; this page fills itself in when they do.`
            : [
                `All ${achievements.length} of them, rarest first, with the share of owners who have each one.`,
                ultraRare > 0 ? `${ultraRare} are held by fewer than one player in twenty.` : '',
              ]
                .filter(Boolean)
                .join(' ')
        }
      />
      <div className="page body-main">
        {achievements.length === 0 ? (
          <p className="note">
            Nothing to list yet. The achievement list comes from the developer and appears here once
            the game ships.
          </p>
        ) : (
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
        )}
      </div>
    </>
  )
}
