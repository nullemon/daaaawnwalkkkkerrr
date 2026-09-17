import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { SEGMENTS_PER_PHASE, TOTAL_DAYS, TOTAL_SEGMENTS } from '@/lib/segments'
import { briefingCopy } from '@/lib/game-copy'
import { copy } from '@/lib/copy'
import type { Court, Ending, Game } from '@/payload-types'

/**
 * A wiki's briefing: signed opinion about its own game, on its own home page.
 *
 * This was `DawnwalkerBriefing`, and the name was the only thing keeping it
 * honest. Three editorial reads about one game — which vassal to fight first,
 * whether to commit to Crake, how many Court Activities to skip — were written
 * into a React component and rendered for any game that happened to have courts
 * and endings catalogued. That is the `ART_GAME` failure in sentences rather
 * than screenshots: correct while there was one wiki, and the day a second one
 * catalogues the same shapes it is handed somebody else's opinion under its own
 * byline.
 *
 * So the opinions are data. `briefing.takes` on the Game holds them,
 * `pnpm seed:copy` writes Dawnwalker's in, and a wiki nobody has written one
 * for renders nothing at all — which is why `enabled` is off by default and
 * gates the whole component. An empty opinion box is worse than no opinion box,
 * and a borrowed one is worse than either.
 *
 * What is left in code is only what the records can answer: the clock strip,
 * the court arithmetic behind the takes, and the endings table. Those are
 * derived, so they cannot say the wrong thing about a game — except the clock,
 * which is 480 segments and belongs to the one game that has them. It renders
 * on the `run-checker` feature for the same reason the About page asks that
 * question rather than asking for a slug.
 */

const GATE_SHORT: Record<string, string> = {
  ally: 'Ally chain',
  choice: 'Finale choice',
  clock: 'The clock',
}

export function Briefing({
  game,
  courts,
  endings,
}: {
  game: Game
  courts: Court[]
  endings: Ending[]
}) {
  const brief = briefingCopy(game)
  if (!brief.enabled) return null

  const name = game.shortTitle || game.title
  const hasClock = (game.features ?? []).includes('run-checker')

  const cheapest = [...courts].sort((a, b) => (a.activityCount ?? 99) - (b.activityCount ?? 99))[0]
  const totalActivities = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)
  const neededActivities = courts.reduce(
    (sum, court) =>
      sum + Math.ceil(((court.activityCount ?? 0) * (court.angerThresholdPct ?? 75)) / 100),
    0,
  )

  /*
    Every number a take quotes arrives here, not in the take.

    "There are 42 across the three courts" typed into a textarea is a sentence
    that goes wrong the week somebody corrects a court's activity count, and it
    goes wrong silently — the page still reads perfectly. So the editable string
    carries {activities} and the arithmetic stays where the records are.
  */
  const tokens = {
    game: name,
    cheapest: cheapest?.title,
    courtSizes: courts.map((court) => `${court.title} has ${court.activityCount}`).join(', '),
    courts: courts.length,
    activities: totalActivities,
    needed: neededActivities,
    endings: endings.length,
  }

  const takes = brief.takes ?? []

  return (
    <>
      {hasClock ? (
        <section className="clock-strip">
          <div className="strip" aria-hidden="true">
            {Array.from({ length: TOTAL_DAYS }).map((_, index) => (
              <div className="col" key={index}>
                <div className="d" />
                <div className="n" />
              </div>
            ))}
          </div>
          <div className="strip-ruler">
            <span>Day 1</span>
            <span>10</span>
            <span>20</span>
            <span>{TOTAL_DAYS}</span>
          </div>
          <p className="note">
            {TOTAL_DAYS} days &times; {SEGMENTS_PER_PHASE * 2} segments = {TOTAL_SEGMENTS}. The clock
            only moves when you take an action marked with an hourglass; walking, fast travel,
            looting and combat are free.
          </p>
        </section>
      ) : null}

      <div className="split">
        <div className="stack">
          {takes.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>{copy(brief.heading, 'If you are starting now', tokens)}</h2>
                <span className="eyebrow">{copy(brief.eyebrow, 'Our read', tokens)}</span>
              </div>
              <p className="note">
                {copy(
                  brief.lede,
                  'Opinions, not facts. The reasoning is shown so you can disagree with it.',
                  tokens,
                )}
              </p>

              {takes.map((take) => (
                <div className="take" key={take.id ?? take.claim}>
                  <span className="who">{copy(take.who, take.who, tokens)}</span>
                  <h3>{copy(take.claim, take.claim, tokens)}</h3>
                  {take.reasoning ? <p>{copy(take.reasoning, take.reasoning, tokens)}</p> : null}
                </div>
              ))}
            </section>
          ) : null}

          {endings.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>{copy(brief.endingsHeading, 'The {endings} endings', tokens)}</h2>
                <Link href="/endings" className="cta">
                  Full detail
                </Link>
              </div>
              <p className="note">
                {copy(
                  brief.endingsNote,
                  'Most are decided at the finale and cannot be lost early. The rest are gated on chains you finish long before you get there.',
                  tokens,
                )}
              </p>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ending</th>
                      <th>Decided by</th>
                      <th>Loseable early?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endings.map((ending) => (
                      <tr key={ending.id}>
                        <td>
                          <span className="cell-name">
                            <Icon
                              name={
                                ending.gate === 'ally'
                                  ? 'person'
                                  : ending.gate === 'clock'
                                    ? 'hourglass'
                                    : 'crown'
                              }
                              size={16}
                              className="ic"
                            />
                            <Link href={`/endings/${ending.slug}`}>{ending.title}</Link>
                          </span>
                        </td>
                        <td>{GATE_SHORT[ending.gate] ?? ending.gate}</td>
                        <td>{ending.gate === 'ally' ? 'Yes — plan ahead' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  )
}
