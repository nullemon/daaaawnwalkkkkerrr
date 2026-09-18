import type { Metadata, ResolvingMetadata } from 'next'
import { SectionNeighbours } from '@/components/SectionNeighbours'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { Callout } from '@/components/Callout'
import { Confidence, PhaseBadge } from '@/components/Badges'
import { Linked, LinkedRichText } from '@/components/Linked'
import type { LinkScope } from '@/lib/link-index'
import { Sources } from '@/components/Sources'
import { Attribution } from '@/components/Attribution'
import { CommentThread } from '@/components/CommentThread'
import { AdSlot } from '@/components/AdSlot'
import { QuestToggle } from '@/components/QuestToggle'
import { UnlockPath } from '@/components/UnlockPath'
import { getRunGraph } from '@/lib/runData'
import { EntityImage } from '@/components/EntityImage'
import { FactPanel } from '@/components/FactPanel'
import { getAll, getBySlug, getGame, rel, relMany } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { gameSlugParams } from '@/lib/params'
import type { Ending, Quest, Region } from '@/payload-types'
import { clamp, questMeta } from '@/lib/seo'
import { getUi } from '@/lib/ui'
import { recordImage, socialMeta } from '@/lib/social'

type Props = { params: Promise<{ game: string; slug: string }> }

export const generateStaticParams = () => gameSlugParams('quests')

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { game, slug } = await params
  // Depth 1: the composed description names the region, so it has to resolve.
  const quest = await getBySlug('quests', slug, { game, depth: 1 })
  if (!quest) return {}
  const meta = questMeta(quest, gameName(await getGame(game)))
  return {
    // Composed from the record's own fields unless an editor has written one.
    title: quest.seo?.title || meta.title,
    description: clamp(quest.seo?.description || meta.description || ''),
    alternates: { canonical: `/quests/${quest.slug}` },
    ...(await socialMeta(parent, {
      path: `/quests/${quest.slug}`,
      image: recordImage('quests', quest.image),
    })),
    robots: quest.seo?.noindex ? { index: false, follow: true } : undefined,
  }
}

export default async function QuestPage({ params }: Props) {
  const { game, slug } = await params
  const [wiki, quest, ui] = await Promise.all([
    getGame(game),
    getBySlug('quests', slug, { game, depth: 2 }),
    getUi(),
  ])
  if (!quest) notFound()

  /*
    Where this page is, for the inline linker.

    `self` is the whole reason it is passed: composed prose names the record it
    is about in its own first sentence, and a link from a page to itself reads
    as a bug. See `src/components/Linked.tsx`.
  */
  const scope: LinkScope = { host: 'wiki', game, self: `quests:${quest.id}` }

  const region = rel<Region>(quest.region)
  const graph = await getRunGraph(game)
  const prereqs = relMany<Quest>(quest.prereqs)
  /*
    What this quest opens, computed from the other side of `prereqs`.

    The `unlocks` field exists and is populated on nothing: zero of ninety-three
    quests, because no seeder has ever written it. So this section rendered for
    no quest on the site while the same fact sat in the database the whole time
    — forty-eight `prereqs` edges, each of which is some quest saying "I need
    that one first". Reading them backwards is the identical claim with the
    arrow reversed, and it needs no new data and no new query: `getRunGraph`
    is already awaited above for the unlock path.

    `unlocks` still wins where an editor has filled it in, since a hand-written
    edge is a deliberate statement and this is a derivation.
  */
  const stored = relMany<Quest>(quest.unlocks)
  const derived = stored.length
    ? []
    : graph.quests
        .filter((other) => (other.prereqs ?? []).includes(String(quest.id)))
        .map((other) => ({
          id: other.id,
          slug: other.slug,
          title: other.title,
        }))
  const unlocks = stored.length ? stored : (derived as unknown as Quest[])
  const excludes = relMany<Quest>(quest.excludes)
  const endings = relMany<Ending>(quest.affectsEndings)
  const known = quest.time?.known
  /*
    Segments are Dawnwalker's clock. The Callout further down this page was
    gated on `run-checker` and the fact row above it was not, so every quest
    page on the other seven wikis printed "Time cost — nobody has published
    one" — which asserts the mechanic exists and only the figure is missing.
    Seeded quests on those wikis all carry `time.known: false`, so the absent
    branch was the only one they ever took: the claim was on every page, every
    time. Same leak as the heading that used to say "Vale Sangora", one
    component to the left.
  */
  const hasClock = (wiki?.features ?? []).includes('run-checker')

  return (
    <>
      <PageHeader
        eyebrow="Quest"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Quests', href: '/quests' }, { label: quest.title }]}
        title={quest.title}
        lede={quest.summary ? <Linked text={quest.summary} scope={scope} /> : undefined}
        badges={
          <>
            <PhaseBadge phase={quest.phase} />
            <Confidence level={quest.confidence} />
          </>
        }
      />
      <div className="page body-main">
        <QuestToggle questId={String(quest.id)} title={quest.title} />

        <div className="split">
          <div className="stack">
            <EntityImage media={quest.image} shape="wide" priority />
            <div className="prose">
              <LinkedRichText data={quest.body} scope={scope} />
            </div>
          </div>
          <div className="stack">
            <FactPanel
              facts={[
                {
                  label: 'Time cost',
                  value:
                    hasClock && known
                      ? quest.time?.min === quest.time?.max
                        ? // "1 segment", not "1 segments" — Night Terrors costs
                          // one, and the meta description for this very page
                          // already gets it right via `plural` in seo.ts, so
                          // the body and its own search snippet disagreed.
                          `${quest.time?.max} segment${quest.time?.max === 1 ? '' : 's'}`
                        : `${quest.time?.min}–${quest.time?.max} segments`
                      : undefined,
                  // "Not confirmed" rather than 0: an unpublished cost is not a
                  // free quest, and the run checker treats it as a floor too.
                  // Only on a wiki that has the clock — see `hasClock` above.
                  absent: hasClock ? 'nobody has published one' : undefined,
                },
                {
                  label: 'Phase',
                  /*
                    The registry, not a literal. `quest-phase.*` already exists
                    and `RunChecker` reads it, so this line's hardcoded "Day or
                    night" meant an editor who reworded the label in Interface
                    text changed the run checker and not the quest page — two
                    pages on the same wiki disagreeing about the same enum, with
                    nothing erroring and no test failing.
                  */
                  value: ui.label('quest-phase', quest.phase),
                },
                {
                  // Linked, not printed. The region page lists this quest back,
                  // so leaving it as plain text was a dead end in one direction.
                  label: 'Region',
                  value: region ? <Link href={`/regions/${region.slug}`}>{region.title}</Link> : undefined,
                  absent: 'unrecorded',
                },
                { label: 'Prerequisites', value: prereqs.length || undefined, absent: 'none' },
                { label: 'Opens', value: unlocks.length || undefined },
                { label: 'Closes off', value: excludes.length || undefined },
              ]}
            />
            <Callout
              game={wiki}
              where="quests-detail"
              heading="Where does this leave your run?"
              builtIn={(wiki?.features ?? []).includes('run-checker')}
            >
              <p>
                The <Link href="/tools/run-checker">run checker</Link> takes the quests you have
                actually finished and works out which endings are still reachable from where you
                are.
              </p>
            </Callout>
          </div>
        </div>

        <UnlockPath
          roots={[String(quest.id)]}
          questId={String(quest.id)}
          quests={graph.quests}
          clock={hasClock}
        />

        {unlocks.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>What this opens</h2>
            </div>
            <ul className="chain">
              {unlocks.map((next) => (
                <li key={next.id}>
                  <span className="step">→</span>
                  <Link href={`/quests/${next.slug}`}>{next.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {excludes.length > 0 ? (
          <div className="callout" data-tone="risk">
            <h2>Doing this closes other routes</h2>
            <p>
              Completing {quest.title} permanently locks out{' '}
              {excludes.map((locked, index) => (
                <span key={locked.id}>
                  {index > 0 ? ', ' : ''}
                  <Link href={`/quests/${locked.slug}`}>{locked.title}</Link>
                </span>
              ))}
              . No amount of remaining time reopens them.
            </p>
          </div>
        ) : null}

        {endings.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Endings this affects</h2>
            </div>
            <ul className="chain">
              {endings.map((ending) => (
                <li key={ending.id}>
                  <span className="step">·</span>
                  <Link href={`/endings/${ending.slug}`}>{ending.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <AdSlot />
        <Sources sources={quest.sources} />
        <Attribution sources={quest.sources} />
        <SectionNeighbours
          collection="quests"
          game={game}
          slug={slug}
          label="quests"
        />
        <CommentThread game={game} path={`/quests/${slug}`} />
      </div>
    </>
  )
}
