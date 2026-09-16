import type { Game, Media } from '@/payload-types'
import { companyUrl } from '@/lib/urls'
import { slugify } from '@/fields/shared'
import { getUi } from '@/lib/ui'
import { fill } from '@/lib/copy'

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
 */

type Row = { label: string; value: React.ReactNode }

export async function GameProfile({ game }: { game: Game }) {
  const ui = await getUi()
  const profile = game.profile ?? {}
  const poster =
    profile.poster && typeof profile.poster === 'object' ? (profile.poster as Media) : null
  const hero = game.theme?.hero && typeof game.theme.hero === 'object' ? (game.theme.hero as Media) : null
  const art = poster ?? hero

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

  /* Only rows that have something to say. */
  const rows: Row[] = [
    developers.length ? { label: ui.t('profile.developer'), value: join(developers) } : null,
    publishers.length ? { label: ui.t('profile.publisher'), value: join(publishers) } : null,
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
    (game.platforms ?? []).length
      ? { label: ui.t('profile.platforms'), value: (game.platforms as string[]).join(' · ') }
      : null,
    profile.engine ? { label: ui.t('profile.engine'), value: profile.engine } : null,
    profile.series ? { label: ui.t('profile.series'), value: profile.series } : null,
    profile.director ? { label: ui.t('profile.director'), value: profile.director } : null,
    profile.composer ? { label: ui.t('profile.composer'), value: profile.composer } : null,
    profile.metacritic ? { label: ui.t('profile.metacritic'), value: profile.metacritic } : null,
    profile.budget ? { label: ui.t('profile.budget'), value: profile.budget } : null,
    profile.marketingSpend
      ? { label: ui.t('profile.marketing'), value: profile.marketingSpend }
      : null,
    profile.teamSize ? { label: ui.t('profile.team-size'), value: profile.teamSize } : null,
  ].filter(Boolean) as Row[]

  if (rows.length === 0) return null

  const undisclosed = !profile.budget && !profile.marketingSpend && !profile.teamSize

  return (
    <section className="gameprofile" aria-labelledby="gameprofile-head">
      <div className="section-head">
        <h2 id="gameprofile-head">
          {fill(ui.t('profile.at-a-glance'), { game: game.shortTitle || game.title })}
        </h2>
      </div>

      <div className="gameprofile-body">
        {art?.url ? (
          <figure className="gameprofile-art">
            <img
              src={art.sizes?.card?.url ?? art.url}
              alt={art.alt ?? `${game.title} key art`}
              loading="lazy"
              decoding="async"
            />
            {art.credit ? <figcaption>{art.credit}</figcaption> : null}
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
      </div>

      {profile.releaseNote ? <p className="note">{profile.releaseNote}</p> : null}

      {profile.commercialNote ? <p className="note">{profile.commercialNote}</p> : null}

      {undisclosed ? (
        /*
          Said rather than left out. "How much did it cost to make" is one of
          the questions readers actually type, and the honest answer for almost
          every game is that nobody outside the publisher knows — which is more
          useful than a figure a forum invented, and is the same rule the quest
          costs follow.
        */
        <p className="note">{ui.t('profile.undisclosed')}</p>
      ) : null}
    </section>
  )
}
