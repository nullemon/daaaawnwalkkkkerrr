import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { EntityCard } from '@/components/EntityCard'
import { Confidence } from '@/components/Badges'
import { getAll, getSiteSettings } from '@/lib/payload'
import { SEGMENTS_PER_PHASE, TOTAL_DAYS, TOTAL_SEGMENTS } from '@/lib/segments'
import type { Ending, Mechanic, Quest, Region } from '@/payload-types'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

export default async function Home() {
  const settings = await getSiteSettings()
  const [endings, quests, regions, mechanics] = await Promise.all([
    getAll<Ending>('endings', { depth: 0 }),
    getAll<Quest>('quests', { depth: 0 }),
    getAll<Region>('regions', { depth: 0 }),
    getAll<Mechanic>('mechanics', { depth: 0, sort: 'order' }),
  ])

  return (
    <>
      <PageHeader
        eyebrow="The Blood of Dawnwalker"
        title={settings.heroHeading || 'You have 480 segments. Spend them well.'}
        lede={settings.heroSubheading}
      />
      <div className="page body-main">
        <section className="section">
          <div className="clock-strip">
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
              {TOTAL_DAYS} days × {SEGMENTS_PER_PHASE * 2} segments = {TOTAL_SEGMENTS}. Eight
              daylight, eight night. The clock only moves when you take an action marked with an
              hourglass — walking, fast travel, looting and combat are all free.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Start here</h2>
          </div>
          <div className="grid">
            <EntityCard
              href="/tools/run-checker"
              title="Run checker"
              summary="Tell it your day and what you have finished. It works out which endings are still reachable, which are out of time, and which you have already locked out."
            />
            <EntityCard
              href="/endings"
              title={`All ${endings.length} endings`}
              summary="Five are decided at the finale. Two are gated on questlines you finish long before you get there — those are the ones people lose without noticing."
            />
            <EntityCard
              href="/quests"
              title={`${quests.length} quests`}
              summary="Phase, prerequisites, what each one locks out, and segment cost wherever a source actually publishes one."
            />
            <EntityCard
              href="/mechanics/the-clock"
              title="How the clock works"
              summary="Why thirty days is a budget with prerequisites rather than a timer, and what actually costs you time."
            />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>The systems that decide your run</h2>
            <Link href="/mechanics" className="eyebrow">
              All mechanics
            </Link>
          </div>
          <div className="grid">
            {mechanics.slice(0, 4).map((mechanic) => (
              <EntityCard
                key={mechanic.id}
                href={`/mechanics/${mechanic.slug}`}
                title={mechanic.title}
                summary={mechanic.summary}
                badges={<Confidence level={mechanic.confidence} />}
              />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Vale Sangora</h2>
            <Link href="/regions" className="eyebrow">
              All {regions.length} regions
            </Link>
          </div>
          <div className="grid">
            {regions.slice(0, 6).map((region) => (
              <EntityCard
                key={region.id}
                href={`/regions/${region.slug}`}
                title={region.title}
                summary={region.summary}
              />
            ))}
          </div>
        </section>

        <div className="callout" data-tone="risk">
          <h3>What this site does not know yet</h3>
          <p>
            This is a new site built without access to the game. Every fact here is compiled from
            public sources, cited on the page it appears on, and rated for confidence. Per-quest
            segment costs are the big gap — nobody publishes reliable ones, so we leave them blank
            rather than invent them. <Link href="/about">More about how the data is built</Link>.
          </p>
        </div>
      </div>
    </>
  )
}
