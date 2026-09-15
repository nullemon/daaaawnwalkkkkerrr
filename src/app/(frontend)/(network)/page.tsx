import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { WikiCard } from '@/components/WikiCard'
import { EntityCard } from '@/components/EntityCard'
import { directory } from '@/lib/directory'
import { getAllAcrossGames, getSiteSettings, gameUrl } from '@/lib/payload'

export async function generateMetadata(): Promise<Metadata> {
  const [settings, wikis] = await Promise.all([getSiteSettings(), directory()])
  const total = wikis.reduce((sum, wiki) => sum + wiki.pages, 0)

  return {
    title: `${settings.siteName} — game wikis, guides and databases`,
    description:
      settings.description ||
      `${wikis.length} game wikis and ${total.toLocaleString('en-GB')} sourced pages. Every figure carries a confidence rating, and where sources disagree we say so rather than picking one.`,
    alternates: { canonical: '/' },
  }
}

/**
 * The four rules, as cards.
 *
 * These were a single column of prose, which on a wide screen left half the
 * window empty and made the most important thing on the page look like a
 * footnote. They are the pitch — the reason to read one of these wikis instead
 * of the bigger one that already ranks above it — so they get the full width
 * and an icon each.
 */
const RULES: { icon: IconName; heading: string; body: string }[] = [
  {
    icon: 'check',
    heading: 'Nothing is invented',
    body: 'Every figure comes from a source, carries a confidence rating, and can be traced back. A record with no source does not get published — the importer refuses it.',
  },
  {
    icon: 'warn',
    heading: 'Unknown is not zero',
    body: 'Where nobody has published a number, the page says so. A blank is honest. A plausible-looking figure that turns out to be a guess costs a reader a playthrough.',
  },
  {
    icon: 'scroll',
    heading: 'Disagreements are recorded',
    body: 'Where two guides give different answers, both appear, and so does the fact that they disagree. Quietly picking one hides exactly what a careful reader came to find out.',
  },
  {
    icon: 'book',
    heading: 'The prose is ours',
    body: 'Facts are free to compile; sentences are not. Nothing on this network is pasted from another site, and nothing is generated from a trailer.',
  },
]

export default async function HubHome() {
  const [settings, wikis] = await Promise.all([getSiteSettings(), directory()])

  // The newest writing anywhere on the network. This is the cross-linking the
  // hub exists for: a reader who arrived for one game leaves knowing there are
  // six others, and a new wiki gets its first traffic from here.
  const recent = await getAllAcrossGames('guides', { depth: 1, sort: '-updatedAt', limit: 8 })

  const latest = await Promise.all(
    recent.slice(0, 8).map(async ({ doc, game }) => ({
      id: `${game.slug}-${doc.id}`,
      title: doc.title,
      href: `${await gameUrl(game)}/guides/${doc.slug}`,
      summary: doc.summary,
      game: game.shortTitle || game.title,
    })),
  )

  const totalPages = wikis.reduce((sum, wiki) => sum + wiki.pages, 0)
  const live = wikis.filter((wiki) => wiki.game.status !== 'archived').length
  const upcoming = wikis.filter(
    (wiki) => wiki.game.releaseDate && new Date(wiki.game.releaseDate).getTime() > Date.now(),
  ).length

  // The biggest wiki's art carries the masthead. It changes on its own as the
  // network grows, rather than being a hardcoded favourite that goes stale.
  const featured = wikis[0]
  const heroArt =
    featured && typeof featured.game.theme?.hero === 'object' ? featured.game.theme.hero : null

  return (
    <>
      <header className="masthead">
        {heroArt?.url ? (
          <img className="masthead-art" src={heroArt.url} alt="" aria-hidden="true" />
        ) : null}

        <div className="page masthead-inner">
          <p className="masthead-wordmark">
            <span className="glyph">
              <Logo size={26} />
            </span>
            {settings.siteName}
          </p>

          <h1 className="masthead-title">
            {settings.heroHeading || 'Wikis for games that reward playing carefully.'}
          </h1>

          <p className="masthead-lede">
            {settings.description ||
              'The numbers sourced, the gaps admitted, and nothing invented to fill them.'}
          </p>

          {/*
            Counted from the database at build time. A directory that claims a
            number is a directory a reader checks once and then distrusts.
          */}
          <dl className="masthead-stats">
            <div>
              <dt>Wikis</dt>
              <dd>{live}</dd>
            </div>
            <div>
              <dt>Sourced pages</dt>
              <dd>{totalPages.toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>Games not out yet</dt>
              <dd>{upcoming}</dd>
            </div>
          </dl>

          <p className="masthead-actions">
            <Link className="button" href="/wikis">
              Browse every wiki
            </Link>
            {featured ? (
              <a className="linkish" href={featured.url}>
                Or start with {featured.game.shortTitle || featured.game.title} →
              </a>
            ) : null}
          </p>
        </div>
      </header>

      <div className="page body-main">
        <section className="section">
          <div className="section-head">
            <h2>The wikis</h2>
            <p className="note">
              Page counts are read from each database when this page is built, so they are what is
              actually there rather than what we would like to claim.
            </p>
          </div>
          <div className="tilegrid">
            {wikis.map((entry) => (
              <WikiCard key={entry.game.id} entry={entry} />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>How these are written</h2>
            <p className="note">
              Four rules, kept on every wiki here. They are the whole reason to read one of these
              instead of the bigger site that already ranks above it.
            </p>
          </div>
          <div className="rulegrid">
            {RULES.map((rule) => (
              <div key={rule.heading} className="rule">
                <span className="rule-icon">
                  <Icon name={rule.icon} size={20} />
                </span>
                <h3>{rule.heading}</h3>
                <p>{rule.body}</p>
              </div>
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
      </div>
    </>
  )
}
