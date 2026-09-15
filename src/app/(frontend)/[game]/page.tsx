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
 * One wiki's front page.
 *
 * Built from what the game actually has, not from a fixed list of sections.
 * The fixed list was Dawnwalker's — quests, courts, endings, the run checker —
 * and on the six wikis opened alongside it that produced a grid of tiles
 * reading "0 catalogued" and a link to a run planner that 404s.
 *
 * So: the tiles come from `sectionsFor`, which returns only sections with
 * records in them; the tools come from the game's own `features`; the art
 * comes from the game record. A wiki with two sections shows two tiles and
 * says plainly what is not there yet, which is a more honest first impression
 * than eleven empty ones.
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
  const latestGuides = guides.slice(0, 6)

  /*
    The game's own key art.

    The decorative band set in `lib/art.ts` is only a fallback for the wiki it
    was cut from — see ART_GAME there. Falling back to it on another game's
    home would put one publisher's screenshots on another publisher's wiki.
  */
  const ownArt = slug === ART_GAME
  const gameHero = typeof game.theme?.hero === 'object' ? game.theme.hero : null
  const fallbackHero = ownArt ? sectionArt('hero', true) : undefined
  const heroSrc = gameHero?.sizes?.hero?.url ?? gameHero?.url ?? fallbackHero?.src
  const heroCredit = gameHero?.credit ?? fallbackHero?.credit

  // The rarest few, which is the part of an achievement list anybody reads.
  const rarest = [...achievements]
    .filter((entry) => entry.globalPercent !== null && entry.globalPercent !== undefined)
    .sort((a, b) => (a.globalPercent ?? 100) - (b.globalPercent ?? 100))
    .slice(0, 5)

  const release = releaseLine(game)
  const upcoming = Boolean(game.releaseDate && new Date(game.releaseDate).getTime() > Date.now())

  return (
    <>
      <section
        className="hero"
        style={heroSrc ? { backgroundImage: `url(${heroSrc})` } : undefined}
      >
        <p className="hero-wordmark">
          <span className="glyph">
            <Logo size={40} />
          </span>
          {name}
        </p>
        <HeroSearch />
        <p className="hero-lede">
          {game.summary || `A guide and database for ${game.title}.`}
        </p>
        {release ? <p className="hero-credit">{release}</p> : null}
        {heroCredit ? <p className="hero-credit">{heroCredit}</p> : null}
      </section>

      <div className="page body-main">
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

        {sections.length > 0 || tools.length > 0 ? (
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
              // The band set belongs to one game, so only that game's tiles
              // carry it. The rest render as plain tiles, which is correct
              // rather than a shortfall.
              const key = section.collection === 'skill-trees' ? 'skills' : section.collection
              /*
                Dawnwalker keeps its bespoke band set; every other wiki gets a
                crop of its own game's screenshots. Neither ever borrows from
                the other, which is the whole point of the split.
              */
              const art = ownArt ? sectionArt(key)?.src : tileArt(slug, key)
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
                    {section.count.toLocaleString('en-GB')} {section.count === 1 ? 'entry' : 'entries'}
                  </span>
                </Link>
              )
            })}
          </div>
        ) : null}

        {/*
          Guides on the front page, not buried behind a nav item. They are the
          pages most likely to be somebody's entry point from a search, and
          linking them from the busiest page on the site is worth more to them
          than another row of database tiles.
        */}
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
                    {guide.targetQuery ? <span className="eyebrow">{guide.targetQuery}</span> : null}
                    <h3>{guide.title}</h3>
                    {guide.summary ? <p className="note">{guide.summary}</p> : null}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {rarest.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <h2>The hardest achievements</h2>
              <span className="eyebrow">
                <Link href="/achievements">all {achievements.length}</Link>
              </span>
            </div>
            <p className="note">
              Fewest players have these. The figures come from the platform and move as more people
              finish the game.
            </p>
            {/*
              The platform ships an icon with every achievement and this list
              was printing the names alone, which made the most visual section
              on the page the plainest thing on it. `pnpm seed:art` attaches
              them; where one is missing the row simply has no image rather
              than a placeholder, because a grey square is worse than a gap.
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
          </section>
        ) : null}

        {/* Only for a game whose systems have actually been catalogued. */}
        {courts.length > 0 && endings.length > 0 ? (
          <DawnwalkerBriefing courts={courts} endings={endings} />
        ) : null}

        <section className="section">
          <div className="section-head">
            <h2>How this wiki is written</h2>
          </div>
          <p className="note">
            Every figure here comes from a source and carries a confidence rating. Where nobody has
            published something, the page says so rather than guessing — a blank is honest, and a
            plausible-looking number that turns out to be invented costs you a playthrough.{' '}
            <Link href="/about">How the data is put together</Link> ·{' '}
            <Link href="/corrections">Something wrong? Tell us</Link>
          </p>
        </section>
      </div>
    </>
  )
}
