import type { Metadata, ResolvingMetadata } from 'next'
import { Icon } from '@/components/Icon'
import { SiteLogo } from '@/components/SiteLogo'
import {
  Asking,
  Directory,
  Figures,
  GameLead,
  GuideLead,
  Guides,
  HomeHead,
  People,
  Studios,
} from '@/components/home/HomeSections'
import { directory } from '@/lib/directory'
import { getSiteSettings } from '@/lib/payload'
import { homeData } from '@/lib/home-data'
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
        '{wikis} game wikis and {pages} sourced pages. Every figure is cited to where it came from, and where sources disagree we say so rather than picking one.',
        { wikis: wikis.length, pages: total },
      ),
    alternates: { canonical: '/' },
    ...(await socialMeta(parent, { path: '/' })),
  }
}

/*
  The four built-in rules, the icon whitelist and `ruleIcon` moved to
  `src/lib/home-data.ts` along with everything else this page reads. They were
  the house rules written twice once `/home-preview` needed them, and a second
  copy of a sentence an editor can override is a second answer to what the
  page says.
*/

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
  /*
    One reader for everything on this screen, in `src/lib/home-data.ts`.

    It was eighty lines here until `/home-preview` needed the same figures to
    audition six layouts against. Six components reading the database
    themselves would be six chances to disagree with the page they are
    auditioning for, which is the failure `src/lib/audit.ts` was consolidated
    to end. The reasoning behind each field — why the hero art is a setting,
    why an unparseable date is no row, why an empty rules array falls back and
    a half-filled one does not — moved with it.
  */
  const data = await homeData()
  const { settings, wikis, rules, totalPages } = data
  /*
    The newest article leads, and the rest fill the guides cell. Splitting here
    rather than in the components so the lead can never also appear in the list
    below it.
  */
  const [headline, ...more] = data.latest

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
      {/* ---- The masthead ---- */}
      <header className="page home-mast">
        <p className="home-wordmark">
          <span className="glyph">
            <SiteLogo size={26} alt={settings.siteName} />
          </span>
          {settings.siteName}
        </p>
      </header>

      <HomeHead data={data} />

      {/*
        The grid.

        A game and an article at equal weight across the top, the figures as a
        band under them, then guides beside questions and studios beside
        people. Every row is two cells of equal width except the band, which
        takes all four columns — seven cells at two columns each would be
        three and a half rows, and the half is a card sitting beside a hole.

        The two hosts are on the front page for the first time here. 306 studio
        profiles and 741 people were reachable only by knowing that
        `companies.` and `people.` existed, which is the "a page nothing links
        to is the same failure as an empty sitemap" rule pointed at two whole
        hosts.
      */}
      <div className="page home-grid">
        {data.wikis[0] ? <GameLead entry={data.wikis[0]} /> : null}
        {headline ? <GuideLead entry={headline} /> : null}
        <Figures data={data} />
        <Guides data={data} entries={more} />
        <Asking data={data} />
        <Studios data={data} />
        <People data={data} />
      </div>

      <Directory data={data} />

      <div className="page body-main">
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
