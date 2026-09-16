import type { Metadata } from 'next'
import Link from 'next/link'
import { ART_GAME, sectionArt, tileArt } from '@/lib/art'
import { HeroSearch } from '@/components/HeroSearch'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'
import { DawnwalkerBriefing } from '@/components/home/DawnwalkerBriefing'
import { getAll, getGame } from '@/lib/payload'
import { sectionsFor, toolsFor } from '@/lib/sections'
import { releaseLine } from '@/lib/directory'

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

  const facts: { label: string; value: string }[] = [
    ...(game.developer ? [{ label: 'Developer', value: game.developer }] : []),
    ...(game.publisher ? [{ label: 'Publisher', value: game.publisher }] : []),
    ...(release ? [{ label: 'Release', value: release }] : []),
    ...(achievements.length
      ? [{ label: 'Achievements', value: achievements.length.toLocaleString('en-GB') }]
      : []),
    { label: 'Pages here', value: (total + guides.length).toLocaleString('en-GB') },
  ]

  return (
    <>
      {/* ---- Masthead: the game's own art, its logo, and the search ---- */}
      <header className="wiki-masthead">
        {heroSrc ? (
          <img className="wiki-masthead-art" src={heroSrc} alt="" aria-hidden="true" />
        ) : null}

        <div className="page wiki-masthead-inner">
          {gameLogo?.url ? (
            <img className="wiki-logo" src={gameLogo.url} alt={game.title} />
          ) : (
            <p className="hero-wordmark">
              <span className="glyph">
                <Logo size={36} />
              </span>
              {name}
            </p>
          )}

          <p className="wiki-masthead-lede">
            {game.summary || `A guide and database for ${game.title}.`}
          </p>

          <HeroSearch />

          {release ? <p className="wiki-masthead-meta">{release}</p> : null}
        </div>
      </header>

      <div className="page wikihome">
        <div className="wikihome-main">
          {/*
            A wiki with nothing in it should say so before a reader works it out
            by clicking. This is the honest version of the launch-day problem
            every competing wiki solves by inventing content.
          */}
          {total === 0 ? (
            <div className="callout">
              <h3>{upcoming ? 'This game is not out yet' : 'This wiki is just starting'}</h3>
              <p>
                {upcoming
                  ? `Everything here comes from what ${game.publisher ?? 'the publisher'} has actually confirmed — release, editions, requirements, features. There are no walkthroughs, no item lists and no boss strategies, because nobody has played it. Those arrive when there is something real to put in them.`
                  : `There is little here yet. What is here is sourced; nothing has been filled in from guesswork to make the wiki look bigger than it is.`}
              </p>
              <p>
                <Link href="/mechanics">What is confirmed so far</Link> ·{' '}
                <Link href="/requests">Tell us what you want first</Link>
              </p>
            </div>
          ) : null}

          {starters.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>Start here</h2>
                <p className="note">
                  The questions most people arrive with, each answered from a source you can check.
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
            <section className="section">
              <div className="section-head">
                <h2>Browse the database</h2>
                <p className="note">
                  Only sections with records in them. A link to an empty index reads as a broken
                  site, so there are none.
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
            <section className="section">
              <div className="section-head">
                <h2>Guides</h2>
                <span className="eyebrow">
                  <Link href="/guides">all {guides.length}</Link>
                </span>
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

          {/* Only for a game whose systems have actually been catalogued. */}
          {courts.length > 0 && endings.length > 0 ? (
            <DawnwalkerBriefing courts={courts} endings={endings} />
          ) : null}
        </div>

        {/* ---- The rail: what a reader keeps glancing back at ---- */}
        <aside className="wikihome-rail">
          <section className="railbox">
            <h2>At a glance</h2>
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
                Hardest achievements
                <Link href="/achievements" className="eyebrow">
                  all {achievements.length}
                </Link>
              </h2>
              {/*
                The platform ships an icon with every achievement and this list
                was printing the names alone, which made the most visual thing
                on the page the plainest. Where one is missing the row simply
                has no image, because a grey square is worse than a gap.
              */}
              <ul className="related achievement-list">
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
              </ul>
              <p className="railnote">
                The figures come from the platform and move as more people finish the game.
              </p>
            </section>
          ) : null}

          {guides.length > 0 ? (
            <section className="railbox">
              <h2>Recently updated</h2>
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
            <h2>How this wiki is written</h2>
            <p className="railnote">
              Every figure here comes from a source and carries a confidence rating. Where nobody
              has published something, the page says so rather than guessing — a blank is honest,
              and a plausible-looking number that turns out to be invented costs you a playthrough.
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
