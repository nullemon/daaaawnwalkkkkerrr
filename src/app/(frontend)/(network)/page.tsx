import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { WikiCard } from '@/components/WikiCard'
import { EntityCard } from '@/components/EntityCard'
import { directory } from '@/lib/directory'
import { getAllAcrossGames, getSiteSettings, gameUrl } from '@/lib/payload'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()
  return {
    title: `${settings.siteName} — game wikis, guides and databases`,
    description:
      settings.description ||
      'Wikis and guides for the games worth playing carefully. Every figure carries a confidence rating, and where sources disagree we say so rather than picking one.',
    alternates: { canonical: '/' },
  }
}

/**
 * The hub.
 *
 * What makes this a network rather than seven unrelated sites. It does three
 * things, in the order a first-time visitor needs them: shows what wikis exist
 * and how big they are, surfaces the newest writing from across all of them,
 * and says plainly what the house rules are — because the pitch here is
 * accuracy, and a reader has no reason to believe that until it is spelled out
 * and then visibly kept.
 */
export default async function HubHome() {
  const [settings, wikis] = await Promise.all([getSiteSettings(), directory()])

  // The newest writing anywhere on the network. This is the cross-linking the
  // hub exists for: a reader who arrived for one game leaves knowing there are
  // six others, and a new wiki gets its first traffic from here.
  const recent = (await getAllAcrossGames('guides', { depth: 1, sort: '-updatedAt', limit: 8 }))
    .slice(0, 8)

  const latest = await Promise.all(
    recent.map(async ({ doc, game }) => ({
      id: `${game.slug}-${doc.id}`,
      title: doc.title,
      href: `${await gameUrl(game)}/guides/${doc.slug}`,
      summary: doc.summary,
      game: game.shortTitle || game.title,
    })),
  )

  const totalPages = wikis.reduce((sum, wiki) => sum + wiki.pages, 0)
  const live = wikis.filter((wiki) => wiki.game.status !== 'archived').length

  return (
    <>
      <PageHeader
        eyebrow={settings.tagline}
        title={settings.siteName}
        lede={
          settings.description ||
          'Wikis for games that reward being played carefully — with the numbers sourced, the gaps admitted, and nothing invented to fill them.'
        }
        crumbs={[]}
      />

      <div className="page body-main">
        <section className="section">
          <div className="section-head">
            <h2>The wikis</h2>
            <p className="note">
              {live} {live === 1 ? 'wiki' : 'wikis'}, {totalPages.toLocaleString('en-GB')} pages.
              Counted from the database when this page was built, not typed in.
            </p>
          </div>
          <div className="tilegrid">
            {wikis.map((entry) => (
              <WikiCard key={entry.game.id} entry={entry} />
            ))}
          </div>
        </section>

        {latest.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Latest across the network</h2>
              <p className="note">New and recently revised guides, from every wiki.</p>
            </div>
            <div className="grid">
              {latest.map((item) => (
                <EntityCard
                  key={item.id}
                  href={item.href}
                  title={item.title}
                  summary={item.summary}
                  icon="book"
                  badges={<span className="chip">{item.game}</span>}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="section">
          <div className="section-head">
            <h2>How these are written</h2>
          </div>
          <div className="prose">
            <p>
              Four rules, kept on every wiki here. They are the whole reason to read one of
              these instead of the bigger site that already ranks above it.
            </p>
            <p>
              <strong>Nothing is invented.</strong> Every figure comes from a source, carries a
              confidence rating, and can be traced. A record with no source does not get
              published.
            </p>
            <p>
              <strong>Unknown is not zero.</strong> Where nobody has published a number, the page
              says so. A blank is honest; a plausible-looking figure that turns out to be a guess
              costs a reader a playthrough.
            </p>
            <p>
              <strong>Disagreements are recorded, not resolved.</strong> Where two guides give
              different answers, both appear. Picking one silently would hide exactly the thing a
              careful reader came here to find out.
            </p>
            <p>
              <strong>The prose is ours.</strong> Facts are free to compile. Sentences are not.
              Nothing here is pasted from another site.
            </p>
            <p>
              <Link href="/wikis">Browse all wikis</Link> · <Link href="/authors">Contributors</Link>
            </p>
          </div>
        </section>
      </div>
    </>
  )
}
