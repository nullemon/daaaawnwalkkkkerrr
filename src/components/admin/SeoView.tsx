import type { AdminViewServerProps, CollectionSlug, Payload } from 'payload'
import type { Game, SiteSetting } from '@/payload-types'
import { adminUrl } from '@/lib/admin-path'
import { gameUrl } from '@/lib/payload'
import { GAME_SCOPED } from '@/lib/tenancy'
import { hasWikiAssets } from '@/lib/wiki-assets'
import { demoDatesOn } from '@/lib/sitemap-dates'
import { WEBSUB_HUB } from '@/lib/websub'
import { COMPANIES_ORIGIN, HUB_ORIGIN, PEOPLE_ORIGIN } from '@/lib/urls'

/**
 * Every host this network serves, as a search engine sees it.
 *
 * The owner's question after launch is one question asked eighteen times: is
 * this host indexable, verified, measured, carrying its own card, and when did
 * it last change. The answers were on eighteen records across two collections
 * and a global, plus two environment variables and a file in `public/`. This
 * is the table.
 *
 * ## What it reads and what it does not
 *
 * Fields on the Games rows and Site settings, the icon set on disk, two
 * environment variables, and one `updatedAt` per collection. It does **not**
 * fetch any host, read any sitemap or call any search engine: a screen that
 * makes sixty requests to render would be a screen nobody opens twice, and
 * whether Google has indexed a page is Search Console's answer to give, not
 * this network's to guess. The links in the last column go to the files
 * themselves and to the scripts that do talk to the engines.
 *
 * ## The two switches that have already bitten
 *
 * `SITEMAP_DEMO_DATES` fabricates every `<lastmod>` when it is on, and it
 * used to be on by default. `INDEXNOW_PING=off` silences the publish
 * announcement. Both are read live from the environment and printed here in
 * plain words, because a switch nobody can see is a switch in the wrong
 * position.
 */

type HostRow = {
  label: string
  host: string
  kind: 'hub' | 'wiki' | 'host'
  indexable: boolean
  titleSource: string
  tokens: { google: boolean; bing: boolean; yandex: boolean }
  analytics: number
  ownCard: boolean
  feeds: boolean
  lastChange: string | null
  edit: string
}

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** The newest `updatedAt` on each wiki, from one query per collection. */
const lastChanges = async (payload: Payload): Promise<Map<string | number, string>> => {
  const latest = new Map<string | number, string>()
  await Promise.all(
    GAME_SCOPED.map(async (collection) => {
      const result = await payload.find({
        collection: collection as CollectionSlug,
        sort: '-updatedAt',
        limit: 200,
        depth: 0,
      })
      for (const doc of result.docs) {
        const row = doc as { game?: number | string | { id: number | string } | null; updatedAt?: string }
        const game = typeof row.game === 'object' && row.game ? row.game.id : row.game
        if (game === null || game === undefined || !row.updatedAt) continue
        const seen = latest.get(game)
        if (!seen || row.updatedAt > seen) latest.set(game, row.updatedAt)
      }
    }),
  )
  return latest
}

const Tok = ({ on, label }: { on: boolean; label: string }) => (
  <span className={`net-seo-tok ${on ? 'net-seo-tok--on' : ''}`} title={`${label}: ${on ? 'token set' : 'no token'}`}>
    {label}
  </span>
)

export default async function SeoView({ payload, initPageResult }: AdminViewServerProps) {
  const user = initPageResult?.req?.user
  if (user?.collection !== 'users') {
    return (
      <div className="net-seo">
        <h1 className="net-seo-title">SEO &amp; indexing</h1>
        <p className="net-seo-note">This page is for editors. Sign in with an editor account.</p>
      </div>
    )
  }

  const [games, settings, latest, companies, people] = await Promise.all([
    payload.find({ collection: 'games', depth: 0, limit: 200, sort: 'title' }),
    payload.findGlobal({ slug: 'site-settings', depth: 0 }) as Promise<SiteSetting>,
    lastChanges(payload),
    payload.find({ collection: 'companies', sort: '-updatedAt', limit: 1, depth: 0 }),
    payload.find({ collection: 'people', sort: '-updatedAt', limit: 1, depth: 0 }),
  ])

  const networkTokens = settings.verification ?? {}
  const netTok = {
    google: filled(networkTokens.google),
    bing: filled(networkTokens.bing),
    yandex: filled(networkTokens.yandex),
  }

  const rows: HostRow[] = [
    {
      label: `${settings.siteName} — the hub`,
      host: HUB_ORIGIN,
      kind: 'hub',
      indexable: true,
      titleSource: filled(settings.metaTitleSuffix) ? 'site settings' : 'composed',
      tokens: netTok,
      analytics: [settings.analytics?.ga4Id, settings.analytics?.gtmId, settings.analytics?.plausibleDomain, settings.analytics?.clarityId].filter(filled).length,
      ownCard: true,
      feeds: false,
      lastChange: null,
      edit: '/globals/site-settings',
    },
    ...(await Promise.all(
      games.docs.map(async (game: Game): Promise<HostRow> => ({
        label: game.shortTitle || game.title,
        host: await gameUrl(game),
        kind: 'wiki',
        indexable: !game.seo?.noindex && game.status !== 'planned',
        titleSource: filled(game.seo?.title) ? 'written' : 'composed from the record',
        tokens: {
          google: filled(game.verification?.google),
          bing: filled(game.verification?.bing),
          yandex: filled(game.verification?.yandex),
        },
        analytics: [game.analytics?.ga4Id, game.analytics?.gtmId, game.analytics?.plausibleDomain, game.analytics?.clarityId].filter(filled).length,
        ownCard: hasWikiAssets(game.slug),
        feeds: true,
        lastChange: latest.get(game.id) ?? null,
        edit: `/collections/games/${game.id}`,
      })),
    )),
    {
      label: 'Companies',
      host: COMPANIES_ORIGIN,
      kind: 'host',
      indexable: true,
      titleSource: 'composed',
      tokens: netTok,
      analytics: 0,
      ownCard: true,
      feeds: false,
      lastChange: (companies.docs[0] as { updatedAt?: string } | undefined)?.updatedAt ?? null,
      edit: '/globals/companies-site',
    },
    {
      label: 'People',
      host: PEOPLE_ORIGIN,
      kind: 'host',
      indexable: true,
      titleSource: 'composed',
      tokens: netTok,
      analytics: 0,
      ownCard: true,
      feeds: false,
      lastChange: (people.docs[0] as { updatedAt?: string } | undefined)?.updatedAt ?? null,
      edit: '/globals/people-site',
    },
  ]

  const unverified = rows.filter((row) => !row.tokens.google && !row.tokens.bing && !row.tokens.yandex).length
  const noCard = rows.filter((row) => !row.ownCard).length
  const noindex = rows.filter((row) => !row.indexable).length
  const demo = demoDatesOn()
  const pingOff = (process.env.INDEXNOW_PING ?? '').trim().toLowerCase() === 'off'
  const keySource = filled(settings.indexnowKey) ? 'Site settings' : 'the committed key file in public/'

  return (
    <div className="net-seo">
      <header className="net-wiki-head">
        <div>
          <h1 className="net-seo-title">SEO &amp; indexing</h1>
          <p className="net-seo-note">
            Every host this network serves, read from the records, the settings and the environment —
            nothing here fetched a page or asked an engine. Whether a page is <em>indexed</em> is Search
            Console&apos;s answer; this is whether the host is asking to be.
          </p>
        </div>
        <div className="net-wiki-actions">
          <a className="net-dash-action" href={adminUrl('/globals/site-settings')}>
            Site settings
          </a>
          <a className="net-dash-action" href={adminUrl('/wiki')}>
            Wikis
          </a>
        </div>
      </header>

      <div className="net-seo-switches">
        <div className="net-seo-switch" data-state={demo ? 'bad' : 'good'}>
          <b>Sitemap dates</b>
          <span>
            {demo
              ? 'SITEMAP_DEMO_DATES is on — every <lastmod> is fabricated. Turn it off before launch.'
              : 'real — each <lastmod> is the day a page’s sources were read'}
          </span>
        </div>
        <div className="net-seo-switch" data-state={pingOff ? 'warn' : 'good'}>
          <b>Publish announcements</b>
          <span>
            {pingOff
              ? 'INDEXNOW_PING=off — a published page is not announced to anybody'
              : `on — a publish is sent to IndexNow (Bing, Yandex, Seznam, Naver, Yep) and to the WebSub hub at ${WEBSUB_HUB.replace(/^https?:\/\//, '')}`}
          </span>
        </div>
        <div className="net-seo-switch" data-state="good">
          <b>IndexNow key</b>
          <span>from {keySource}; answered as /&lt;key&gt;.txt on every host</span>
        </div>
        <div className="net-seo-switch" data-state={unverified > 0 ? 'warn' : 'good'}>
          <b>Search Console</b>
          <span>
            {unverified === 0
              ? 'every host carries a verification token'
              : `${unverified} of ${rows.length} hosts carry no token — each subdomain is its own property, or use one DNS Domain property for the whole network`}
          </span>
        </div>
        <div className="net-seo-switch" data-state={noCard > 0 ? 'warn' : 'good'}>
          <b>Share cards</b>
          <span>
            {noCard === 0
              ? 'every host has its own picture on a shared link'
              : `${noCard} wikis share the network’s card — attach art, then node tools/make-wiki-icons.mjs`}
          </span>
        </div>
        <div className="net-seo-switch" data-state={noindex > 0 ? 'warn' : 'good'}>
          <b>Indexable</b>
          <span>{noindex === 0 ? 'every host asks to be indexed' : `${noindex} hosts are noindex or not served`}</span>
        </div>
      </div>

      <div className="net-dash-table-wrap">
        <table className="net-dash-table net-seo-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Indexable</th>
              <th>Title</th>
              <th>Verification</th>
              <th className="net-dash-num">Analytics</th>
              <th>Share card</th>
              <th>Last change</th>
              <th>Files</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.host} data-kind={row.kind}>
                <td>
                  <a href={row.host} target="_blank" rel="noreferrer">
                    {row.host.replace(/^https?:\/\//, '')} ↗
                  </a>
                  <span className="net-dash-slug">{row.label}</span>
                </td>
                <td>
                  <span className={`net-seo-yn ${row.indexable ? 'net-seo-yn--yes' : 'net-seo-yn--no'}`}>
                    {row.indexable ? 'yes' : 'no'}
                  </span>
                </td>
                <td>{row.titleSource}</td>
                <td className="net-seo-toks">
                  <Tok on={row.tokens.google} label="G" />
                  <Tok on={row.tokens.bing} label="B" />
                  <Tok on={row.tokens.yandex} label="Y" />
                </td>
                <td className="net-dash-num">{row.analytics || '—'}</td>
                <td>{row.ownCard ? 'own' : <span className="net-dash-gap">network’s</span>}</td>
                <td>{fmt(row.lastChange)}</td>
                <td className="net-seo-files">
                  <a href={`${row.host}/sitemap.xml`} target="_blank" rel="noreferrer">
                    sitemap
                  </a>
                  <a href={`${row.host}/robots.txt`} target="_blank" rel="noreferrer">
                    robots
                  </a>
                  {row.feeds ? (
                    <>
                      <a href={`${row.host}/feed.xml`} target="_blank" rel="noreferrer">
                        rss
                      </a>
                      <a href={`${row.host}/atom.xml`} target="_blank" rel="noreferrer">
                        atom
                      </a>
                    </>
                  ) : null}
                </td>
                <td>
                  <a href={adminUrl(row.edit)}>edit</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="net-seo-how">
        <h2 className="net-wiki-heading">The commands that talk to the engines</h2>
        <ul>
          <li>
            <code>pnpm seo:search-console</code> — every property, in order, with its sitemap, for
            pasting into Search Console.
          </li>
          <li>
            <code>pnpm indexnow -- --send</code> — submit every URL by hand; the publish hook does one
            page at a time on its own.
          </li>
          <li>
            <code>pnpm check:seo</code> — after a build, reads every page back for a title, a
            description, a canonical, one h1, a share card and valid structured data.
          </li>
          <li>
            <code>pnpm check:launch</code> — the whole launch checklist, including every row on this
            screen, from the command line.
          </li>
        </ul>
      </section>
    </div>
  )
}
