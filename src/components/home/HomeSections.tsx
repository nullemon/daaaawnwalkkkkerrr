import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from '@/components/Icon'
import { HubSearch } from '@/components/HubSearch'
import { ImageCredit } from '@/components/ImageCredit'
import { editorialScore } from '@/lib/verdict'
import { titleWithYear, releaseYear } from '@/lib/game-year'
import { companyUrl, personUrl } from '@/lib/urls'
import { copy } from '@/lib/copy'
import type { CompanyEntry, HomeData, LatestEntry, PersonEntry } from '@/lib/home-data'
import type { DirectoryEntry } from '@/lib/directory'
import type { Media } from '@/payload-types'
import { artOf, src } from './art'
import { RotatingPeople } from './RotatingPeople'
import { inkOf } from './logo-ink'

/**
 * The pieces the hub home page is built from.
 *
 * ## Why the art is beside the words and never under them
 *
 * The hub used to open on one wiki's key art at full bleed with the network's
 * promise set over it, and it read as black. The cause was measured rather
 * than guessed: the chosen photograph has a greyscale mean of 11.5 of 255, and
 * no scrim recovers detail a file has never had — while the scrim needed to
 * keep 11.5px type legible over a white sky is a 96% wash, which is a
 * photograph nobody can see.
 *
 * Every picture here therefore has an edge: a tile, a card, a thumbnail. Type
 * never sits on a photograph, so no scrim has to be tuned, and a dark
 * screenshot costs nothing but its own darkness.
 *
 * ## Even heights are structural, not hoped for
 *
 * The grid stretches its rows — there is deliberately no `align-items` on it —
 * and three rules make a stretched cell usable: every cell is a flex column,
 * whatever belongs on the floor of a card is put there with `margin-top: auto`,
 * and every picture carries a fixed `aspect-ratio`. `LeadTile` renders both
 * the game and the article so the two cannot drift structurally.
 *
 * Nothing is clamped to make the grid tidy. A short card gets space, not a
 * truncated sentence.
 *
 * ## Every label is a field
 *
 * The figures, the headings and the search placeholder all read from Site
 * settings and fall back to the wording here. A row where "Wikis" could be
 * renamed and "Studios" could not is worse than one where neither can.
 */

type Props = { data: HomeData }

/* -------------------------------------------------------------- the head */

export function HomeHead({ data }: Props) {
  const { settings } = data
  return (
    <div className="page home-head">
      <h1 className="home-title">
        {settings.heroHeading || 'Guides and databases for the games you are playing.'}
      </h1>
      <p className="home-lede">
        {settings.heroSubheading ||
          settings.description ||
          'Every figure sourced, every gap admitted. Start with a search, or pick a wiki below.'}
      </p>
      <div className="home-search">
        <HubSearch
          targets={data.targets}
          placeholder={copy(settings.searchPlaceholder, 'Search the network — a game, a boss, a guide…')}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- lead tiles */

/**
 * The big tile, used for both the game and the article.
 *
 * One component on purpose: the two sit side by side, and two separately
 * written cards with the same intent is how "they match" becomes "they used
 * to match".
 */
function LeadTile({
  href,
  art,
  credit,
  eyebrow,
  title,
  note,
  foot,
}: {
  href: string
  art: Media | null
  credit?: string | null
  eyebrow: string
  title: string
  note?: string | null
  foot?: ReactNode
}) {
  return (
    <a className="home-cell home-lead" href={href}>
      <span className="home-lead-art">
        {art ? <img src={src(art, 'hero')} alt="" fetchPriority="high" decoding="async" /> : null}
        {/*
          The credit, on the picture. This band carried one publisher's key art
          for months and named nobody — the only page on the network with a
          photograph and no line saying whose it is.
        */}
        {art && credit ? <ImageCredit credit={credit} slot="narrow" as="p" /> : null}
      </span>
      <span className="home-lead-body">
        <span className="eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
        {note ? <span className="note">{note}</span> : null}
        {foot ? <span className="home-lead-foot">{foot}</span> : null}
      </span>
    </a>
  )
}

export function GameLead({ entry }: { entry: DirectoryEntry }) {
  const art = artOf(entry)
  const score = editorialScore(entry.game)
  return (
    <LeadTile
      href={entry.url}
      art={art.wide}
      credit={art.wide?.credit}
      eyebrow="Most documented"
      title={titleWithYear(entry.game)}
      note={entry.game.tagline}
      foot={
        <>
          <span>{entry.pages.toLocaleString('en-GB')} pages</span>
          {score ? <span>{score.score.toFixed(1)}/10</span> : null}
          {entry.highlights.slice(0, 2).map((highlight) => (
            <span key={highlight.label}>
              {highlight.count}{' '}
              {highlight.count === 1 ? highlight.kind : highlight.label.toLowerCase()}
            </span>
          ))}
        </>
      }
    />
  )
}

export function GuideLead({ entry }: { entry: LatestEntry }) {
  return (
    <LeadTile
      href={entry.href}
      art={entry.image}
      credit={entry.image?.credit}
      eyebrow="Newest guide"
      title={entry.title}
      note={entry.summary}
      foot={<span className="chip">{entry.wiki}</span>}
    />
  )
}

/* ----------------------------------------------------------------- cells */

function Cell({
  title,
  all,
  allHref,
  children,
}: {
  title: string
  all?: string
  allHref?: string
  children: ReactNode
}) {
  /*
    No per-cell class. Each of these carried one (`home-ask`, `home-guides`,
    `home-studios`, `home-people`) while there were six candidate layouts and
    each needed its own `grid-column`. With one layout every cell spans two
    columns, so those names styled nothing — and a class in the markup that
    matches no rule is the kind of thing `pnpm check:css` exists to catch.
    `home-corow` and `home-facerow` already carry what is actually different
    between them.
  */
  return (
    <section className="home-cell">
      <p className="eyebrow home-cellhead">
        {title}
        {all ? (
          allHref ? (
            <a className="home-more" href={allHref}>
              {all}
            </a>
          ) : (
            <span className="home-more">{all}</span>
          )
        ) : null}
      </p>
      <div className="home-cellbody">{children}</div>
    </section>
  )
}

/**
 * The figures, counted at build time.
 *
 * None of these can be typed into the admin, which is the point of them — only
 * their labels can. `Last checked` appears only when somebody has actually set
 * a date, so an empty field prints nothing rather than a blank column.
 */
export function Figures({ data }: Props) {
  const { settings, verified } = data
  const rows: { label: string; value: ReactNode }[] = [
    { label: copy(settings.statWikisLabel, 'Wikis'), value: data.wikis.length },
    { label: copy(settings.statPagesLabel, 'Sourced pages'), value: data.totalPages.toLocaleString('en-GB') },
    { label: copy(settings.statGuidesLabel, 'Guides'), value: data.guideCount.toLocaleString('en-GB') },
    { label: copy(settings.statStudiosLabel, 'Studios'), value: data.companyCount.toLocaleString('en-GB') },
    { label: copy(settings.statPeopleLabel, 'People'), value: data.peopleCount.toLocaleString('en-GB') },
    { label: copy(settings.statUpcomingLabel, 'Not out yet'), value: data.upcoming },
  ]

  if (verified) {
    rows.push({
      label: copy(settings.statVerifiedLabel, 'Last checked'),
      value: (
        <time dateTime={verified.toISOString().slice(0, 10)}>
          {verified.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </time>
      ),
    })
  }

  return (
    <section className="home-cell home-figband">
      <dl className="home-fig">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function Asking({ data, limit = 5 }: Props & { limit?: number }) {
  return (
    <Cell
      title={copy(data.settings.askingHeading, 'What people are asking')}
    >
      <ul className="home-list">
        {data.asking.slice(0, limit).map((entry) =>
          entry.href ? (
            <li key={entry.query}>
              <Link href={entry.href}>
                <Icon name="search" size={13} className="ic" />
                {entry.query}
              </Link>
            </li>
          ) : null,
        )}
      </ul>
    </Cell>
  )
}

function GuideRow({ entry }: { entry: LatestEntry }) {
  return (
    <a className="home-guide" href={entry.href}>
      <span className="home-guide-art">
        {entry.image ? <img src={src(entry.image)} alt="" loading="lazy" /> : null}
      </span>
      <span className="home-guide-body">
        <strong>{entry.title}</strong>
        <span className="home-guide-wiki">{entry.wiki}</span>
      </span>
    </a>
  )
}

export function Guides({ data, entries, limit = 3 }: Props & { entries?: LatestEntry[]; limit?: number }) {
  return (
    <Cell
      title={copy(data.settings.latestHeading, 'Newest guides')}
      all={`View all ${data.guideCount.toLocaleString('en-GB')}`}
    >
      <div className="home-guidelist">
        {(entries ?? data.latest).slice(0, limit).map((entry) => (
          <GuideRow key={entry.id} entry={entry} />
        ))}
      </div>
    </Cell>
  )
}

/**
 * A studio, as its mark.
 *
 * `data-ink` decides the treatment and is measured per file by
 * `tools/logo-ink.mjs` — a black wordmark is inverted to white, a mark with
 * real colour is never inverted and gets a plate instead. See `./logo-ink`.
 */
function CompanyChip({ entry }: { entry: CompanyEntry }) {
  const url = entry.logo ? src(entry.logo) : ''
  return (
    <a className="home-co" href={entry.href} title={entry.name}>
      <span className="home-co-mark" data-ink={inkOf(entry.logo, url)}>
        {entry.logo ? <img src={url} alt="" loading="lazy" /> : null}
      </span>
      <span className="home-co-name">{entry.name}</span>
    </a>
  )
}

export function Studios({ data, limit = 16 }: Props & { limit?: number }) {
  return (
    <Cell
      title="Studios and publishers"
      all={`View all ${data.companyCount.toLocaleString('en-GB')}`}
      allHref={companyUrl('/')}
    >
      <div className="home-corow">
        {data.companies.slice(0, limit).map((entry) => (
          <CompanyChip key={entry.id} entry={entry} />
        ))}
      </div>
    </Cell>
  )
}

function PersonChip({ entry }: { entry: PersonEntry }) {
  return (
    <a className="home-person" href={entry.href} title={entry.name}>
      <span className="home-person-face">
        {entry.photo ? <img src={src(entry.photo)} alt="" loading="lazy" /> : null}
      </span>
      <span className="home-person-body">
        <strong>{entry.name}</strong>
        {entry.knownFor ? <span className="note">{entry.knownFor}</span> : null}
      </span>
    </a>
  )
}

export function People({ data, limit = 6 }: Props & { limit?: number }) {
  return (
    <Cell
      title="People"
      all={`View all ${data.peopleCount.toLocaleString('en-GB')}`}
      allHref={personUrl('/')}
    >
      <div className="home-facerow">
        {/*
          Every candidate is rendered and `RotatingPeople` shows a window of
          them, moved along by a random offset after mount. The server's HTML
          holds the first window, so a crawler and a reader without JavaScript
          get a real answer rather than an empty box — see the component for
          why a shuffle cannot happen on the server at all.
        */}
        <RotatingPeople window={limit}>
          {data.people.map((entry) => (
            <PersonChip key={entry.id} entry={entry} />
          ))}
        </RotatingPeople>
      </div>
    </Cell>
  )
}

/* ------------------------------------------------------------- directory */

function PosterTile({ entry }: { entry: DirectoryEntry }) {
  const art = artOf(entry)
  const score = editorialScore(entry.game)
  const year = releaseYear(entry.game)
  return (
    <a className="home-poster" href={entry.url}>
      <span className="home-poster-art">
        {art.box ? <img src={src(art.box)} alt="" loading="lazy" /> : null}
        {score ? <span className="home-poster-score">{score.score.toFixed(1)}</span> : null}
      </span>
      <span className="home-poster-name">{entry.game.shortTitle || entry.game.title}</span>
      <span className="home-poster-meta">
        {year ? `${year} · ` : ''}
        {entry.pages.toLocaleString('en-GB')} pages
      </span>
    </a>
  )
}

/**
 * Every wiki, as box art.
 *
 * This replaced both the old card grid and the chip strip above it: the strip
 * existed so every wiki stayed reachable without scrolling, and a grid of
 * fifteen covers on the same screen does that better than a row of fifteen
 * names.
 */
export function Directory({ data }: Props) {
  return (
    <div className="page home-dir">
      <p className="eyebrow">{copy(data.settings.directoryHeading, 'Every wiki')}</p>
      <div className="home-postergrid">
        {data.wikis.map((entry) => (
          <PosterTile key={entry.game.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}
