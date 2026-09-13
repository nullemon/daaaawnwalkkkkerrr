import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Confidence } from '@/components/Badges'
import { Icon } from '@/components/Icon'
import { getAll, getSiteSettings } from '@/lib/payload'
import { SEGMENTS_PER_PHASE, TOTAL_DAYS, TOTAL_SEGMENTS } from '@/lib/segments'
import type { Court, Ending, Item, Mechanic, Perk, Quest, Region } from '@/payload-types'

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
  const [endings, quests, regions, mechanics, courts, items, perks] = await Promise.all([
    getAll<Ending>('endings', { depth: 0 }),
    getAll<Quest>('quests', { depth: 0 }),
    getAll<Region>('regions', { depth: 0 }),
    getAll<Mechanic>('mechanics', { depth: 0, sort: 'order' }),
    getAll<Court>('courts', { depth: 0 }),
    getAll<Item>('items', { depth: 0 }),
    getAll<Perk>('perks', { depth: 0 }),
  ])

  const cheapest = [...courts].sort((a, b) => (a.activityCount ?? 99) - (b.activityCount ?? 99))[0]
  const totalActivities = courts.reduce((sum, court) => sum + (court.activityCount ?? 0), 0)
  const neededActivities = courts.reduce(
    (sum, court) => sum + Math.ceil(((court.activityCount ?? 0) * (court.angerThresholdPct ?? 75)) / 100),
    0,
  )
  const costed = quests.filter((quest) => quest.time?.known).length

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

        <div className="split">
          <div className="stack">
            <section className="section">
              <div className="section-head">
                <h2>If you are starting now</h2>
                <span className="eyebrow">Our read</span>
              </div>
              <p className="note">Opinions, not facts. The reasoning is shown so you can disagree with it.</p>

              <div className="take">
                <span className="who">Court order</span>
                <h3>Fight {cheapest?.title ?? 'Bakir'} first.</h3>
                <p>
                  The duel unlocks at roughly three quarters of a vassal&rsquo;s Court Activities, and
                  the courts are not the same size:{' '}
                  {courts.map((court, index) => (
                    <span key={court.id}>
                      {index > 0 ? ', ' : ''}
                      {court.title} has {court.activityCount}
                    </span>
                  ))}
                  . A proportional threshold on a smaller court is simply less work, so{' '}
                  {cheapest?.title} is the cheapest duel to reach &mdash; and clearing one court early
                  tells you what the other two will cost.
                </p>
              </div>

              <div className="take">
                <span className="who">Ally chains</span>
                <h3>Commit to Crake early, or write him off.</h3>
                <p>
                  Crake&rsquo;s chain runs eight quests and each appears only after the previous
                  closes. You cannot parallelise it and you cannot compress it, which makes it the one
                  thing on this list a late run genuinely cannot buy back. Lacra&rsquo;s chain is
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

            <section className="section">
              <div className="section-head">
                <h2>The seven endings</h2>
                <Link href="/endings" className="eyebrow">
                  Full detail
                </Link>
              </div>
              <p className="note">
                Five are decided at the finale and cannot be lost early. Two are gated on chains you
                finish long before you get there.
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
                              name={ending.gate === 'ally' ? 'person' : ending.gate === 'clock' ? 'hourglass' : 'crown'}
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
          </div>

          <aside className="rail">
            <div className="rail-block">
              <h2>Tools</h2>
              <ul className="linklist">
                <li>
                  <Link href="/tools/run-checker">
                    <Icon name="hourglass" size={15} className="ic" />
                    Run checker
                  </Link>
                  <span className="meta">what can you still reach</span>
                </li>
                <li>
                  <Link href="/tools/build-planner">
                    <Icon name="star" size={15} className="ic" />
                    Build planner
                  </Link>
                  <span className="meta">{perks.length} perks</span>
                </li>
                <li>
                  <Link href="/search">
                    <Icon name="search" size={15} className="ic" />
                    Search everything
                  </Link>
                  <span className="meta" />
                </li>
              </ul>
            </div>

            <div className="rail-block">
              <h2>Database</h2>
              <ul className="linklist">
                <li>
                  <Link href="/quests">
                    <Icon name="scroll" size={15} className="ic" />
                    Quests
                  </Link>
                  <span className="meta">{quests.length}</span>
                </li>
                <li>
                  <Link href="/items">
                    <Icon name="sword" size={15} className="ic" />
                    Items
                  </Link>
                  <span className="meta">{items.length}</span>
                </li>
                <li>
                  <Link href="/perks">
                    <Icon name="star" size={15} className="ic" />
                    Perks
                  </Link>
                  <span className="meta">{perks.length}</span>
                </li>
                <li>
                  <Link href="/court-activities">
                    <Icon name="crown" size={15} className="ic" />
                    Court Activities
                  </Link>
                  <span className="meta">{totalActivities}</span>
                </li>
                <li>
                  <Link href="/enemies">
                    <Icon name="skull" size={15} className="ic" />
                    Enemies
                  </Link>
                  <span className="meta">bosses</span>
                </li>
                <li>
                  <Link href="/regions">
                    <Icon name="map" size={15} className="ic" />
                    Regions
                  </Link>
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
                Only {costed} of {quests.length} quests have a segment cost anyone has published, so
                the run checker reports totals as a floor and says so. Published quest counts for
                this game range from 128 to 233 depending on who is counting.
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
                  <span>Checked {String(settings.lastVerified).slice(0, 10)}</span>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  )
}
