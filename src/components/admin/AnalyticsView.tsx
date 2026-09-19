import type { AdminViewServerProps } from 'payload'
import { BOT_RULES, botReason } from '@/lib/analytics/agent'
import { CHANNELS } from '@/lib/analytics/acquisition'
import { parseFilters, type Filter } from '@/lib/analytics/query'
import { DIMENSIONS, RAW_RETENTION_DAYS, WINDOWS, dimension } from '@/lib/analytics/shape'
import { readAnalytics } from './analytics-snapshot'
import { adminUrl } from '@/lib/admin-path'

/**
 * The analytics screen: who read the site, how they got here, and — in the same
 * type size — what each number is not.
 *
 * ## Why this is its own view rather than a panel on the dashboard
 *
 * `NetworkDashboard` answers "is anything waiting for me". This answers "did
 * anybody read it". They are different questions asked on different days, and
 * the second one needs a window picker, eleven breakdowns and a filter row,
 * none of which belongs above a list of editorial gaps.
 *
 * Registered as a root admin view at `/admin/analytics` and linked from the
 * sidebar by `AnalyticsNavLink`.
 *
 * ## The rule this screen is written to
 *
 * Analytics is the easiest place on a site to produce confident fiction. Every
 * figure here therefore carries what it is a count *of*, and the caveats are
 * next to the numbers they qualify rather than in a footnote nobody scrolls
 * to. Specifically:
 *
 *   - **Views and readers are different numbers** and are labelled
 *     individually, never merged into "visits".
 *   - **Readers is a ceiling over more than one day.** The visitor key rotates
 *     at UTC midnight so the table cannot follow a person across a fortnight;
 *     the price is that somebody who came back on Tuesday is counted twice, and
 *     the screen says so wherever the figure appears.
 *   - **Country is unknown in development and often in production**, and
 *     unknown is rendered as a row with a count rather than as a blank that
 *     reads as zero — the rule this repository already states about segment
 *     costs.
 *   - **Device and browser are claims the client makes**, said once at the top
 *     of those cards rather than assumed to be common knowledge.
 *   - **Direct means the browser sent no referrer**, which is not the same as
 *     "came from nowhere".
 *
 * ## Why every control is a link
 *
 * The window picker and every filter are ordinary anchors carrying the state
 * in the query string. No client component, no hydration, and the URL of a
 * question is the question — which means the owner can bookmark "mobile
 * readers on the Onimusha wiki, last 30 days" and send it to somebody.
 */

const NUM = (value: number): string => value.toLocaleString('en-GB')

const BASE = adminUrl('/analytics')

/** The current question as a query string, with one thing changed. */
const href = (
  window: string,
  filters: Filter[],
  change: { window?: string; add?: Filter; remove?: string } = {},
): string => {
  const params = new URLSearchParams()
  params.set('window', change.window ?? window)
  const kept = filters.filter((f) => f.dim !== change.remove && f.dim !== change.add?.dim)
  for (const filter of kept) params.set(`f_${filter.dim}`, filter.value)
  if (change.add) params.set(`f_${change.add.dim}`, change.add.value)
  return `${BASE}?${params.toString()}`
}

const Bar = ({ value, of }: { value: number; of: number }) => (
  <span
    className="net-an-bar"
    /* A width, not a chart library. The admin ships no charting dependency and
       a proportion is one number wide. */
    style={{ width: `${of > 0 ? Math.max(1, Math.round((value / of) * 100)) : 0}%` }}
  />
)

export default async function AnalyticsView({
  payload,
  searchParams,
  initPageResult,
}: AdminViewServerProps) {
  /*
    Editors only, checked here as well as by the admin's own gate.

    `players` is a second auth collection — readers with an account — and
    Payload's default is that any authenticated user can reach things. The
    collections state `read: isEditor` so the data is closed either way; this
    is so a reader who somehow reaches the URL gets a sentence rather than a
    screen full of `null`s that looks like an empty site.

    **From `initPageResult.req`, not from the `user` prop.** `AdminViewServerProps`
    declares `user` because it spreads `ServerProps`, and Payload 3.89 does not
    put one in the props it builds for a root view — see the `serverProps`
    object in `@payloadcms/next/dist/views/Root/index.js`, which passes
    `initPageResult` and no `user`. The type says otherwise, so this compiles
    either way and the wrong version renders "sign in with an editor account"
    to an editor who is signed in. It did, once.
  */
  const user = initPageResult?.req?.user
  if (user?.collection !== 'users') {
    return (
      <div className="net-an">
        <h1 className="net-an-title">Analytics</h1>
        <p className="net-an-failed">This page is for editors. Sign in with an editor account.</p>
      </div>
    )
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === 'string') params.set(key, value)
  }

  const windowId = params.get('window') ?? '24h'
  const filters = parseFilters(params)
  const result = await readAnalytics(payload, windowId, filters)

  const picker = (
    <nav className="net-an-windows" aria-label="Time window">
      {WINDOWS.map((spec) => (
        <a
          key={spec.id}
          href={href(windowId, filters, { window: spec.id })}
          data-active={spec.id === windowId ? 'true' : undefined}
        >
          {spec.label}
        </a>
      ))}
    </nav>
  )

  if (!result.ok) {
    /*
      The one thing this must not do is render zeros. An owner who reads
      "nobody visited" off a failed query is worse off than one who reads
      nothing at all — and the rest of the admin has to keep working, so this
      is a message rather than a thrown error.
    */
    return (
      <div className="net-an">
        <h1 className="net-an-title">Analytics</h1>
        {picker}
        <p className="net-an-failed">
          These numbers could not be read: {result.message}. <strong>Nothing here is a zero</strong>{' '}
          — it is unknown. Reload to try again; the rest of the admin is unaffected.
        </p>
      </div>
    )
  }

  const { report } = result
  const { totals, bots } = report
  const seriesPeak = report.series.reduce((max, point) => Math.max(max, point.views), 0)
  const excludedShare = bots.seen > 0 ? (bots.excluded / bots.seen) * 100 : 0
  const rulesSeen = new Set(bots.byRule.map((rule) => rule.id))

  const readerNote = report.readersAreCeiling
    ? 'A ceiling. The key that identifies a reader changes at UTC midnight, so somebody who came back on another day is counted once per day.'
    : 'Exact for this window, which falls inside one UTC day.'

  return (
    <div className="net-an">
      <h1 className="net-an-title">Analytics</h1>
      <p className="net-an-lede">
        First-party and self-hosted: no third-party service, no advertising identifier, and no
        cookie. Every page on this network is prerendered to static HTML, so there is no server
        render to count — a small script on each page posts to <code>/api/hit</code> after the page
        paints, and that request is the only thing that ever sees a reader.
      </p>

      {picker}

      {filters.length > 0 ? (
        <div className="net-an-filters">
          <span className="net-an-filters-label">Filtered to</span>
          {filters.map((filter) => (
            <a
              key={filter.dim}
              className="net-an-chip"
              href={href(windowId, filters, { remove: filter.dim })}
              title="Remove this filter"
            >
              {dimension(filter.dim)?.label ?? filter.dim}: <strong>{filter.value}</strong> ✕
            </a>
          ))}
          <a className="net-an-clear" href={href(windowId, [])}>
            Clear all
          </a>
        </div>
      ) : (
        <p className="net-an-hint">
          Click any value below to filter every other number on this page by it. Filters combine,
          and the URL carries them — so a question worth asking twice is a bookmark.
        </p>
      )}

      {report.filtersIgnored ? (
        <p className="net-an-note net-an-note--warn">
          <strong>
            The {filters.length === 1 ? 'filter' : 'filters'} above did not apply to these numbers.
          </strong>{' '}
          Combining two dimensions — mobile readers <em>in</em> the Philippines — needs the
          individual page views, and those are kept for {RAW_RETENTION_DAYS} days before being
          summarised into per-day totals for each dimension on its own. This window reaches past
          that. Choose 30 days or shorter to filter. This is said rather than silently returning the
          unfiltered figure, which would look exactly like an answer.
        </p>
      ) : null}

      {report.rollupsMissingDays.length > 0 ? (
        <p className="net-an-note net-an-note--warn">
          <strong>These figures are incomplete, not low.</strong>{' '}
          {report.rollupsMissingDays.length === 1
            ? 'One day in this window has page views on disk that have not been summarised'
            : `${report.rollupsMissingDays.length} days in this window have page views on disk that have not been summarised`}{' '}
          — {report.rollupsMissingDays.slice(0, 6).join(', ')}
          {report.rollupsMissingDays.length > 6 ? ' and more' : ''}. Every number on this page is
          short by whatever happened on{' '}
          {report.rollupsMissingDays.length === 1 ? 'that day' : 'those days'}, rather than those
          days being zero. Run <code>pnpm analytics:roll</code>; it is safe at any time and catches
          up whatever it finds.
        </p>
      ) : null}

      {report.source === 'rollups' && !report.filtersIgnored ? (
        <p className="net-an-note">
          Read from the daily rollups rather than from individual page views, which is a difference
          of cost and not of meaning:{' '}
          <strong>for a whole number of UTC days these are the same numbers</strong>, because a
          reader&rsquo;s key has the date inside it and so belongs to exactly one day. At 300,000
          page views the same window costs 13.7 seconds read row by row and 7ms read this way.
          Today is re-summarised when this page is opened, at most once every two minutes.{' '}
          {report.rollupsThrough
            ? `Rollups run through ${report.rollupsThrough}.`
            : 'No rollups exist yet, so this window is empty rather than zero — run pnpm analytics:roll.'}
        </p>
      ) : null}

      <section className="net-an-totals">
        <div>
          <span className="net-an-big">{NUM(totals.views)}</span>
          <span className="net-an-label">page views</span>
          <span className="net-an-sub">
            One per page opened, including a reader opening the same page twice.
          </span>
        </div>
        <div>
          <span className="net-an-big">{NUM(totals.readers)}</span>
          <span className="net-an-label">unique readers</span>
          <span className="net-an-sub">{readerNote}</span>
        </div>
        <div>
          <span className="net-an-big">{NUM(totals.pages)}</span>
          <span className="net-an-label">pages opened</span>
          <span className="net-an-sub">
            Distinct paths with at least one view. The network has about 1,930 pages.
          </span>
        </div>
        <div>
          <span className="net-an-big">
            {totals.readers > 0 ? (totals.views / totals.readers).toFixed(1) : '—'}
          </span>
          <span className="net-an-label">views per reader</span>
          <span className="net-an-sub">
            {totals.readers > 0
              ? 'Page views divided by readers. Over more than a day the divisor is a ceiling, so this is a floor.'
              : 'Nothing to divide yet.'}
          </span>
        </div>
      </section>

      <section className="net-an-panel">
        <h2>Over time</h2>
        <p className="net-an-note">
          {report.series.length === 0
            ? 'No views in this window. That is a measured zero, not a failed query — the totals above come from the same pass.'
            : `By ${report.range.spec.bucket}, UTC. Every window and every day boundary on this screen is UTC, so the numbers mean the same thing whoever is reading them.`}
        </p>
        {report.series.length > 0 ? (
          <ol className="net-an-series">
            {report.series.map((point) => (
              <li key={point.bucket}>
                <span className="net-an-series-key">{point.bucket.replace('T', ' ')}</span>
                <span className="net-an-track">
                  <Bar value={point.views} of={seriesPeak} />
                </span>
                <span className="net-an-series-num">{NUM(point.views)}</span>
                <span className="net-an-series-num net-an-dim">{NUM(point.readers)}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {report.series.length > 0 ? (
          <p className="net-an-legend">
            Left number: page views. Right: unique readers in that bucket. A bucket that is empty is
            drawn empty rather than skipped.
          </p>
        ) : null}
      </section>

      <div className="net-an-grid">
        {report.breakdowns.map(({ dim, cells }) => {
          const meta = dimension(dim)
          const peak = cells.reduce((max, cell) => Math.max(max, cell.views), 0)
          return (
            <section className="net-an-panel" key={dim}>
              <h2>{meta?.label ?? dim}</h2>
              <p className="net-an-note">{meta?.note}</p>
              {cells.length === 0 ? (
                <p className="net-an-empty">Nothing in this window.</p>
              ) : (
                <table className="net-an-table">
                  <thead>
                    <tr>
                      <th>{meta?.label ?? dim}</th>
                      <th className="net-an-num">Views</th>
                      <th className="net-an-num">Readers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cells.map((cell) => (
                      <tr key={cell.value}>
                        <td>
                          <a
                            className="net-an-value"
                            href={href(windowId, filters, {
                              add: { dim, value: cell.value },
                            })}
                            title={`Filter everything on this page to ${cell.value}`}
                          >
                            {cell.value}
                          </a>
                          <span className="net-an-track net-an-track--inline">
                            <Bar value={cell.views} of={peak} />
                          </span>
                        </td>
                        <td className="net-an-num">{NUM(cell.views)}</td>
                        <td className="net-an-num net-an-dim">{NUM(cell.readers)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dim === 'channel' ? (
                <ul className="net-an-legend-list">
                  {CHANNELS.map((channel) => (
                    <li key={channel.id}>
                      <strong>{channel.label}</strong> — {channel.note}
                    </li>
                  ))}
                </ul>
              ) : null}
              {dim === 'country' ? (
                <p className="net-an-legend">
                  “unknown” is the honest answer, not a missing one. There is no geo database in
                  this repository and none is being added — the country is whatever the hosting
                  platform’s own header said, and in local development there is no such header at
                  all, so every row reads unknown.
                </p>
              ) : null}
            </section>
          )
        })}
      </div>

      <section className="net-an-panel net-an-panel--wide">
        <h2>What was excluded, and by which rule</h2>
        <p className="net-an-note">
          {NUM(bots.excluded)} of {NUM(bots.seen)} recorded hits in this window —{' '}
          <strong>{excludedShare.toFixed(1)}%</strong> — matched a rule and are in none of the
          figures above. The rules live in <code>src/lib/analytics/agent.ts</code>, the rule that
          matched is stored on the row, and the excluded rows are kept rather than dropped so this
          filter can be checked rather than trusted.
        </p>
        <p className="net-an-note net-an-note--warn">
          <strong>This is a floor on crawler traffic, not a measure of it.</strong> Counting happens
          from a script in the page, so a crawler that fetches HTML and does not execute it never
          reaches the endpoint and is not in the {NUM(bots.seen)} above to be excluded. What this
          catches is the smaller set that does run scripts: search-engine renderers, link previewers,
          AI crawlers, headless browsers and uptime checks. The host&rsquo;s own access log is the
          place to see the rest.
        </p>
        {bots.byRule.length > 0 ? (
          <table className="net-an-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th className="net-an-num">Hits</th>
                <th>Why it excludes</th>
              </tr>
            </thead>
            <tbody>
              {bots.byRule.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <code>{rule.id}</code>
                  </td>
                  <td className="net-an-num">{NUM(rule.views)}</td>
                  <td className="net-an-why">
                    {rule.id === 'webdriver'
                      ? 'The page reported navigator.webdriver, which a browser driven by a script sets and a person’s browser leaves false.'
                      : botReason(rule.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="net-an-empty">Nothing was excluded in this window.</p>
        )}
        <details className="net-an-details">
          <summary>
            Every rule, including the {NUM(BOT_RULES.length - rulesSeen.size)} that matched nothing
            here
          </summary>
          <ul className="net-an-legend-list">
            {BOT_RULES.map((rule) => (
              <li key={rule.id} data-seen={rulesSeen.has(rule.id) ? 'true' : undefined}>
                <strong>{rule.id}</strong> — {rule.why}
              </li>
            ))}
            <li data-seen={rulesSeen.has('webdriver') ? 'true' : undefined}>
              <strong>webdriver</strong> — The page reported navigator.webdriver. This one is a
              claim the page makes about itself rather than a reading of the agent string, so it is
              recorded under its own id and can be told apart.
            </li>
          </ul>
        </details>
      </section>

      <section className="net-an-panel net-an-panel--wide">
        <h2>What these numbers are not</h2>
        <ul className="net-an-legend-list">
          <li>
            <strong>Not a request count.</strong> A reader with JavaScript disabled is not here, and
            neither is any fetch that did not execute the page. This is a count of browsers that ran
            the page, which is the more useful number and always the smaller one.
          </li>
          <li>
            <strong>Not a count of people.</strong> A reader is an address and a user-agent, hashed
            together with the date and a secret. Two browsers on one desk are two readers; a family
            behind one address on one browser is one.
          </li>
          <li>
            <strong>Readers who opt out are not counted.</strong> The script does not send anything
            when the browser sets Global Privacy Control or Do Not Track.
          </li>
          <li>
            <strong>No address is stored, and no user-agent string.</strong> The address goes into a
            salted hash and is discarded; the agent string is turned into three families — device,
            browser, operating system — and discarded too. This table cannot be turned back into a
            list of addresses, which is the same promise <code>ratings</code> makes and the same
            mechanism.
          </li>
          <li>
            <strong>The key rotates daily.</strong> Nothing here can follow one person from Monday
            to Tuesday, by design — which is why a multi-day reader count is a ceiling.
          </li>
        </ul>
      </section>

      <p className="net-an-cost">
        {report.cost.queries} aggregate queries in {report.cost.ms}ms, read from{' '}
        {report.source === 'raw' ? 'individual page views' : 'daily rollups'}, cached for twenty
        seconds. Page views are kept as rows for {RAW_RETENTION_DAYS} days and summarised into
        rollups before they are deleted, so a 30-day question never reads a year of rows — a year of
        rows does not exist. <code>pnpm analytics:roll</code> does that pass; <code>/api/hit</code>{' '}
        also runs it after a response, at most once an hour.
      </p>
    </div>
  )
}
