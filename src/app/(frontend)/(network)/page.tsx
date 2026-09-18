import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/Icon'
import { Logo } from '@/components/Logo'
import { WikiCard } from '@/components/WikiCard'
import { HubSearch, type HubTarget } from '@/components/HubSearch'
import { ImageCredit } from '@/components/ImageCredit'
import { directory, releaseLine } from '@/lib/directory'
import { whatPeopleAreAsking } from '@/lib/asking'
import { getAllAcrossGames, getSiteSettings, gameUrl } from '@/lib/payload'
import { copy } from '@/lib/copy'
import { JsonLd } from '@/components/JsonLd'
import { itemList, networkOrganization, webSite } from '@/lib/schema'
import { HUB_ORIGIN } from '@/lib/urls'
import { socialMeta } from '@/lib/social'

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const [settings, wikis] = await Promise.all([getSiteSettings(), directory()])
  const total = wikis.reduce((sum, wiki) => sum + wiki.pages, 0)

  return {
    title: `${settings.siteName} — ${copy(settings.metaTitleSuffix, 'game wikis, guides and databases')}`,
    /*
      The counts are tokens, not typed-in numbers. This sentence is what a
      search result shows, so a hardcoded "eight wikis" would be the network
      advertising a figure that went stale the day a ninth was added — on the
      one site whose pitch is that its numbers are real.
    */
    description:
      settings.description ||
      copy(
        settings.metaDescriptionFallback,
        '{wikis} game wikis and {pages} sourced pages. Every figure carries a confidence rating, and where sources disagree we say so rather than picking one.',
        { wikis: wikis.length, pages: total },
      ),
    alternates: { canonical: '/' },
    ...(await socialMeta(parent, { path: '/' })),
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

/*
  The icons an editor may choose for a rule.

  The select in `SiteSettings` offers a subset of `IconName`, so today every
  stored value is a legal one — but the value arrives from the database as a
  string, and a select option renamed in the schema leaves the old string in
  the row. `Icon` renders nothing at all for a name it does not know, so the
  failure is a rule with a blank square beside it and no error anywhere. This
  checks the value instead of asserting it.
*/
const RULE_ICONS = [
  'check', 'warn', 'scroll', 'book', 'star', 'search', 'shield', 'spark', 'lock', 'hourglass',
] as const satisfies readonly IconName[]

const ruleIcon = (name: string | null | undefined): IconName =>
  (RULE_ICONS as readonly string[]).includes(name ?? '') ? (name as IconName) : 'check'

/*
  Spelled out, because the sentence it fills is English prose.

  The rules are an editable array now, so the note above them cannot say
  "Four" in code: an editor who adds a fifth would have the page announce four
  rules directly above five of them. Past twelve it falls back to digits,
  which is well past the point where a list of house rules is still a list of
  house rules.
*/
const COUNT_WORDS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
]
const spellCount = (count: number): string => COUNT_WORDS[count] ?? String(count)

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

  /*
    Whose key art fronts the network.

    `wikis[0]` was the whole of this, and `directory()` sorts biggest wiki
    first — so the one photograph a first-time reader sees was picked by a
    page count. The largest wiki is Zero Company, whose hero file has a
    greyscale mean of 11.5 of 255 (measured across all eight with `sharp`;
    Dawnwalker's is 116.3). That is the "homepage seems so dark" complaint,
    and it is not in the stylesheet: no scrim recovers detail the file has
    never had, and a brightness filter on somebody else's key art invents an
    exposure they did not shoot.

    So it is a field. Blank still means `wikis[0]`, per `docs/COPY.md` — a
    blank record renders the site the code does — and an id that no longer
    matches a published wiki falls back the same way rather than dropping the
    art, because a game can be unpublished long after somebody chose it here.
  */
  const featured = wikis.find((entry) => entry.game.id === settings.heroWiki) ?? wikis[0]
  const heroArt =
    featured && typeof featured.game.theme?.hero === 'object' ? featured.game.theme.hero : null

  /*
    The editor's rules if there are any, otherwise the four that shipped.

    A half-filled array is not a reason to fall back — `heading` and `body`
    are both required in the schema, so a row that exists is a row with words
    in it. An empty array is the blank that means "use the built-in", the same
    as an empty string everywhere else.
  */
  const stored = settings.rules ?? []
  const rules =
    stored.length > 0
      ? stored.map((rule) => ({
          icon: ruleIcon(rule.icon),
          heading: rule.heading,
          body: rule.body,
        }))
      : RULES

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
      {/*
        The root of the whole graph.

        `networkOrganization` is the one entity every host's `WebSite` points at
        through `publisher`, so the eight wikis, the companies host and the
        people host are readable as one publication rather than ten unrelated
        sites that happen to share a domain.
      */}
      <JsonLd
        data={networkOrganization({
          name: settings.siteName,
          legalEntity: settings.legalEntity,
          email: settings.contactEmail,
        })}
      />
      {/*
        No `searchPath` here, unlike a wiki's.

        `webSite` turns one into a `SearchAction` whose `urlTemplate` is
        `<host>/search?q={term}` - the sitelinks search box. A wiki has a
        `/search` page and that template resolves. The hub does not: `search`
        is reserved in `APEX_ONLY` so it is never read as a game slug, but no
        route was ever written behind it, and the apex answers /search with a
        404. The hub's search is `HubSearch` on this page, which is client
        state with no query parameter to point at.

        So this was a machine-readable promise to every crawler that reads it,
        redeemable at a URL that does not exist - and nothing on the page looks
        wrong, because JSON-LD is invisible. Claim it again when there is a
        page to claim.
      */}
      <JsonLd
        data={webSite(HUB_ORIGIN, {
          name: settings.siteName,
          description: settings.heroSubheading || settings.description,
        })}
      />
      <JsonLd
        data={itemList(
          HUB_ORIGIN,
          wikis.map((entry) => ({
            name: entry.game.shortTitle || entry.game.title,
            url: entry.url,
          })),
          { name: copy(settings.directoryHeading, 'Every wiki') },
        )}
      />
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
            {settings.heroHeading || 'Guides and databases for the games you are playing.'}
          </h1>
          {/*
            `heroSubheading`, not `description`. The lede was reading the meta
            description — a line written for a search result, shown to someone
            who has already arrived — while the Hero subheading field sat in
            the admin being edited to no effect at all.
          */}
          <p className="hub-lede">
            {settings.heroSubheading ||
              settings.description ||
              'Every figure sourced, every gap admitted. Start with a search, or pick a wiki below.'}
          </p>

          <HubSearch
            targets={targets}
            placeholder={copy(
              settings.searchPlaceholder,
              'Search the network — a game, a boss, a guide…',
            )}
          />

          {/* Labels only. The figures under them are counted at build time and
              have no field anywhere in the admin, which is the point of them. */}
          <dl className="hub-stats">
            <div>
              <dt>{copy(settings.statWikisLabel, 'Wikis')}</dt>
              <dd>{wikis.length}</dd>
            </div>
            <div>
              <dt>{copy(settings.statPagesLabel, 'Sourced pages')}</dt>
              <dd>{totalPages.toLocaleString('en-GB')}</dd>
            </div>
            <div>
              <dt>{copy(settings.statUpcomingLabel, 'Not out yet')}</dt>
              <dd>{upcoming}</dd>
            </div>
          </dl>
        </div>

        {/*
          The credit for the picture, on the picture.

          This band has carried one publisher's key art at full bleed since
          the hub was written and credited nobody — the one page on the
          network with a photograph and no line saying whose it is, while
          every record page had one. The credit is stored on the media record
          and was simply never rendered here.
        */}
        <ImageCredit credit={heroArt?.credit} slot="band" as="p" />
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
          <section className="section section-card">
            <div className="section-head">
              <h2>{copy(settings.askingHeading, 'What people are asking')}</h2>
              <p className="note">
                {copy(
                  settings.askingNote,
                  'Real searches, harvested from Google’s own autocomplete, matched to the page that answers each. Where a question has no answer here, it is in the queue rather than filled with a guess.',
                )}
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
        <section className="section section-card">
          <div className="section-head">
            <h2>{copy(settings.directoryHeading, 'Every wiki')}</h2>
            <p className="note">
              {copy(
                settings.directoryNote,
                'Page counts are read from each database when this page is built, so they are what is actually there rather than what we would like to claim.',
              )}
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
          <section className="section section-card">
            <div className="section-head">
              <h2>{copy(settings.latestHeading, 'Newest writing')}</h2>
              {/* An action, not a label. `.eyebrow` is `--muted` and reads as
                  a caption on the heading; this is the one thing in the row a
                  reader can click. */}
              <Link href="/wikis" className="cta">
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
        <section className="section section-card">
          <div className="section-head">
            <h2>{copy(settings.rulesHeading, 'How these are written')}</h2>
            <p className="note">
              {copy(
                settings.rulesNote,
                '{count} rules, on every wiki here. They are the whole reason to read one of these instead of the bigger site that already ranks above it.',
                { count: spellCount(rules.length) },
              )}
            </p>
          </div>
          <div className="rulegrid">
            {rules.map((rule) => (
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
