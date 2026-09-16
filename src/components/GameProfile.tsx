import type { Game, Media } from '@/payload-types'
import { companyUrl } from '@/lib/urls'
import { slugify } from '@/fields/shared'

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

const MODE_LABEL: Record<string, string> = {
  'single-player': 'Single-player',
  multiplayer: 'Multiplayer',
  'co-op': 'Co-op',
  'online-co-op': 'Online co-op',
  pvp: 'PvP',
  'online-pvp': 'Online PvP',
  'cross-platform': 'Cross-platform',
}

const ONLINE_LABEL: Record<string, string> = {
  no: 'Not required — plays offline',
  multiplayer: 'Only for multiplayer',
  yes: 'Always online',
}

type Row = { label: string; value: React.ReactNode }

export function GameProfile({ game }: { game: Game }) {
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
    developers.length ? { label: 'Developer', value: join(developers) } : null,
    publishers.length ? { label: 'Publisher', value: join(publishers) } : null,
    game.releaseDate
      ? {
          label: 'Released',
          value: (
            <>
              {new Date(game.releaseDate).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {game.releaseDateConfirmed === false ? ' (not confirmed)' : ''}
            </>
          ),
        }
      : null,
    profile.priceText || profile.isFree
      ? { label: 'Price', value: profile.isFree ? 'Free to play' : profile.priceText }
      : null,
    profile.microtransactions ? { label: 'In-app purchases', value: 'Yes, per the store listing' } : null,
    profile.editionCount ? { label: 'Editions', value: profile.editionCount } : null,
    profile.dlcCount ? { label: 'DLC and add-ons', value: profile.dlcCount } : null,
    modes.length
      ? { label: 'Modes', value: modes.map((m) => MODE_LABEL[m] ?? m).join(' · ') }
      : null,
    profile.maxPlayers ? { label: 'Players', value: profile.maxPlayers } : null,
    profile.onlineRequired && profile.onlineRequired !== 'unknown'
      ? { label: 'Internet', value: ONLINE_LABEL[profile.onlineRequired] ?? profile.onlineRequired }
      : null,
    (game.platforms ?? []).length
      ? { label: 'Platforms', value: (game.platforms as string[]).join(' · ') }
      : null,
    profile.engine ? { label: 'Engine', value: profile.engine } : null,
    profile.series ? { label: 'Series', value: profile.series } : null,
    profile.director ? { label: 'Director', value: profile.director } : null,
    profile.composer ? { label: 'Composer', value: profile.composer } : null,
    profile.metacritic ? { label: 'Metacritic', value: profile.metacritic } : null,
    profile.budget ? { label: 'Budget', value: profile.budget } : null,
    profile.marketingSpend ? { label: 'Marketing spend', value: profile.marketingSpend } : null,
    profile.teamSize ? { label: 'Team size', value: profile.teamSize } : null,
  ].filter(Boolean) as Row[]

  if (rows.length === 0) return null

  const undisclosed = !profile.budget && !profile.marketingSpend && !profile.teamSize

  return (
    <section className="gameprofile" aria-labelledby="gameprofile-head">
      <div className="section-head">
        <h2 id="gameprofile-head">{game.shortTitle || game.title} at a glance</h2>
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

      {profile.commercialNote ? <p className="note">{profile.commercialNote}</p> : null}

      {undisclosed ? (
        /*
          Said rather than left out. "How much did it cost to make" is one of
          the questions readers actually type, and the honest answer for almost
          every game is that nobody outside the publisher knows — which is more
          useful than a figure a forum invented, and is the same rule the quest
          costs follow.
        */
        <p className="note">
          Development budget, marketing spend and team size are not published for this game. Where a
          studio or publisher states one on the record, it will appear here with its source.
        </p>
      ) : null}
    </section>
  )
}
