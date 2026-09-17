import type { Metadata } from 'next'
import Link from 'next/link'
import { ART_GAME, sectionArt, tileArt } from '@/lib/art'
import { HeroSearch } from '@/components/HeroSearch'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'
import { Briefing } from '@/components/home/Briefing'
import { GameProfile } from '@/components/GameProfile'
import { gameUrl, getAll, getGame } from '@/lib/payload'
import { sectionsFor, toolsFor } from '@/lib/sections'
import { releaseLine } from '@/lib/directory'
import { homeCopy } from '@/lib/game-copy'
import { copy } from '@/lib/copy'
import { getUi } from '@/lib/ui'
import { JsonLd } from '@/components/JsonLd'
import { gameScores } from '@/lib/schema'
import { StarRating } from '@/components/StarRating'
import { editorialScore, cachedReaderScore } from '@/lib/ratings'

type Props = { params: Promise<{ game: string }> }

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

/**
 * The guides a reader should be handed first, in the order they are most often
 * the reason somebody arrived.
 *
 * Matched on slug rather than curated per wiki: the generators produce the
 * same page shapes on every game, and a hand-picked list would go stale the
 * first time one was renamed. A wiki with none of these simply shows fewer.
 */
const START_HERE = [
  /release-date/,
  /system-requirements/,
  /what-kind-of-game/,
  /^all-\d+.*achievements$|^all-achievements$|^achievements-known$/,
  /editions/,
  /^most-searched$/,
]

/**
 * One wiki's front page.
 *
 * ## The shape, and why it changed
 *
 * It was a single column: hero, a grid of section tiles, a list of guides, a
 * list of achievements, a paragraph about sourcing. Everything on it was
 * correct and it read as a page nobody had finished — because a reader
 * arriving from a search has one question, and a column of equally weighted
 * blocks answers none of them sooner than any other.
 *
 * So the page has a front and a rail now. The front is the path through: where
 * to start, what there is, what has been written. The rail is what a reader
 * glances back at: the facts about the game, the achievements almost nobody
 * has, what changed recently. That split is what both of the sites this was
 * measured against are doing underneath their styling.
 *
 * Everything is still derived from what the game actually has. `sectionsFor`
 * returns only sections with records in them and the tools come from the
 * game's own `features`, so a wiki with two sections shows two tiles — a more
 * honest first impression than eleven of them reading "0 catalogued".
 */
export default async function Home({ params }: Props) {
  const { game: slug } = await params

  const [game, sections] = await Promise.all([getGame(slug), sectionsFor(slug)])
  if (!game) return null

  const tools = toolsFor(game)
  const name = game.shortTitle || game.title

  /* Our score and the readers', side by side rather than merged into one. */
  const verdict = editorialScore(game)
  const readers = await cachedReaderScore(game.id)
  const ui = await getUi()

  const [guides, achievements, courts, endings] = await Promise.all([
    getAll('guides', { game: slug, depth: 1, sort: '-updatedAt' }),
    getAll('achievements', { game: slug, depth: 1 }),
    getAll('courts', { game: slug, depth: 0 }),
    getAll('endings', { game: slug, depth: 0 }),
  ])

  const total = sections.reduce((sum, section) => sum + section.count, 0)

  /*
    The game's own key art.

    The decorative band set in `lib/art.ts` is only a fallback for the wiki it
    was cut from — see ART_GAME there. Falling back to it on another game's
    home would put one publisher's screenshots on another publisher's wiki.
  */
  const ownArt = slug === ART_GAME
  const gameHero = typeof game.theme?.hero === 'object' ? game.theme.hero : null
  const gameLogo = typeof game.theme?.logo === 'object' ? game.theme.logo : null
  const fallbackHero = ownArt ? sectionArt(slug, 'hero', true) : undefined
  const heroSrc = gameHero?.sizes?.hero?.url ?? gameHero?.url ?? fallbackHero?.src
  const heroCredit = gameHero?.credit ?? fallbackHero?.credit

  // The rarest few, which is the part of an achievement list anybody reads.
  const rarest = [...achievements]
    .filter((entry) => entry.globalPercent !== null && entry.globalPercent !== undefined)
    .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
    .slice(0, 5)

  const release = releaseLine(game)
  const upcoming = Boolean(game.releaseDate && new Date(game.releaseDate).getTime() > Date.now())

  /*
    This wiki's own wording, where an editor has written any.

    `copy()` takes the built-in as its second argument, so a blank field is the
    page that shipped rather than an empty heading — a half-filled record must
    never delete a title.
  */
  const words = homeCopy(game)
  const tokens = {
    game: name,
    publisher: game.publisher ?? 'the publisher',
    count: total,
    guides: guides.length,
    achievements: achievements.length,
  }

  /* Start-here picks, in priority order, each guide used at most once. */
  const taken = new Set<string>()
  const starters: typeof guides = []
  for (const pattern of START_HERE) {
    if (starters.length >= 3) break
    const found = guides.find((guide) => !taken.has(guide.slug) && pattern.test(guide.slug))
    if (found) {
      taken.add(found.slug)
      starters.push(found)
    }
  }

  /*
    Top the row up to three from whatever else the wiki has.

    Dawnwalker's guides are hand-written and match none of the generated slug
    shapes above, so it matched one pattern and would have rendered a single
    card in a three-column grid — which looks like two cards failed to load
    rather than like a deliberate row of one.
  */
  for (const guide of guides) {
    if (starters.length >= 3) break
    if (taken.has(guide.slug)) continue
    taken.add(guide.slug)
    starters.push(guide)
  }

  const latestGuides = guides.filter((guide) => !taken.has(guide.slug)).slice(0, 6)

  /*
    What the wiki holds, and only that.

    Developer, publisher and the release date used to be here too. They are the
    game's own details, they are now in the factsheet directly above this box,
    and printing them twice on one screen makes the second copy read as a
    different figure somebody forgot to update.
  */
  const facts: { label: string; value: string }[] = [
    { label: 'Records', value: total.toLocaleString('en-GB') },
    ...(guides.length
      ? [{ label: 'Guides', value: guides.length.toLocaleString('en-GB') }]
      : []),
    ...(achievements.length
      ? [{ label: 'Achievements', value: achievements.length.toLocaleString('en-GB') }]
      : []),
    { label: 'Pages here', value: (total + guides.length).toLocaleString('en-GB') },
  ]

  /* The wiki's own origin, which is what the game entity is keyed on. */
  const canonical = await gameUrl(game)
  const scores = gameScores(canonical, {
    rating: game.rating,
    readers: readers.average !== null && readers.votes > 0
      ? { average: readers.average, count: readers.votes }
      : null,
  })

  return (
    <>
      {/*
        The scores, on the one page that prints them. An outlook publishes no
        `Review` at all — see `gameScores`.
      */}
      {scores ? <JsonLd data={scores} /> : null}
      {/* ---- Masthead: the game's own art, its logo, and the search ---- */}
      <header className="wiki-masthead">
        {heroSrc ? (
          <img
            className="wiki-masthead-art"
            src={heroSrc}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
          />
        ) : null}

        <div className="page wiki-masthead-inner">
          {/*
            An <h1>, not a <p>. The masthead is the page's heading whichever
            branch renders it, and every wiki home was shipping without one:
            the logo branch is an image and the wordmark branch was a
            paragraph, so the most important page on each of the eight sites
            had no top-level heading for a screen reader to land on or a
            crawler to read as the subject.
          */}
          {gameLogo?.url ? (
            <h1 className="wiki-logo-heading">
              <img className="wiki-logo" src={gameLogo.url} alt={game.title} decoding="async" />
            </h1>
          ) : (
            <h1 className="hero-wordmark">
              <span className="glyph">
                <Logo size={36} />
              </span>
              {name}
            </h1>
          )}

          <p className="wiki-masthead-lede">
            {game.summary || `A guide and database for ${game.title}.`}
          </p>

          <HeroSearch />

          {/*
            The release line, and the game's own listing beside it.

            Every game record has carried a `storeUrl` from the first store
            harvest and nothing rendered it anywhere until the About page. The
            official listing is the one external link on this page a reader
            might actually want, and a wiki that will not point at the thing it
            is about reads as though it would rather keep the traffic.
          */}
          {release || game.storeUrl ? (
            <p className="wiki-masthead-meta">
              {release}
              {release && game.storeUrl ? ' · ' : ''}
              {game.storeUrl ? (
                <a href={game.storeUrl} rel="nofollow noopener noreferrer" target="_blank">
                  Official listing
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <div className="page wikihome">
        {/*
          A direct child of the grid rather than a block inside the main
          column, so CSS can put it where a reader looks for it: under the
          search on a phone, top of the right-hand column on a desktop. It was
          a full-width band two thirds of the way down the page, which is
          nowhere.
        */}
        <GameProfile game={game} />

        <div className="wikihome-main">
          {/*
            A wiki with nothing in it should say so before a reader works it out
            by clicking. This is the honest version of the launch-day problem
            every competing wiki solves by inventing content.
          */}
          {total === 0 ? (
            <div className="callout">
              <h2>
                {upcoming
                  ? copy(words.upcomingHeading, 'This game is not out yet', tokens)
                  : copy(words.buildingHeading, 'This wiki is just starting', tokens)}
              </h2>
              <p>
                {upcoming
                  ? copy(
                      words.upcomingBody,
                      'Everything here comes from what {publisher} has actually confirmed — release, editions, requirements, features. There are no walkthroughs, no item lists and no boss strategies, because nobody has played it. Those arrive when there is something real to put in them.',
                      tokens,
                    )
                  : copy(
                      words.buildingBody,
                      'There is little here yet. What is here is sourced; nothing has been filled in from guesswork to make the wiki look bigger than it is.',
                      tokens,
                    )}
              </p>
              {/*
                The same two links and the same words. The first is the primary
                action on a wiki whose database is empty on purpose, so it is
                the filled CTA and the second is the plain one — and the mid-dot
                that used to sit between them is gone rather than being a
                character typed into this file.

                `.cta-row` and not `.metarow`: `.metarow` is `nowrap` by
                contract, and these measure 207px and 193px. With the 16px gap
                that is 416px of row inside the 330px this callout has at
                400px — 86px off the side of the screen, on the one page shape
                where a reader has nothing else to click. They wrap instead,
                and the dot was only ever standing in for the gap.

                Measured by injection rather than on a page: `total === 0` is
                false on all eight wikis, so this branch renders nowhere today.
                It renders the day somebody adds a wiki, which on this network
                is a row in the admin.
              */}
              <p className="cta-row">
                <Link href="/mechanics" className="cta cta-filled">
                  What is confirmed so far
                </Link>
                <Link href="/requests" className="cta">
                  Tell us what you want first
                </Link>
              </p>
            </div>
          ) : null}

          {/*
            Our verdict, above everything else in the column.

            The one opinion on a site of sourced facts, so it is signed, dated,
            says what it is based on, and prints the reasoning. `editorialScore`
            returns nothing unless the rationale is there — a number with no
            argument behind it is what every other site publishes and is the
            thing a reader cannot answer back to.
          */}
          {verdict ? (
            <section className="verdict" aria-labelledby="verdict-head">
              <div className="verdict-head">
                <h2 id="verdict-head" className="verdict-score">
                  {verdict.score.toFixed(1)}
                  <span className="verdict-outof"> / 10</span>
                </h2>
                {verdict.basis ? (
                  <span className="verdict-basis">{ui.label('rating-basis', verdict.basis)}</span>
                ) : null}
              </div>
              {verdict.summary ? <p className="verdict-summary">{verdict.summary}</p> : null}
              <p className="verdict-body">{verdict.rationale}</p>
              {/* The reader half. Live on mount here, because on this page the
                  score is the point rather than a number in a list. */}
              <StarRating game={game.id} readers={readers} refresh />
              {verdict.ratedOn ? (
                <p className="verdict-note">
                  {/*
                    Dated, because a game changes after launch and a score with
                    no date is a claim about a moving target.
                  */}
                  Rated{' '}
                  {new Date(verdict.ratedOn).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                  .
                </p>
              ) : null}
            </section>
          ) : null}

          {starters.length > 0 ? (
            <section className="section section-card">
              <div className="section-head">
                <h2>{copy(words.startHereHeading, 'Start here', tokens)}</h2>
                <p className="note">
                  {copy(
                    words.startHereNote,
                    'The questions most people arrive with, each answered from a source you can check.',
                    tokens,
                  )}
                </p>
              </div>
              <div className="startgrid">
                {starters.map((guide) => (
                  <Link key={guide.id} href={`/guides/${guide.slug}`} className="startcard">
                    {guide.image && typeof guide.image === 'object' && guide.image.url ? (
                      <img
                        className="startcard-image"
                        src={guide.image.sizes?.card?.url ?? guide.image.url}
                        alt=""
                        loading="lazy"
                      />
                    ) : null}
                    <span className="startcard-body">
                      <h3>{guide.title}</h3>
                      {guide.summary ? <span className="note">{guide.summary}</span> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {sections.length > 0 || tools.length > 0 ? (
            <section className="section section-card">
              <div className="section-head">
                <h2>{copy(words.browseHeading, 'Browse the database', tokens)}</h2>
                <p className="note">
                  {copy(
                    words.browseNote,
                    'Only sections with records in them. A link to an empty index reads as a broken site, so there are none.',
                    tokens,
                  )}
                </p>
              </div>
              <div className="tilegrid">
                {tools.map((tool) => {
                  // `/tools/completion` -> `tool-completion`, `/run` -> `tool-run`.
                  const art = tileArt(slug, `tool-${tool.href.replace(/^\/(tools\/)?/, '')}`)
                  return (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="tile"
                      style={art ? { backgroundImage: `url(${art})` } : undefined}
                    >
                      <span className="tile-icon">
                        <Icon name={tool.icon} size={19} />
                      </span>
                      <span className="tile-name">{tool.label}</span>
                      <span className="tile-count">Tool</span>
                    </Link>
                  )
                })}

                {sections.map((section) => {
                  const key = section.collection === 'skill-trees' ? 'skills' : section.collection
                  /*
                    Dawnwalker keeps its bespoke band set; every other wiki gets
                    a crop of its own game's screenshots. Neither ever borrows
                    from the other, which is the whole point of the split.
                  */
                  const art = ownArt ? sectionArt(slug, key)?.src : tileArt(slug, key)
                  return (
                    <Link
                      key={section.href}
                      href={section.href}
                      className="tile"
                      style={art ? { backgroundImage: `url(${art})` } : undefined}
                    >
                      <span className="tile-icon">
                        <Icon name={section.icon} size={19} />
                      </span>
                      <span className="tile-name">{section.label}</span>
                      <span className="tile-count">
                        {section.count.toLocaleString('en-GB')}{' '}
                        {section.count === 1 ? 'entry' : 'entries'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ) : null}

          {latestGuides.length > 0 ? (
            <section className="section section-card">
              <div className="section-head">
                <h2>{copy(words.latestHeading, 'Guides', tokens)}</h2>
                {/* Was a `<Link>` inside an `.eyebrow`, which set it in muted
                    label type and then let the anchor colour fight it. */}
                <Link href="/guides" className="cta">
                  all {guides.length}
                </Link>
              </div>
              <div className="guidegrid">
                {latestGuides.map((guide) => (
                  <Link key={guide.id} href={`/guides/${guide.slug}`} className="guidetile">
                    {guide.image && typeof guide.image === 'object' && guide.image.url ? (
                      <img
                        className="guidetile-image"
                        src={guide.image.sizes?.card?.url ?? guide.image.url}
                        alt=""
                        loading="lazy"
                      />
                    ) : null}
                    <span className="guidetile-body">
                      {guide.targetQuery ? (
                        <span className="eyebrow">{guide.targetQuery}</span>
                      ) : null}
                      <h3>{guide.title}</h3>
                      {guide.summary ? <p className="note">{guide.summary}</p> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/*
            Unconditional, because the switch is on the record now: `Briefing`
            renders nothing at all unless this wiki has one turned on. Gating it
            here on "has courts and endings" was how one game's opinions got
            offered to every game that happened to catalogue the same shapes.
          */}
          <Briefing game={game} courts={courts} endings={endings} />
        </div>

        {/* ---- The rail: what a reader keeps glancing back at ---- */}
        <aside className="wikihome-rail">
          <section className="railbox">
            {/*
              Renamed, because the factsheet above it is now the "at a glance"
              box and two of those on one page is one too many. This one counts
              what the wiki holds, which is a different question.
            */}
            <h2>{copy(words.statsHeading, 'What is in this wiki', tokens)}</h2>
            <dl className="factlist">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {heroCredit ? <p className="railnote">{heroCredit}</p> : null}
          </section>

          {rarest.length > 0 ? (
            <section className="railbox">
              <h2>
                {copy(words.popularHeading, 'Hardest achievements', tokens)}
                <Link href="/achievements" className="cta">
                  all {achievements.length}
                </Link>
              </h2>
              {/*
                The platform ships an icon with every achievement and this list
                was printing the names alone, which made the most visual thing
                on the page the plainest. Where one is missing the row simply
                has no image, because a grey square is worse than a gap.
              */}
              {/*
                An `<ol>` and not a `<ul>`, because this list is ranked: it is
                sorted by how few people have the achievement and the heading
                says so. The numbers themselves are a CSS counter — the rank is
                not a fact anybody published, it is the position of a row in an
                order this page already chose, so it is not in the markup and
                not in the database. The element is what makes a screen reader
                hear the same thing.
              */}
              <ol className="related ranked achievement-list">
                {rarest.map((entry) => {
                  const icon =
                    entry.icon && typeof entry.icon === 'object' ? entry.icon.url : undefined
                  return (
                    <li key={entry.id}>
                      {icon ? (
                        <img className="achievement-icon" src={icon} alt="" loading="lazy" />
                      ) : null}
                      <span className="related-main">
                        <Link href={`/achievements/${entry.slug}`}>{entry.title}</Link>
                        <span className="note">
                          {entry.hidden ? 'Hidden until unlocked' : entry.description}
                        </span>
                      </span>
                      <span className="related-meta">{entry.globalPercent}%</span>
                    </li>
                  )
                })}
              </ol>
              <p className="railnote">
                The figures come from the platform and move as more people finish the game.
              </p>
            </section>
          ) : null}

          {guides.length > 0 ? (
            <section className="railbox">
              <h2>{copy(words.recentHeading, 'Recently updated', tokens)}</h2>
              <ul className="raillist">
                {guides.slice(0, 5).map((guide) => (
                  <li key={`recent-${guide.id}`}>
                    <Link href={`/guides/${guide.slug}`}>{guide.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="railbox">
            <h2>{copy(words.trustHeading, 'How this wiki is written', tokens)}</h2>
            <p className="railnote">
              {copy(
                words.trustBody,
                'Every figure here comes from a source and carries a confidence rating. Where nobody has published something, the page says so rather than guessing — a blank is honest, and a plausible-looking number that turns out to be invented costs you a playthrough.',
                tokens,
              )}
            </p>
            <p className="railnote">
              <Link href="/about">How the data is put together</Link>
              <br />
              <Link href="/corrections">Something wrong? Tell us</Link>
            </p>
          </section>
        </aside>
      </div>
    </>
  )
}
