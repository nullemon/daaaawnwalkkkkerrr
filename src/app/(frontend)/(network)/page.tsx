import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { WikiCard } from '@/components/WikiCard'
import { HubSearch, type HubTarget } from '@/components/HubSearch'
import { directory, releaseLine } from '@/lib/directory'
import { whatPeopleAreAsking } from '@/lib/asking'
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

const RULES: { icon: IconName; heading: string; body: string }[] = [
  {
    icon: 'check',
    heading: 'Nothing is invented',
    body: 'Every figure comes from a source and can be traced. A record with no source is refused at import.',
  },
  {
    icon: 'warn',
    heading: 'Unknown is not zero',
    body: 'Where nobody has published a number, the page says so. A plausible guess costs a reader a playthrough.',
  },
  {
    icon: 'scroll',
    heading: 'Disagreements are recorded',
    body: 'Where two sources differ, both appear. Quietly picking one hides what a careful reader came for.',
  },
  {
    icon: 'book',
    heading: 'The prose is ours',
    body: 'Facts are free to compile; sentences are not. Nothing here is pasted, and nothing is written from a trailer.',
  },
]

/**
 * The hub.
 *
 * ## The shape, and why
 *
 * The two obvious models solve different problems. Fextralife is a directory —
 * art-led cards, a reader choosing which wiki to enter. u.gg is an instrument
 * — search first, figures everywhere, nothing decorative. A hub is the first
 * problem wearing the second's clothes: the job is routing somebody to the
 * right wiki, and it should feel like a tool while it does it.
 *
 * So, in order: a search that can reach any wiki, the figures that say how big
 * this is, the directory itself, and then the one section neither model has —
 * what people are actually searching for, matched to the page that answers it.
 * That last one is the whole argument for this network on one screen.
 *
 * The house rules come last rather than first. They are the reason to trust
 * the site, but nobody arrives wanting to read a manifesto.
 */
export default async function HubHome() {
  const [settings, wikis, asking] = await Promise.all([
    getSiteSettings(),
    directory(),
    whatPeopleAreAsking(12),
  ])

  const recent = await getAllAcrossGames('guides', { depth: 1, sort: '-updatedAt', limit: 6 })
  const latest = await Promise.all(
    recent.slice(0, 6).map(async ({ doc, game }) => ({
      id: `${game.slug}-${doc.id}`,
      title: doc.title,
      href: `${await gameUrl(game)}/guides/${doc.slug}`,
      summary: doc.summary,
      wiki: game.shortTitle || game.title,
      icon: `/wiki-assets/${game.slug}/icon-32.png`,
    })),
  )

  const totalPages = wikis.reduce((sum, wiki) => sum + wiki.pages, 0)
  const upcoming = wikis.filter(
    (wiki) => wiki.game.releaseDate && new Date(wiki.game.releaseDate).getTime() > Date.now(),
  ).length

  const featured = wikis[0]
  const heroArt =
    featured && typeof featured.game.theme?.hero === 'object' ? featured.game.theme.hero : null

  /* Wikis first in search, then the headline pages of each. */
  const targets: HubTarget[] = [
    ...wikis.map((entry) => ({
      label: entry.game.shortTitle || entry.game.title,
      sub: `${entry.pages.toLocaleString('en-GB')} pages · ${entry.game.status}`,
      href: entry.url,
      icon: `/wiki-assets/${entry.game.slug}/icon-32.png`,
      kind: 'wiki' as const,
    })),
    ...latest.map((entry) => ({
      label: entry.title,
      sub: entry.wiki,
      href: entry.href,
      icon: entry.icon,
      kind: 'page' as const,
    })),
  ]

  return (
    <>
      {/* ---- Hero: art, name, search, figures ---- */}
      <header className="hub-hero">
        {heroArt?.url ? (
          <img
            className="hub-hero-art"
            src={heroArt.url}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
          />
        ) : null}

        <div className="page hub-hero-inner">
          <p className="hub-wordmark">
            <span className="glyph">
              <Logo size={28} />
            </span>
            {settings.siteName}
          </p>

          <h1 className="hub-title">
            {settings.heroHeading || 'Wikis for games that reward playing carefully.'}
          </h1>
          <p className="hub-lede">
            {settings.description ||
              'The numbers sourced, the gaps admitted, and nothing invented to fill them.'}
          </p>

          <HubSearch targets={targets} />

          <dl className="hub-stats">
            <div>
              <dt>Wikis</dt>
              <dd>{wikis.length}</dd>
            </div>
            <div>
              <dt>Sourced pages</dt>
              <dd>{totalPages.toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>Not out yet</dt>
              <dd>{upcoming}</dd>
            </div>
          </dl>
        </div>
      </header>

      {/* ---- The wiki switcher: every wiki, one row, always reachable ---- */}
      <nav className="hub-strip" aria-label="All wikis">
        <div className="page hub-strip-inner">
          {wikis.map((entry) => (
            <a key={entry.game.id} className="hub-chip" href={entry.url}>
              <img src={`/wiki-assets/${entry.game.slug}/icon-32.png`} alt="" loading="lazy" />
              <span className="hub-chip-name">{entry.game.shortTitle || entry.game.title}</span>
              <span className="hub-chip-count">{entry.pages.toLocaleString('en-GB')}</span>
            </a>
          ))}
        </div>
      </nav>

      <div className="page body-main">
        {/* ---- What people are asking: the differentiator ---- */}
        {asking.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>What people are asking</h2>
              <p className="note">
                Real searches, harvested from Google&rsquo;s own autocomplete, matched to the page
                that answers each. Where a question has no answer here, it is in the queue rather
                than filled with a guess.
              </p>
            </div>
            <ul className="asking">
              {asking.map((entry) => (
                <li key={`${entry.wikiSlug}-${entry.query}`}>
                  <a href={entry.href ?? '#'}>
                    <span className="asking-q">
                      <Icon name="search" size={14} className="ic" />
                      {entry.query}
                    </span>
                    <span className="asking-a">
                      {entry.title}
                      <span className="chip">{entry.wiki}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---- The directory ---- */}
        <section className="section">
          <div className="section-head">
            <h2>Every wiki</h2>
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

        {/* ---- Latest, as a list rather than more cards ---- */}
        {latest.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>Newest writing</h2>
              <Link href="/wikis" className="eyebrow">
                All wikis
              </Link>
            </div>
            <ul className="feed">
              {latest.map((entry) => (
                <li key={entry.id}>
                  <a href={entry.href}>
                    <img src={entry.icon} alt="" className="feed-icon" loading="lazy" />
                    <span className="feed-text">
                      <strong>{entry.title}</strong>
                      {entry.summary ? <span className="note">{entry.summary}</span> : null}
                    </span>
                    <span className="chip">{entry.wiki}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---- The rules, last ---- */}
        <section className="section">
          <div className="section-head">
            <h2>How these are written</h2>
            <p className="note">
              Four rules, on every wiki here. They are the whole reason to read one of these instead
              of the bigger site that already ranks above it.
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
      </div>
    </>
  )
}
