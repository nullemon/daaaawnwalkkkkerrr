import type { Game, Media } from '@/payload-types'
import { companyUrl, personUrl } from '@/lib/urls'
import { slugify } from '@/fields/shared'
import { getUi } from '@/lib/ui'
import { fill } from '@/lib/copy'
import { editorialScore } from '@/lib/ratings'
import { client } from '@/lib/payload'
import { ImageCredit } from './ImageCredit'

/**
 * The factsheet on a wiki's front page.
 *
 * What a reader wants before anything else: what it is, what it costs, who
 * made it and how you play it. Everything here is read off the store listing
 * or the game's Wikipedia infobox by `pnpm seed:game-profile` — nothing is
 * estimated, and a row with no value does not appear at all rather than
 * printing "unknown" thirty times.
 *
 * The one exception is deliberate. Budget, marketing spend and team size get a
 * line saying they are not published, rather than being silently absent,
 * because their absence is itself the answer to a question readers ask and
 * other sites answer with a number somebody made up.
 *
 * Developer and publisher link to their profiles on the companies host, which
 * is the whole reason that host exists.
 *
 * ## No third party's score
 *
 * The only rating on this panel is this network's own, from `editorialScore`,
 * signed and with its reasoning on the page. A borrowed number printed in the
 * same list of rows is read as one of ours, and it makes the score below it
 * look like an average of somebody else's reviews rather than an opinion this
 * site is willing to defend. There used to be a Metacritic row here; it is
 * gone, and nothing replaces it.
 */

type Row = { label: string; value: React.ReactNode }

export async function GameProfile({ game }: { game: Game }) {
  const ui = await getUi()

  /*
    Which of the names on this panel have a profile on the people host.

    Linked from a lookup rather than from `slugify(name)`, because a slug is
    not always the slugification of the name — `slugField` deduplicates, so the
    second Yuki Sato is `yuki-sato-2` — and a row of credits where one in ten
    links to a 404 is worse than a row that links to none. A name with no
    profile stays plain text, which is also the honest rendering: we have a
    credit for them and nothing else.

    One query, depth 0, and it is only the people already related to this game,
    so it is a handful of rows rather than the whole directory.
  */
  const payload = await client()
  const credited = await payload.find({
    collection: 'people',
    where: { games: { contains: game.id } },
    limit: 200,
    depth: 0,
  })
  const profiles = new Map(
    credited.docs.map((person) => [person.name.trim().toLowerCase(), person.slug]),
  )

  /*
    A credit field holds "Jakub Szamałek, Ariana Siarkiewicz" as one string,
    which is how the source writes it. Split for linking, and print the
    original separator back so the row reads as it did.
  */
  const people = (value: string | null | undefined) => {
    const names = (value ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    if (names.length === 0) return null
    return names.map((name, index) => {
      const slug = profiles.get(name.toLowerCase())
      return (
        <span key={name}>
          {index > 0 ? ', ' : ''}
          {slug ? <a href={personUrl(`/${slug}`)}>{name}</a> : name}
        </span>
      )
    })
  }
  const profile = game.profile ?? {}
  const poster =
    profile.poster && typeof profile.poster === 'object' ? (profile.poster as Media) : null
  const hero = game.theme?.hero && typeof game.theme.hero === 'object' ? (game.theme.hero as Media) : null
  /*
    The poster if there is one, the hero only as a last resort.

    They are not interchangeable and the frame has to know which it got: a
    poster is portrait cover art and a hero is a 1920x1080 store screenshot.
    For the whole life of this panel nothing ever filled `poster`, so every
    wiki showed the screenshot — and once the panel moved into a 318px column
    that stopped being a slightly odd choice and became a letterbox.
  */
  const art = poster ?? hero
  const portrait = Boolean(poster)

  /*
    The year, in UTC, for the same reason the release row is formatted in UTC:
    a release is a calendar date, and a date parsed into the reader's zone
    prints the year before for anybody west of the meridian on 1 January.

    Only for a date that is confirmed. "(video game, 2027)" beside a window
    somebody has already moved twice reads as a fact, and an unconfirmed date
    is the one thing on this panel that is most likely to change.
  */
  const year =
    game.releaseDate && game.releaseDateConfirmed !== false
      ? String(new Date(game.releaseDate).getUTCFullYear())
      : ''

  const holders = [game.developer, game.publisher]
    .flatMap((value) => (value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)

  const company = (name: string) => (
    <a key={name} href={companyUrl(`/${slugify(name)}`)}>
      {name}
    </a>
  )

  const join = (names: string[]) =>
    names.map((name, index) => (
      <span key={name}>
        {index > 0 ? ', ' : ''}
        {company(name)}
      </span>
    ))

  const developers = (game.developer ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  const publishers = (game.publisher ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  const modes = (profile.modes ?? []) as string[]
  const verdict = editorialScore(game)

  /* Only rows that have something to say. */
  const rows: Row[] = [
    /*
      Our score, at the top of the panel, because it is the one line on this
      page that is an opinion and burying it among the facts is how a reader
      comes to mistake it for one. `editorialScore` returns null unless both
      the number and the reasoning are there.
    */
    verdict
      ? {
          label: ui.t('profile.our-rating'),
          value: (
            <span className="gameprofile-score">
              <strong>{verdict.score.toFixed(1)}</strong>
              <span className="gameprofile-outof">/ 10</span>
              {verdict.basis ? (
                <span className="gameprofile-basis">{ui.label('rating-basis', verdict.basis)}</span>
              ) : null}
            </span>
          ),
        }
      : null,
    developers.length ? { label: ui.t('profile.developer'), value: join(developers) } : null,
    publishers.length ? { label: ui.t('profile.publisher'), value: join(publishers) } : null,
    profile.series ? { label: ui.t('profile.series'), value: profile.series } : null,
    profile.genre ? { label: ui.t('profile.genre'), value: profile.genre } : null,
    game.releaseDate
      ? {
          label: ui.t('profile.released'),
          value: (
            <>
              {/*
                Formatted in UTC, because it is stored in UTC. A release is a
                calendar date rather than an instant, and rendering it in the
                reader's zone prints the day before for anyone west of the
                meridian.
              */}
              {new Date(game.releaseDate).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
              {game.releaseDateConfirmed === false ? ui.t('profile.release-unconfirmed') : ''}
            </>
          ),
        }
      : null,
    (game.platforms ?? []).length
      ? { label: ui.t('profile.platforms'), value: (game.platforms as string[]).join(' · ') }
      : null,
    profile.priceText || profile.isFree
      ? { label: ui.t('profile.price'), value: profile.isFree ? ui.t('profile.free') : profile.priceText }
      : null,
    profile.microtransactions
      ? { label: ui.t('profile.microtransactions'), value: ui.t('profile.microtransactions-value') }
      : null,
    profile.editionCount ? { label: ui.t('profile.editions'), value: profile.editionCount } : null,
    profile.dlcCount ? { label: ui.t('profile.dlc'), value: profile.dlcCount } : null,
    modes.length
      ? { label: ui.t('profile.modes'), value: modes.map((m) => ui.label('mode', m, m)).join(' · ') }
      : null,
    profile.maxPlayers ? { label: ui.t('profile.players'), value: profile.maxPlayers } : null,
    profile.onlineRequired && profile.onlineRequired !== 'unknown'
      ? {
          label: ui.t('profile.internet'),
          value: ui.label('online', profile.onlineRequired, profile.onlineRequired),
        }
      : null,
    profile.engine ? { label: ui.t('profile.engine'), value: profile.engine } : null,
    profile.director ? { label: ui.t('profile.director'), value: people(profile.director) } : null,
    profile.designer ? { label: ui.t('profile.designer'), value: people(profile.designer) } : null,
    profile.artist ? { label: ui.t('profile.artist'), value: people(profile.artist) } : null,
    profile.writer ? { label: ui.t('profile.writer'), value: people(profile.writer) } : null,
    profile.composer ? { label: ui.t('profile.composer'), value: people(profile.composer) } : null,
    profile.budget ? { label: ui.t('profile.budget'), value: profile.budget } : null,
    profile.marketingSpend
      ? { label: ui.t('profile.marketing'), value: profile.marketingSpend }
      : null,
    profile.teamSize ? { label: ui.t('profile.team-size'), value: profile.teamSize } : null,
  ].filter(Boolean) as Row[]

  if (rows.length === 0 && !art?.url) return null

  const undisclosed = !profile.budget && !profile.marketingSpend && !profile.teamSize

  return (
    <aside className="gameprofile" aria-labelledby="gameprofile-head">
      <h2 className="gameprofile-title" id="gameprofile-head">
        {fill(ui.t(year ? 'profile.title-dated' : 'profile.title'), {
          game: game.shortTitle || game.title,
          year,
        })}
      </h2>

      {art?.url ? (
        <figure className="gameprofile-art" data-portrait={portrait ? 'true' : 'false'}>
          <img
            src={art.sizes?.card?.url ?? art.url}
            alt={art.alt ?? `${game.title} cover art`}
            /*
              Not lazy. On a phone this is the first image below the search,
              which makes it a candidate for the largest contentful paint —
              and a lazy attribute on the LCP element is the one place the
              attribute costs more than it saves.
            */
            fetchPriority="high"
            decoding="async"
          />
          {/*
            Through `ImageCredit`, which is what made this the odd one out:
            `showImageCredits` was honoured by the record figure and by the
            header band and ignored here, so turning the setting off left the
            factsheet on all eight wiki homes crediting its cover art anyway.
            `narrow` because this panel is 318px wide — the box the
            2,369-character credit vanished inside in `4206c56`.
          */}
          <ImageCredit credit={art.credit} slot="narrow" />
        </figure>
      ) : null}

      <dl className="gameprofile-facts">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      {profile.releaseNote ? <p className="gameprofile-note">{profile.releaseNote}</p> : null}

      {profile.commercialNote ? <p className="gameprofile-note">{profile.commercialNote}</p> : null}

      {undisclosed ? (
        /*
          Said rather than left out. "How much did it cost to make" is one of
          the questions readers actually type, and the honest answer for almost
          every game is that nobody outside the publisher knows — which is more
          useful than a figure a forum invented, and is the same rule the quest
          costs follow.
        */
        <p className="gameprofile-note">{ui.t('profile.undisclosed')}</p>
      ) : null}
    </aside>
  )
}
