import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { FactPanel } from '@/components/FactPanel'
import { RelatedList, type RelatedItem } from '@/components/RelatedList'
import { RichText } from '@/components/RichText'
import { LegalField } from '@/components/LegalGap'
import { getAll, getGame, getSiteSettings } from '@/lib/payload'
import { gameName } from '@/lib/section-copy'
import { aboutCopy } from '@/lib/game-copy'
import { copy, hasRichText, pick, splitTokens } from '@/lib/copy'
import { clamp } from '@/lib/seo'
import { companyUrl } from '@/lib/urls'
import { slugify } from '@/fields/shared'
import { hub } from '@/lib/urls'

type Props = { params: Promise<{ game: string }> }

/**
 * The page a reader lands on when deciding whether to trust the rest.
 *
 * It is the longest piece of prose on a wiki and it was identical on all eight
 * apart from a handful of interpolations, so every sentence in it is now a
 * field on the Game — see the About tab in `src/fields/gameCopy.ts`. Blank
 * falls back to exactly what shipped, which is what makes a half-filled record
 * safe: an editor who writes one heading does not blank the other five.
 *
 * Two things stay in code on purpose.
 *
 * **The counts.** `quests`, `costed`, `guides` and the fact panel are read from
 * the database at build time. An about page that claims a number the database
 * outgrew is the same failure as a guide quoting a figure nobody published, on
 * the one page where it costs the most.
 *
 * **"The game itself".** What it says is decided by whether the record has a
 * store URL and who the rightsholders are, so there is nothing in it for an
 * editor to write that the record does not already answer.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game: slug } = await params
  const doc = await getGame(slug)
  const name = doc?.shortTitle || doc?.title || 'this wiki'
  const about = aboutCopy(doc)
  const tokens = { game: name, title: doc?.title ?? name }

  return {
    title: copy(about.title, 'About the {game} Wiki', tokens),
    /*
      Named, because this was the one description repeated verbatim across all
      eight wikis — eight pages competing with each other for the same result
      and the engine picking one. Everything else on the network composes its
      description from the record it is about; this did not, because it has no
      record. A per-wiki one written by an editor is the proper fix; the
      built-in at least names the game.
    */
    description: clamp(
      copy(
        about.metaDescription,
        'Who runs the {game} wiki, where its facts come from, what the confidence ratings mean, and what we deliberately do not claim to know.',
        tokens,
      ),
    ),
    alternates: { canonical: '/about' },
  }
}

/**
 * The sentence naming who is legally responsible for the site.
 *
 * This was a string literal in the JSX: the entity from settings, followed by
 * "a digital agency operating since 2013 with offices in the Philippines, India
 * and the United States". A description of a real business, compiled into a
 * React component, on all eight wikis — so correcting it meant a deploy, and
 * nothing on the page said where it came from or when it was last true.
 *
 * `{entity}` stays a token rather than a name so `LegalField` can still mark it
 * when the details are provisional; `{rightsholders}` renders as links because
 * an editable string that reaches the DOM as markup is a stored-XSS hole, which
 * is the same reason the attribution template is split rather than injected.
 */
const PUBLISHER_LINE =
  'The {game} Wiki is published by {entity}, a digital agency operating since 2013 with offices in the Philippines, India and the United States. The site is an independent fan project: it is not affiliated with {rightsholders}, and no endorsement is claimed or implied.'

export default async function AboutPage({ params }: Props) {
  const { game } = await params
  const [settings, doc] = await Promise.all([getSiteSettings(), getGame(game)])
  const name = gameName(doc)
  const about = aboutCopy(doc)

  /*
    The run planner is Dawnwalker's, not every wiki's. This page used to open
    by telling a Gears of War reader that the site is built around 480
    segments, and disclaim affiliation with Rebel Wolves rather than with the
    people who actually made the game they were reading about. Both come off
    the game's own record now.
  */
  const hasRunPlanner = (doc?.features ?? []).includes('run-checker')
  const holders = [doc?.developer, doc?.publisher]
    .map((holder) => holder?.trim())
    .filter((holder): holder is string => Boolean(holder))
  const rightsholders = holders.filter((h, i) => holders.indexOf(h) === i)

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

  /*
    `hub()`, not a bare path. Contributor profiles exist once, at the apex, and
    this page is on a wiki — so `/authors/<slug>` resolved to
    `dawnwalker.<domain>/authors/<slug>` and 404'd. Thirty-six names on the
    About page of all eight wikis, every one of them a dead link, on the page a
    reader opens precisely to check who is behind the site. Same origin mistake
    the guide page's Article markup had, in the visible half instead.
  */
  const team: RelatedItem[] = authors.map((author) => ({
    id: author.id,
    title: author.name,
    href: hub(`/authors/${author.slug}`),
    sub: author.role,
  }))

  /*
    `{title}` is the full title and `{game}` the short one, and the difference
    matters in exactly one sentence: the run-planner lede reads "a run planner
    and database for The Blood of Dawnwalker", not "for Dawnwalker". It is a
    token rather than that literal because a sentence naming one game, written
    into a [game] route, is served on all eight of them.
  */
  const tokens = {
    game: name,
    title: doc?.title ?? name,
    quests: quests.length,
    costed,
    guides: guides.length,
  }

  /*
    Rendered as nodes, not as a string with markup in it. Two of the three
    tokens are elements — the entity may need its provisional mark, and the
    rightsholders are anchors onto the companies host — and the alternative is
    an admin-editable string reaching the DOM as HTML.
  */
  const publisherLine = splitTokens(pick(about.publisherLine, PUBLISHER_LINE)).map(
    (part, index) => {
      if ('text' in part) return <span key={index}>{part.text}</span>
      if (part.token === 'game') return <span key={index}>{name}</span>
      if (part.token === 'entity') {
        return (
          <LegalField
            key={index}
            field="legalEntity"
            value={settings.legalEntity}
            provisional={settings.legalProvisional}
          />
        )
      }
      if (part.token === 'rightsholders') {
        if (rightsholders.length === 0) return <span key={index}>the rightsholders</span>
        return (
          <span key={index}>
            {rightsholders.map((holder, position) => (
              <span key={holder}>
                {position > 0 ? ' or ' : ''}
                {/*
                  Across an origin to the companies host, so a plain anchor
                  rather than next/link. Each of these has a profile listing
                  everything of theirs we cover.
                */}
                <a href={companyUrl(`/${slugify(holder)}`)}>{holder}</a>
              </span>
            ))}
          </span>
        )
      }
      // An unrecognised token stays visible: a typo somebody fixes beats a gap
      // nobody notices. Same rule as `fill`.
      return <span key={index}>{`{${part.token}}`}</span>
    },
  )

  return (
    <>
      <PageHeader
        eyebrow="About"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'About' }]}
        icon="book"
        title={copy(about.title, 'About the {game} Wiki', tokens)}
        lede={copy(
          about.lede,
          hasRunPlanner
            ? 'A run planner and database for {title}, built around the one constraint the game never lets you forget: you have 480 segments and you cannot have them back.'
            : 'A database for {game}, compiled from public sources, with every record carrying its citations and a rating for how far we trust it.',
          tokens,
        )}
      />
      <div className="page body-main">
        <div className="split">
          <div className="stack">
            <div className="prose">
              <h2>{copy(about.purposeHeading, 'What this site is for', tokens)}</h2>
              {hasRichText(about.purpose) ? (
                <RichText data={about.purpose} />
              ) : hasRunPlanner ? (
                <>
                  <p>
                    Most guides for an open-world game are written as if you will eventually do
                    everything. This one is not, because in this game you will not. Thirty days,
                    sixteen segments each, and when the budget is gone the story ends whether or not
                    you were ready. Two of the seven endings are lost by players who never knew they
                    were on a clock.
                  </p>
                  <p>
                    So the question this site is built to answer is not &ldquo;how do I do this
                    quest&rdquo; but &ldquo;what can I still reach from where I actually am&rdquo;.
                    The <Link href="/tools/run-checker">run checker</Link> walks every
                    ending&rsquo;s prerequisite chain against the segments you have left. The{' '}
                    <Link href="/tools/build-planner">build planner</Link> does the same for a spec.
                    Everything else on the site exists to feed those two.
                  </p>
                </>
              ) : (
                <p>
                  One page per thing, each one saying where its facts came from and how far we trust
                  them. There is no walkthrough written from trailers here and no filler: where a
                  source does not say something, the field is empty and the page says so rather than
                  guessing at it.
                </p>
              )}

              <h2>{copy(about.runsItHeading, 'Who runs it', tokens)}</h2>
              <p>{publisherLine}</p>
              {hasRichText(about.independence) ? (
                <RichText data={about.independence} />
              ) : (
                <p>
                  Editorial decisions are made by the contributors listed here, not by the
                  publisher, and nothing on the site is paid placement. If that ever changes it will
                  be marked on the page it affects.
                </p>
              )}

              <h2>The game itself</h2>
              <p>
                {doc?.storeUrl ? (
                  <>
                    The official listing for {name} is{' '}
                    {/* Outbound, so nofollow like every external link here. */}
                    <a href={doc.storeUrl} rel="nofollow noopener noreferrer" target="_blank">
                      on its store page
                    </a>
                    . Anything this site says about the game should be checkable against it, and
                    where the two disagree the publisher is right and we are not.
                  </>
                ) : (
                  <>
                    No official listing is recorded for {name} yet, which is usually because it has
                    not been announced on a storefront.
                  </>
                )}
                {rightsholders.length > 0 ? (
                  <>
                    {' '}
                    Its {rightsholders.length === 1 ? 'maker has' : 'makers have'} a profile on this
                    network:{' '}
                    {rightsholders.map((holder, index) => (
                      <span key={holder}>
                        {index > 0 ? ', ' : ''}
                        <a href={companyUrl(`/${slugify(holder)}`)}>{holder}</a>
                      </span>
                    ))}
                    .
                  </>
                ) : null}
              </p>

              <h2>{copy(about.sourcingHeading, 'Where the facts come from', tokens)}</h2>
              {hasRichText(about.sourcing) ? (
                <RichText data={about.sourcing} />
              ) : (
                <>
                  <p>
                    Every record cites its sources with the date we read them, and the importer that
                    builds this database rejects any record that arrives without one. We compile
                    facts from public wikis, guides and reporting, then write our own prose. We
                    never copy text or reproduce another site&rsquo;s tables. Facts are not
                    anyone&rsquo;s property; the way they were written up is.
                  </p>
                  <p>
                    We do not have privileged access to the game. Nothing here has been verified
                    against a running copy, which is exactly why every record carries a confidence
                    rating rather than presenting everything with the same certainty.
                  </p>
                </>
              )}

              <h2>{copy(about.confidenceHeading, 'What the confidence ratings mean', tokens)}</h2>
              {hasRichText(about.confidence) ? (
                <RichText data={about.confidence} />
              ) : (
                <>
                  <ul>
                    <li>
                      <strong>High</strong> — agreed by multiple independent sources.
                    </li>
                    <li>
                      <strong>Medium</strong> — one good source, or sources that disagree on detail.
                    </li>
                    <li>
                      <strong>Low</strong> — contested, inferred, or not confirmed anywhere we
                      trust.
                    </li>
                  </ul>
                  <p>
                    These are not decoration. Published counts for a game vary widely depending on
                    who is counting and what they count
                    {hasRunPlanner ? (
                      <>
                        , and at least one ally questline is described with a different length and a
                        different final quest name depending on the site
                      </>
                    ) : null}
                    . Where sources conflict we record the conflict on the page rather than pick a
                    winner.
                  </p>
                </>
              )}

              <h2>
                {copy(about.limitsHeading, 'What we deliberately do not claim to know', tokens)}
              </h2>
              {hasRichText(about.limits) ? (
                <RichText data={about.limits} />
              ) : (
                <>
                  {hasRunPlanner ? (
                    /*
                      The only two live counts in the prose. They are here and
                      not in the field because rich text has no tokens — so an
                      editor who rewrites this section takes the figures with
                      them and freezes them. The panel on the right keeps
                      counting either way.
                    */
                    <p>
                      Per-quest segment costs. Only {costed} of {quests.length} quests have a figure
                      we can stand behind, and the rest are stored as unknown rather than as zero.
                      An unknown cost is not a free quest, and a planner that quietly treated it as
                      one would be worse than no planner — so the run checker reports any total
                      containing one as a floor rather than a figure.
                    </p>
                  ) : null}
                  <p>
                    The same rule applies everywhere else. A region we cannot source is left blank,
                    an item whose location nobody publishes says so, and a picture is never
                    captioned with a place unless a source names it. A gap is honest; an invented
                    number is not.
                  </p>
                </>
              )}

              <h2>{copy(about.correctionsHeading, 'Corrections', tokens)}</h2>
              {hasRichText(about.corrections) ? (
                <RichText data={about.corrections} />
              ) : (
                <p>
                  If you have the game in front of you and can confirm or contradict something here,{' '}
                  <Link href="/corrections">tell us</Link>. Corrections go to a review queue and are
                  read. Being wrong in public and fixing it quickly is the only way a site compiled
                  from second-hand sources earns any trust at all.
                </p>
              )}

              {/* Anything this wiki needs that the other seven do not. */}
              {(about.extraSections ?? []).map((section) => (
                <div key={section.id ?? section.heading}>
                  <h2>{section.heading}</h2>
                  {hasRichText(section.body) ? <RichText data={section.body} /> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="stack">
            <FactPanel
              title="In the database"
              /*
                A row reading "Court Activities 0" is not a fact about this
                game, it is a fact about Dawnwalker's schema. Empty sections
                are left out the same way the navigation leaves them out.
              */
              facts={[
                { label: 'Quests', value: quests.length },
                ...(hasRunPlanner
                  ? [{ label: 'With a costed time', value: `${costed} of ${quests.length}` }]
                  : []),
                { label: 'Court Activities', value: activities.length },
                { label: 'Items', value: items.length },
                { label: 'Characters', value: characters.length },
                { label: 'Regions', value: regions.length },
                { label: 'Guides', value: guides.length },
              ].filter((fact) => fact.value !== 0)}
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
