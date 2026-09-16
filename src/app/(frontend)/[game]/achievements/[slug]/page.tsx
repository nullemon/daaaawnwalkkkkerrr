import type { Metadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Confidence, Badge } from '@/components/Badges'
import { RichText } from '@/components/RichText'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { CommentThread } from '@/components/CommentThread'
import { getAll, getBySlug, getGame } from '@/lib/payload'
import { gameSlugParams } from '@/lib/params'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('achievements')

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very rare',
  'ultra-rare': 'Ultra rare',
}

/** "one player in 250", which lands harder than "0.4%". */
const oneIn = (percent: number): string => {
  if (percent <= 0) return 'almost nobody'
  const ratio = Math.round(100 / percent)
  if (ratio <= 1) return 'almost everyone'
  return `about one player in ${ratio.toLocaleString('en-GB')}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game, slug } = await params
  const [doc, gameDoc] = await Promise.all([
    getBySlug('achievements', slug, { game, depth: 0 }),
    getGame(game),
  ])
  if (!doc) return {}

  const name = gameDoc?.shortTitle || gameDoc?.title || 'this game'
  const rarity = doc.rarity ? RARITY_LABEL[doc.rarity].toLowerCase() : null

  return {
    title: doc.seo?.title || `${doc.title} — how to unlock it`,
    description:
      doc.seo?.description ||
      [
        `${doc.title}, an achievement in ${name}.`,
        doc.description ? doc.description : doc.hidden ? 'Hidden until unlocked.' : '',
        doc.globalPercent !== null && doc.globalPercent !== undefined
          ? `${doc.globalPercent}% of players have it${rarity ? ` — ${rarity}` : ''}.`
          : '',
      ]
        .filter(Boolean)
        .join(' ')
        .slice(0, 155),
    alternates: { canonical: `/achievements/${doc.slug}` },
  }
}

export default async function AchievementPage({ params }: Props) {
  const { game, slug } = await params
  const [doc, gameDoc] = await Promise.all([
    getBySlug('achievements', slug, { game, depth: 1 }),
    getGame(game),
  ])
  if (!doc) notFound()

  const name = gameDoc?.shortTitle || gameDoc?.title || 'this game'
  const percent = doc.globalPercent

  /*
    Achievements of a similar rarity, which is the genuinely useful sideways
    link here: somebody reading about a 2% achievement is working through the
    hard ones, and the next hard one is what they want.
  */
  const siblings = await getAll('achievements', { game, depth: 1 })
  const nearby: RelatedItem[] = siblings
    .filter((other) => other.id !== doc.id && other.rarity === doc.rarity)
    .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
    .slice(0, 8)
    .map((other) => ({
      id: other.id,
      title: other.title,
      href: `/achievements/${other.slug}`,
      sub: other.hidden ? 'Hidden until unlocked' : other.description,
      meta:
        other.globalPercent !== null && other.globalPercent !== undefined
          ? `${other.globalPercent}%`
          : undefined,
    }))

  return (
    <>
      <PageHeader
        eyebrow="Achievement"
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Achievements', href: '/achievements' },
          { label: doc.title },
        ]}
        icon="star"
        title={doc.title}
        lede={doc.hidden && !doc.description ? undefined : doc.description}
        badges={
          <>
            {doc.rarity ? <Badge>{RARITY_LABEL[doc.rarity]}</Badge> : null}
            {doc.hidden ? <Badge>Hidden</Badge> : null}
            {doc.missable ? <Badge>Missable</Badge> : null}
            <Confidence level={doc.confidence} />
          </>
        }
      />

      <div className="page body-main">
        <div className="split">
          <div className="stack">
            <FactPanel
              facts={[
                {
                  label: 'Unlocked by',
                  value:
                    percent !== null && percent !== undefined
                      ? `${percent}% of players — ${oneIn(percent)}`
                      : undefined,
                  absent: 'The platform has not published a figure for this one yet.',
                },
                {
                  label: 'Rarity',
                  value: doc.rarity ? RARITY_LABEL[doc.rarity] : undefined,
                  absent: 'Not yet rated — no unlock figure published.',
                },
                {
                  label: 'Hidden',
                  value: doc.hidden ? 'Yes — the game withholds its description' : 'No',
                },
                {
                  label: 'Missable',
                  value: doc.missable ? 'Yes — can be permanently missed' : undefined,
                  absent: 'No source says it can be missed.',
                },
              ]}
            />

            {doc.howTo ? (
              <section className="section">
                <div className="section-head">
                  <h2>How to get it</h2>
                </div>
                <p>{doc.howTo}</p>
              </section>
            ) : (
              /*
                The honest empty state. Every competing wiki will have a
                confident paragraph here on launch day, assembled from a
                trailer. Saying nothing is the differentiator, not the failure.
              */
              <section className="section">
                <div className="section-head">
                  <h2>How to get it</h2>
                </div>
                <p className="note">
                  Not written yet. We write these from having done them, not from guessing at what
                  the name implies — so this stays empty until somebody has actually unlocked it.
                  {doc.hidden
                    ? ' This one is hidden, so the game does not even tell you what it wants.'
                    : ''}
                </p>
              </section>
            )}

            {doc.body ? <RichText data={doc.body} /> : null}

            <RelatedList
              heading={doc.rarity ? `Others as ${RARITY_LABEL[doc.rarity].toLowerCase()}` : 'Others'}
              icon="star"
              items={nearby}
              href="/achievements"
              note={
                doc.rarity === 'ultra-rare'
                  ? 'The ones most likely to be the last thing standing between you and the full list.'
                  : undefined
              }
            />
          </div>

          <div className="stack">
            <EntityImage media={doc.icon} shape="square" />
            <div className="callout">
              <h2>About these figures</h2>
              <p>
                The percentage is what the platform reports for {name}, read on the date in the
                source below. It moves: an achievement gets commoner as more people finish the game,
                so a figure quoted anywhere without a date is worth nothing.
              </p>
            </div>
          </div>
        </div>

        <Sources sources={doc.sources} />

        <Attribution sources={doc.sources} />

        <SectionNeighbours
          collection="achievements"
          game={game}
          slug={slug}
          label="achievements"
        />
        <CommentThread game={game} path={`/achievements/${slug}`} />
      </div>
    </>
  )
}
