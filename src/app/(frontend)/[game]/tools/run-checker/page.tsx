import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { RunChecker } from '@/components/RunChecker'
import { getRunGraph } from '@/lib/runData'
import { countRecords, getGame } from '@/lib/payload'
import { requireFeature } from '@/lib/features'
import { toolCopy } from '@/lib/game-copy'
import { copy, pick, splitTokens } from '@/lib/copy'
import { gameName } from '@/lib/section-copy'

type Props = { params: Promise<{ game: string }> }

/*
  A function rather than a static `metadata` object, because the title and
  description are now this wiki's to write and a static export cannot read the
  record. The built-ins below are exactly what the eight wikis served before.
*/
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const [doc, endings] = await Promise.all([getGame(slug), countRecords('endings', { game: slug })])
  const words = toolCopy(doc)
  /*
    `{endings}`, not "seven". `run/page.tsx` has the post-mortem for this exact
    sentence one directory over - a count typed into prose is wrong the day
    somebody adds an eighth ending - and this copy of it was left hardcoded,
    in the meta description, which is the half that gets indexed. `countIn` is
    cached, so the extra read costs nothing the page was not already paying.
  */
  const tokens = { game: gameName(doc), endings }

  return {
    title: copy(
      words.runCheckerTitle,
      'Run checker — which endings can you still reach?',
      tokens,
    ),
    description: copy(
      words.runCheckerDescription,
      'Enter your current day and the quests you have finished. Find out which of the {endings} endings are still reachable, which are out of time, and which you have.',
      tokens,
    ),
    alternates: { canonical: '/tools/run-checker' },
  }
}

export default async function RunCheckerPage({ params }: Props) {
  const { game } = await params
  const doc = await requireFeature(game, 'run-checker')
  const { quests, endings } = await getRunGraph(game)

  const words = toolCopy(doc)
  const name = gameName(doc)
  const tokens = { game: name, endings: endings.length, quests: quests.length }

  /*
    The clock explainer, with its one link as a token.

    The sentence states the size of the budget in prose — 480 segments, thirty
    days — which is a fact about one game sitting in a route served by eight, so
    it has to be editable. It also ends in the only link out of this callout,
    and a link cannot survive a textarea: written as `{clockLink}` it comes back
    as an element, and an editor who drops the token loses the link visibly
    rather than a stray `<a>` reaching the DOM from an editable string.
  */
  const howBody = splitTokens(
    pick(
      words.runCheckerHowBody,
      'A run is 480 segments — thirty days of eight daylight and eight night segments. The checker walks each ending’s prerequisite chain, subtracts what you have already done, and compares what is left against your remaining budget. It also treats a completed quest that permanently excludes part of a chain as a hard lock rather than a time problem, because no amount of remaining time fixes that. {clockLink}.',
    ),
  ).map((part, index) => {
    if ('text' in part) return <span key={index}>{part.text}</span>
    if (part.token === 'clockLink') {
      return (
        <Link key={index} href="/mechanics/the-clock">
          More on the clock
        </Link>
      )
    }
    return <span key={index}>{copy(`{${part.token}}`, `{${part.token}}`, tokens)}</span>
  })

  return (
    <>
      <PageHeader
        eyebrow="Tool"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Run checker' }]}
        title={copy(words.runCheckerHeading, 'Can you still make it?', tokens)}
        lede={copy(
          words.runCheckerLede,
          'Every other {game} planner builds a route from day one. This one starts from where you actually are: tell it your day and what you have finished, and it works out which endings are still on the table.',
          tokens,
        )}
      />
      <div className="page body-main">
        {/*
          The floor note travels with the results rather than sitting under
          them as a separate block, because it is a qualification on the
          numbers directly above it. It is editable and it is not optional:
          see `runCheckerFloorNote` in `src/fields/gameCopy.ts`.
        */}
        <RunChecker
          quests={quests}
          endings={endings}
          floorNote={words.runCheckerFloorNote ?? undefined}
        />
        <div className="callout">
          <h2>{copy(words.runCheckerHowHeading, 'How this works', tokens)}</h2>
          <p>{howBody}</p>
        </div>
      </div>
    </>
  )
}
