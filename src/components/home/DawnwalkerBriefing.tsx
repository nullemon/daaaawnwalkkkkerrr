import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { SEGMENTS_PER_PHASE, TOTAL_DAYS, TOTAL_SEGMENTS } from '@/lib/segments'
import type { Court, Ending } from '@/payload-types'

/**
 * The parts of the wiki home that are about Dawnwalker specifically.
 *
 * These used to be the home page. That worked while there was one wiki, and
 * became actively wrong with seven: the thirty-day clock, the three courts and
 * the reading of which vassal to fight first are facts about one game, and on
 * the Onimusha wiki they were a strip of empty boxes above a paragraph naming
 * characters from a different game.
 *
 * So they live here and render only when the game has the data. Nothing about
 * this is a special case for Dawnwalker by name — the briefing appears for any
 * game with courts and endings catalogued, which today is one game and is
 * meant to be the pattern rather than the exception. Every wiki should
 * eventually have a page like this, about its own systems.
 */

const GATE_SHORT: Record<string, string> = {
  ally: 'Ally chain',
  choice: 'Finale choice',
  clock: 'The clock',
}

export function DawnwalkerBriefing({
  courts,
  endings,
}: {
  courts: Court[]
  endings: Ending[]
}) {
  const cheapest = [...courts].sort((a, b) => (a.activityCount ?? 99) - (b.activityCount ?? 99))[0]
  const totalActivities = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)
  const neededActivities = courts.reduce(
    (sum, court) =>
      sum + Math.ceil(((court.activityCount ?? 0) * (court.angerThresholdPct ?? 75)) / 100),
    0,
  )

  return (
    <>
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
          only moves when you take an action marked with an hourglass; walking, fast travel, looting
          and combat are free.
        </p>
      </section>

      <div className="split">
        <div className="stack">
          {courts.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>If you are starting now</h2>
                <span className="eyebrow">Our read</span>
              </div>
              <p className="note">
                Opinions, not facts. The reasoning is shown so you can disagree with it.
              </p>

              <div className="take">
                <span className="who">Court order</span>
                <h3>Fight {cheapest?.title ?? 'the smallest court'} first.</h3>
                <p>
                  The duel unlocks at roughly three quarters of a vassal&rsquo;s Court Activities,
                  and the courts are not the same size:{' '}
                  {courts.map((court, index) => (
                    <span key={court.id}>
                      {index > 0 ? ', ' : ''}
                      {court.title} has {court.activityCount}
                    </span>
                  ))}
                  . A proportional threshold on a smaller court is simply less work, so{' '}
                  {cheapest?.title} is the cheapest duel to reach &mdash; and clearing one court
                  early tells you what the other two will cost.
                </p>
              </div>

              <div className="take">
                <span className="who">Ally chains</span>
                <h3>Commit to Crake early, or write him off.</h3>
                <p>
                  Crake&rsquo;s chain runs eight quests and each appears only after the previous
                  closes. You cannot parallelise it and you cannot compress it, which makes it the
                  one thing on this list a late run genuinely cannot buy back. Lacra&rsquo;s chain is
                  shorter but almost entirely night-locked, so taking it commits your nights and
                  leaves your days as the flexible half.
                </p>
              </div>

              <div className="take">
                <span className="who">Budget</span>
                <h3>Do not clear every Court Activity.</h3>
                <p>
                  There are {totalActivities} across the three courts and you need roughly{' '}
                  {neededActivities}. That gap is the largest single saving available to a tight run,
                  and most walkthroughs will happily march you through all of them.
                </p>
              </div>
            </section>
          ) : null}

          {endings.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>The {endings.length} endings</h2>
                <Link href="/endings" className="eyebrow">
                  Full detail
                </Link>
              </div>
              <p className="note">
                Most are decided at the finale and cannot be lost early. The rest are gated on chains
                you finish long before you get there.
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
