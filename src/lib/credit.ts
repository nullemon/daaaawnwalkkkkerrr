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

/* -------------------------------------------------------------------------
   What kind of thing a stored credit is crediting
   ------------------------------------------------------------------------- */

/**
 * The five families of credit actually stored in `media.credit`.
 *
 * Read off the 2,254 rows rather than invented, because the mark printed
 * beside a credit is itself a claim and the wrong one is a false statement in
 * two characters:
 *
 * - `rights` — key art, cover art and screenshots. 1,400-odd rows shaped
 *   `<title> © <holder>. Used for identification and commentary.` (or the same
 *   with the word `copyright`). All rights reserved, used under a fair-dealing
 *   argument a credit supports. **`©` belongs here and only here.**
 * - `photograph` — `Photograph of <person> by <photographer>. <licence>.` A
 *   real photograph by a named person, from Commons, under CC or public
 *   domain. This is the one a camera belongs on: somebody pressed a shutter.
 * - `licence` — a company logo, `<name> logo (Public domain) — <author>` or
 *   `(CC BY-SA 4.0)`. Not a photograph, so no camera; and a little over half
 *   of the 105 are **public domain**, where printing `©` would assert a
 *   copyright the file explicitly does not carry.
 * - `generated` — an emblem this site drew from the record slug. Ours,
 *   photographed by nobody, and the credit says so. Neither mark applies.
 * - `plain` — anything that says none of the above. No mark rather than a
 *   guess, on the Antar 4 principle: a rule written to mark the right files
 *   is still a rule, and an over-confident one mislabels the rest silently.
 *
 * Kept here, beside the seeders' own formatters, so the writer and the reader
 * of these strings cannot drift apart.
 */
export type CreditBasis = 'rights' | 'photograph' | 'licence' | 'generated' | 'plain' | 'none'

/** A free licence named in the credit: `CC BY-SA 4.0`, `CC0`, `Public domain`. */
const FREE_LICENCE = /\bCC[0\s-]|\bCC BY\b|\bpublic domain\b/i

export const creditBasis = (credit?: string | null): CreditBasis => {
  const text = credit?.trim()
  if (!text) return 'none'

  /*
    Ours first, because "Generated placeholder — replace with a photograph"
    contains the word photograph and would otherwise be filed as one. The same
    trap as `CUBOT_NOTE_20`: the discriminating word appears in a sentence
    that is about its absence.
  */
  if (/\bgenerated (?:by this site|placeholder)\b/i.test(text)) return 'generated'

  /*
    Anchored on `photograph of|by`, never on the bare word. `by` as well as
    `of` because a caption can lead with either and both name a photographer.
  */
  if (/\bphotograph(?:s|ed)?\s+(?:of|by)\b/i.test(text)) return 'photograph'

  /*
    Before `rights`, not after. `TMS Entertainment logo (Public domain) — ©
    2013 TMS ENTERTAINMENT CO., LTD.` carries a `©` inside the author field
    Commons gave us while the file itself is public domain, and reading the
    glyph first would mark a public-domain logo as all-rights-reserved.
  */
  if (FREE_LICENCE.test(text)) return 'licence'

  if (/©|\bcopyright\b|\ball rights reserved\b/i.test(text)) return 'rights'

  return 'plain'
}

/**
 * The mark printed beside a credit — one per basis, and `null` is a valid
 * answer.
 *
 * `copyright` is the `©` character rather than an icon: it is the mark the
 * law and the credit line itself already use, and no drawing of it is as
 * legible at 13px. Everything else is from our own icon set.
 */
export type CreditMark = 'camera' | 'copyright' | 'licence' | 'generated' | null

export const creditMark = (basis: CreditBasis): CreditMark => {
  switch (basis) {
    case 'photograph':
      return 'camera'
    case 'rights':
      return 'copyright'
    case 'licence':
      return 'licence'
    case 'generated':
      return 'generated'
    default:
      return null
  }
}

/**
 * Inside the picture, or under it.
 *
 * The credit belongs inside the photograph — that is the whole point of the
 * overlay — but an overlay is a box the size of its text sitting on top of the
 * thing a reader came to look at, and these strings have no agreed length.
 * One live credit is 269 characters (Phantom Blade Zero's cover, carrying two
 * archive notices), and the emblem credit is 131 on 103 records.
 *
 * **The one thing it must never do is hide any of it.** Three figcaptions
 * clipped an over-long credit to nothing inside `overflow: hidden` until
 * `4206c56`, which is how 2,369 characters of Wikipedia's stylesheet sat in a
 * field for months with the page looking perfect. A clamp, a fade-out or a
 * scroller inside the overlay would be that bug again in a new place.
 *
 * So the degradation is *placement*, not truncation: past the budget for its
 * slot the credit stops being an overlay and prints under the picture, in the
 * solid-surface caption that has always been able to hold any length. Nothing
 * is shortened and nothing is hidden in either branch.
 *
 * The budgets are three lines of `.imgcredit` at each slot's own width, which
 * is as much of a picture as a credit may cover:
 *
 * - `narrow` — the 260–318px panels: a square record figure, `GameProfile`,
 *   `PersonProfile`, a company logo. ~40 characters a line.
 * - `wide` — a 640px record figure or a guide's lead image. ~65 a line.
 * - `band` — the full-bleed header bands (the hub hero, a wiki masthead, a
 *   section header). Always an overlay: the band is the picture and spans the
 *   page, so there is no "under it" to fall back to and no width at which the
 *   credit crowds anything.
 */
export type CreditSlot = 'narrow' | 'wide' | 'band'

export const CREDIT_BUDGET: Record<CreditSlot, number> = {
  narrow: 120,
  wide: 195,
  band: Infinity,
}

export const creditPlacement = (
  credit: string | null | undefined,
  slot: CreditSlot = 'wide',
): 'overlay' | 'below' =>
  (credit?.trim().length ?? 0) <= CREDIT_BUDGET[slot] ? 'overlay' : 'below'

/**
 * Every developer and publisher the network covers, named once each.
 *
 * The hub's terms page disclaimed connection to "Rebel Wolves, Bandai Namco
 * Entertainment, or anyone involved in making The Blood of Dawnwalker", and
 * the contact page sent people with account problems to Bandai Namco. Both
 * were written for a one-game site and both sit on the hub, which covers
 * eight. A disclaimer that names one game's rightsholders does not disclaim
 * anything about the other seven, which is the half that matters.
 */
export const rightsholders = (
  games: Pick<Game, 'developer' | 'publisher'>[],
): string[] => {
  const names: string[] = []
  for (const game of games) {
    for (const holder of [game.developer, game.publisher]) {
      // One field can hold two companies - Townfall is published by "Konami,
      // Annapurna Interactive" - and inside a comma-separated sentence that
      // reads as one ambiguous run. Split them so each is named in its own
      // right.
      for (const part of (holder ?? '').split(',')) {
        const name = part.trim()
        if (name && !names.includes(name)) names.push(name)
      }
    }
  }
  return names.sort((a, b) => a.localeCompare(b))
}

/** "a, b and c" - an Oxford-free list for running prose. */
export const listSentence = (items: string[]): string => {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
