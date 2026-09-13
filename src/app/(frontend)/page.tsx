import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { getAll, getSiteSettings } from '@/lib/payload'
import { SEGMENTS_PER_PHASE, TOTAL_DAYS, TOTAL_SEGMENTS } from '@/lib/segments'
import type { Court, Ending, Mechanic, Quest, Region } from '@/payload-types'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const GATE_SHORT: Record<string, string> = {
  ally: 'Ally chain',
  choice: 'Finale choice',
  clock: 'The clock',
}

export default async function Home() {
  const settings = await getSiteSettings()
  const [endings, quests, regions, mechanics, courts] = await Promise.all([
    getAll<Ending>('endings', { depth: 0 }),
    getAll<Quest>('quests', { depth: 0 }),
    getAll<Region>('regions', { depth: 0 }),
    getAll<Mechanic>('mechanics', { depth: 0, sort: 'order' }),
    getAll<Court>('courts', { depth: 0 }),
  ])

  const cheapest = [...courts].sort(
    (a, b) => (a.activityCount ?? 99) - (b.activityCount ?? 99),
  )[0]
  const totalActivities = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)
  const neededActivities = courts.reduce(
    (sum, court) => sum + Math.ceil(((court.activityCount ?? 0) * (court.angerThresholdPct ?? 75)) / 100),
    0,
  )

  return (
    <>
      <PageHeader
        eyebrow="The Blood of Dawnwalker"
        title={settings.heroHeading || 'You have 480 segments. Spend them well.'}
        lede={settings.heroSubheading}
      />
      <div className="page body-main">
        <section className="clock-strip">
          <div className="strip" aria-hidden="true">
            {Array.from({ length: TOTAL_DAYS }).map((_, index) => (
              <div className="col" key={index}>
                <div className="d" />
                <div className="n" />
              </div>
            ))}
          </div>
          <div className="strip-ruler mono">
            <span>Day 1</span>
            <span>10</span>
            <span>20</span>
            <span>{TOTAL_DAYS}</span>
          </div>
          <p className="note">
            {TOTAL_DAYS} days × {SEGMENTS_PER_PHASE * 2} segments = {TOTAL_SEGMENTS}. Eight daylight,
            eight night. The clock only moves when you take an action marked with an hourglass;
            walking, fast travel, looting and combat are all free.
          </p>
        </section>

        <div className="split">
          <div className="stack">
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
                <h3>Fight {cheapest?.title ?? 'Bakir'} first.</h3>
                <p>
                  The duel unlocks at roughly three quarters of a vassal&rsquo;s Court Activities,
                  and the courts are not the same size:{' '}
                  {courts.map((court, index) => (
                    <span key={court.id}>
                      {index > 0 ? ', ' : ''}
                      {court.title} has {court.activityCount}
                    </span>
                  ))}
                  . A proportional threshold on a smaller court is simply less work.{' '}
                  {cheapest?.title} is the cheapest of the three duels to reach, and clearing one
                  court early tells you how expensive the other two will be.
                </p>
              </div>

              <div className="take">
                <span className="who">Ally chains</span>
                <h3>Commit to Crake early, or write him off.</h3>
                <p>
                  Crake&rsquo;s chain runs eight quests and each one only appears after the previous
                  closes. You cannot run them in parallel and you cannot compress them. That makes
                  it the one thing on this list that a late run genuinely cannot buy back, however
                  many segments are left. Lacra&rsquo;s chain is shorter but nearly all of it is
                  night-locked, so taking it commits your nights and leaves your days as the
                  flexible half of the budget.
                </p>
              </div>

              <div className="take">
                <span className="who">Budget</span>
                <h3>Do not clear every Court Activity.</h3>
                <p>
                  There are {totalActivities} across the three courts and you need roughly{' '}
                  {neededActivities}. That gap is the largest single saving available to a tight
                  run, and most walkthroughs will happily march you through all of them.
                </p>
              </div>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>The seven endings</h2>
                <Link href="/endings" className="eyebrow">
                  Full detail
                </Link>
              </div>
              <p className="note">
                Five are decided at the finale and cannot be lost early. Two are gated on chains you
                finish long before you get there. Those two are what the run checker is for.
              </p>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ending</th>
                      <th>Decided by</th>
                      <th>Can you lose it early?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endings.map((ending) => (
                      <tr key={ending.id}>
                        <td>
                          <Link href={`/endings/${ending.slug}`}>{ending.title}</Link>
                        </td>
                        <td>{GATE_SHORT[ending.gate] ?? ending.gate}</td>
                        <td>{ending.gate === 'ally' ? 'Yes — plan ahead' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="rail">
            <div className="rail-block">
              <h2>Start here</h2>
              <ul className="linklist">
                <li>
                  <Link href="/tools/run-checker">Run checker</Link>
                  <span className="meta">tool</span>
                </li>
                <li>
                  <Link href="/mechanics/the-clock">How the clock works</Link>
                  <span className="meta">mechanic</span>
                </li>
                <li>
                  <Link href="/quests">Quest database</Link>
                  <span className="meta">{quests.length}</span>
                </li>
                <li>
                  <Link href="/court">The three courts</Link>
                  <span className="meta">{totalActivities}</span>
                </li>
                <li>
                  <Link href="/regions">Vale Sangora</Link>
                  <span className="meta">{regions.length}</span>
                </li>
              </ul>
            </div>

            <div className="rail-block">
              <h2>Systems</h2>
              <ul className="linklist">
                {mechanics.map((mechanic) => (
                  <li key={mechanic.id}>
                    <Link href={`/mechanics/${mechanic.slug}`}>{mechanic.title}</Link>
                    <span className="meta">
                      <Confidence level={mechanic.confidence} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rail-block">
              <h2>What we do not know</h2>
              <p className="note">
                No reliable per-quest segment costs exist in public sources, so we publish none. The
                checker counts what it knows and says what it does not. Published quest totals for
                this game range from 128 to 233 depending on who is counting, and one ally chain is
                documented under two different names.
              </p>
              <p className="note">
                <Link href="/about">How the data is built</Link> ·{' '}
                <Link href="/corrections">Report an error</Link>
              </p>
            </div>

            {settings.maintainer || settings.lastVerified ? (
              <div className="masthead">
                {settings.maintainer ? <span>Maintained by {settings.maintainer}</span> : null}
                {settings.lastVerified ? (
                  <span>Data last checked {String(settings.lastVerified).slice(0, 10)}</span>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  )
}
