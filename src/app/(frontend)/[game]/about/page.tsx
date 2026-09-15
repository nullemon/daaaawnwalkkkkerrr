import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { getAll, getGame, getSiteSettings } from '@/lib/payload'
import type { Guide } from '@/payload-types'
import { hub } from '@/lib/urls'

type Props = { params: Promise<{ game: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const doc = await getGame(slug)
  const name = doc?.shortTitle || doc?.title || 'this wiki'
  return {
    title: `About the ${name} wiki`,
    description:
      'Who runs this site, where the facts come from, what the confidence ratings mean, and what we deliberately do not claim to know.',
    alternates: { canonical: '/about' },
  }
}

export default async function AboutPage({ params }: Props) {
  const { game } = await params
  const settings = await getSiteSettings()

  /*
    Counted at build time rather than written into the copy. An about page that
    claims a number the database has since outgrown is the same failure as a
    guide quoting a figure nobody published — and this is the page where a
    reader is deciding whether to trust the rest.
  */
  const [quests, items, activities, regions, characters, guides, authors] = await Promise.all([
    getAll('quests', { game, depth: 0 }),
    getAll('items', { game, depth: 0 }),
    getAll('court-activities', { game, depth: 0 }),
    getAll('regions', { game, depth: 0 }),
    getAll('characters', { game, depth: 0 }),
    getAll('guides', { game, depth: 0 }),
    getAll('authors', { depth: 0 }),
  ])

  const costed = quests.filter((quest) => quest.time?.known).length

  const team: RelatedItem[] = authors.map((author) => ({
    id: author.id,
    title: author.name,
    href: `/authors/${author.slug}`,
    sub: author.role,
  }))

  return (
    <>
      <PageHeader
        eyebrow="About"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]}
        icon="book"
        title="About the Dawnwalker Guide"
        lede="A run planner and database for The Blood of Dawnwalker, built around the one constraint the game never lets you forget: you have 480 segments and you cannot have them back."
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            <div className="prose">
              <h2>What this site is for</h2>
              <p>
                Most guides for an open-world game are written as if you will eventually do
                everything. This one is not, because in this game you will not. Thirty days, sixteen
                segments each, and when the budget is gone the story ends whether or not you were
                ready. Two of the seven endings are lost by players who never knew they were on a
                clock.
              </p>
              <p>
                So the question this site is built to answer is not &ldquo;how do I do this
                quest&rdquo; but &ldquo;what can I still reach from where I actually am&rdquo;. The{' '}
                <Link href="/tools/run-checker">run checker</Link> walks every ending&rsquo;s
                prerequisite chain against the segments you have left. The{' '}
                <Link href="/tools/build-planner">build planner</Link> does the same for a spec.
                Everything else on the site exists to feed those two.
              </p>

              <h2>Who runs it</h2>
              <p>
                The Dawnwalker Guide is published by {settings.legalEntity ?? 'CWMI Group'}, a
                digital agency operating since 2013 with offices in the Philippines, India and the
                United States. The site is an independent fan project: it is not affiliated with
                Rebel Wolves or Bandai Namco Entertainment, and no endorsement is claimed or
                implied.
              </p>
              <p>
                Editorial decisions are made by the contributors listed here, not by the publisher,
                and nothing on the site is paid placement. If that ever changes it will be marked on
                the page it affects.
              </p>

              <h2>Where the facts come from</h2>
              <p>
                Every record cites its sources with the date we read them, and the importer that
                builds this database rejects any record that arrives without one. We compile facts
                from public wikis, guides and reporting, then write our own prose. We never copy
                text or reproduce another site&rsquo;s tables. Facts are not anyone&rsquo;s
                property; the way they were written up is.
              </p>
              <p>
                We do not have privileged access to the game. Nothing here has been verified against
                a running copy, which is exactly why every record carries a confidence rating rather
                than presenting everything with the same certainty.
              </p>

              <h2>What the confidence ratings mean</h2>
              <ul>
                <li>
                  <strong>High</strong> — agreed by multiple independent sources.
                </li>
                <li>
                  <strong>Medium</strong> — one good source, or sources that disagree on detail.
                </li>
                <li>
                  <strong>Low</strong> — contested, inferred, or not confirmed anywhere we trust.
                </li>
              </ul>
              <p>
                These are not decoration. Published quest counts for this game vary widely depending
                on who is counting and what they count as a quest, and at least one ally questline
                is described with a different length and a different final quest name depending on
                the site. Where sources conflict we record the conflict on the page rather than pick
                a winner.
              </p>

              <h2>What we deliberately do not claim to know</h2>
              <p>
                Per-quest segment costs. Only {costed} of {quests.length} quests have a figure we
                can stand behind, and the rest are stored as unknown rather than as zero. An unknown
                cost is not a free quest, and a planner that quietly treated it as one would be
                worse than no planner — so the run checker reports any total containing one as a
                floor rather than a figure.
              </p>
              <p>
                The same rule applies everywhere else. A region we cannot source is left blank, an
                item whose location nobody publishes says so, and a picture is never captioned with
                a place unless a source names it. A gap is honest; an invented number is not.
              </p>

              <h2>Corrections</h2>
              <p>
                If you have the game in front of you and can confirm or contradict something here,{' '}
                <Link href="/corrections">tell us</Link>. Corrections go to a review queue and are
                read. Being wrong in public and fixing it quickly is the only way a site compiled
                from second-hand sources earns any trust at all.
              </p>
            </div>
          </div>

          <div className="stack">
            <FactPanel
              title="In the database"
              facts={[
                { label: 'Quests', value: quests.length },
                { label: 'With a costed time', value: `${costed} of ${quests.length}` },
                { label: 'Court Activities', value: activities.length },
                { label: 'Items', value: items.length },
                { label: 'Characters', value: characters.length },
                { label: 'Regions', value: regions.length },
                { label: 'Guides', value: guides.length },
              ]}
            />

            <RelatedList heading="Contributors" icon="person" items={team} />

            <section className="panel">
              <div className="panel-head">
                <h2>Get in touch</h2>
              </div>
              {settings.contactEmail ? (
                <p>
                  <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
                </p>
              ) : null}
              {settings.postalAddress ? (
                <p className="note" style={{ whiteSpace: 'pre-line' }}>
                  {settings.postalAddress}
                </p>
              ) : null}
              <p className="note">
                <a href={hub('/contact')}>Full contact details</a> ·{' '}
                <a href={hub('/privacy')}>Privacy</a> · <a href={hub('/terms')}>Terms</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  )
}
