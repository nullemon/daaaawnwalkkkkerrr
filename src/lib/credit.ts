import type { Game } from '@/payload-types'

/**
 * The rightsholder line under a row of screenshots.
 *
 * It was one hardcoded sentence — "The Blood of Dawnwalker © Rebel Wolves /
 * Bandai Namco Entertainment." — printed under the images on every guide on
 * every wiki. Three hundred and eighteen guides about seven other games
 * credited Dawnwalker's developer and publisher for artwork belonging to
 * Capcom, Konami, Xbox Game Studios and the rest.
 *
 * Getting a credit wrong is worse than most wrong sentences here, because a
 * credit is the thing standing between using somebody's screenshot and taking
 * it. So it is built from the game's own `developer` and `publisher`, and it
 * names nobody it cannot name from the record.
 *
 * Kept free of JSX so it can be unit-tested without a renderer.
 */
export const rightsCredit = (
  game: Pick<Game, 'title' | 'developer' | 'publisher'> | null | undefined,
): string | null => {
  if (!game?.title) return null

  // Capcom publishes Capcom's games, and "Capcom / Capcom" reads as a
  // mistake even though both fields are right.
  const holders = [game.developer, game.publisher]
    .map((holder) => holder?.trim())
    .filter((holder): holder is string => Boolean(holder))
  const unique = holders.filter((holder, index) => holders.indexOf(holder) === index)

  // No named holder is a gap, not a licence. Say the game is somebody's
  // without guessing whose.
  if (unique.length === 0) return `${game.title} © its rightsholders.`
  return `${game.title} © ${unique.join(' / ')}.`
}

/**
 * The disclaimer in the footer of a wiki.
 *
 * This was one string on the network's Site settings, so every page of every
 * wiki said "The Blood of Dawnwalker is developed by Rebel Wolves and
 * published by Bandai Namco Entertainment" — on the Silent Hill wiki, the
 * Gears of War wiki and five others. A disclaimer that names the wrong game
 * is not a disclaimer; it is a second error being made on every page at once,
 * and it appeared on all of them because it was correct for the only wiki
 * that existed when it was written.
 *
 * The network setting stays as the hub's note and as the fallback. A wiki
 * builds its own from its own record.
 */
export const fanProjectNote = (
  game: Pick<Game, 'title' | 'developer' | 'publisher'> | null | undefined,
  fallback?: string | null,
): string | null | undefined => {
  if (!game?.title) return fallback

  const developer = game.developer?.trim()
  const publisher = game.publisher?.trim()

  // Who made it, in whatever detail the record actually has. No sentence at
  // all beats one built around an empty field.
  let made: string | null = null
  if (developer && publisher && developer !== publisher) {
    made = `${game.title} is developed by ${developer} and published by ${publisher}.`
  } else if (developer || publisher) {
    made = `${game.title} is developed and published by ${developer || publisher}.`
  }

  return [
    'Unofficial fan project.',
    made,
    'No affiliation is claimed.',
    'Facts are compiled from public sources and have not been verified against the game.',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * The credit stored on an image record.
 *
 * Three seed passes built this string by hand as `${title} (c) ${publisher}.`,
 * which is right until the publisher's legal name ends in a full stop of its
 * own: "Onimusha: Way of the Sword (c) CAPCOM Co., Ltd.. Used for
 * identification and commentary." Small, but it is printed under the art on
 * every page that carries any, and a credit is the wrong place to look
 * careless.
 */
export const mediaCredit = (title: string, publisher?: string | null): string => {
  const holder = publisher?.trim() || 'its publisher'
  const stopped = /[.!?]$/.test(holder) ? holder : `${holder}.`
  return `${title} © ${stopped} Used for identification and commentary.`
}
