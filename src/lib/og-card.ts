import { creditBasis, creditMark } from './credit'

/**
 * What a drawn share card is allowed to put on itself.
 *
 * Deliberately free of Payload types, of `next/og` and of any I/O, the same
 * way `reachability.ts` and `sitemap-images.ts` are, because the judgements
 * here are the whole risk and the renderer is only arithmetic. A card is an
 * image this network publishes with its own mark on it; every decision below
 * exists to stop that mark being stamped over a claim we cannot make.
 *
 * ## The claim a share card makes
 *
 * A guide's lead image is a screenshot belonging to the game's publisher,
 * carried under the fair-dealing argument its credit line supports. Compositing
 * the network's wordmark and an accent rule over it and serving the result as
 * `og:image` produces a picture that looks, in a Discord embed with nothing
 * around it, exactly like artwork this site made. That is the `ART_GAME`
 * mistake arriving through a third door: the Onimusha Regions page opened with
 * Dawnwalker footage credited to Rebel Wolves because nothing made the caller
 * name the game, and `public/og.png` was Dawnwalker key art declared as the
 * share card for three hosts that are not about that game.
 *
 * So the rule is short: **the card prints the photograph's credit, in full, or
 * it does not use the photograph.** There is no third option where the picture
 * is used and the credit is shortened to fit — that is `4206c56` again, the
 * commit where three figcaptions clipped an over-long credit to nothing inside
 * `overflow: hidden` and the page looked perfect for months.
 *
 * ## Why the fallback is a drawn ground rather than a shorter credit
 *
 * `creditPlacement` in `credit.ts` degrades by *placement*: past its budget a
 * credit stops being an overlay and prints under the picture, whole. A share
 * card is 1200×630 and nothing else — there is no "under the picture" to move
 * to, because the card *is* the picture. The only thing left to give up is the
 * photograph, so that is what is given up. A card with no photograph is still
 * a good card; a card with a photograph and no credit is a false one.
 */

/**
 * Why a card is showing the drawn ground instead of the page's own picture.
 *
 * Carried rather than inferred so the route can log it and the tests can pin
 * each branch. `uncredited` is the one worth noticing in a log: it means a
 * media row has no credit at all, which is a gap in the library rather than in
 * this file.
 */
export type DrawnBecause =
  | 'no-image'
  | 'uncredited'
  | 'credit-will-not-fit'
  | 'credits-switched-off'

export type CardGround =
  | {
      kind: 'photograph'
      /** Printed whole, never trimmed. */
      credit: string
      /**
       * The mark beside it, or none.
       *
       * Only `©` is ever drawn. `creditMark` in `credit.ts` also answers
       * `camera`, `licence` and `generated`, and those three are glyphs from
       * this site's icon set — satori has no access to them, and substituting
       * the one mark it *can* draw would put `©` on a public-domain logo,
       * which is the exact two-character false claim that function exists to
       * prevent. No mark is a correct answer; a wrong one is not.
       */
      copyright: boolean
    }
  | { kind: 'drawn'; because: DrawnBecause }

/**
 * How much credit the foot strip holds.
 *
 * Three lines of Barlow Semi Condensed 400 at 17px across the strip's ~940px
 * of usable width, which is roughly 110 characters a line. The strip is a
 * solid band rather than a translucent overlay, so those three lines sit
 * *under* the picture in the same sense `creditPlacement`'s `below` branch
 * does, rather than hiding part of it.
 *
 * Every one of the 408 guide lead images in the library today is between 67
 * and 103 characters, so nothing in stock reaches this. It is here for the
 * ones that would: Phantom Blade Zero's cover credit is 269 characters and
 * carries two archive notices, and the emblem credit is 131 on 103 records.
 */
export const CARD_CREDIT_BUDGET = 330

/**
 * Whether this card may use the page's own photograph, and what it must print
 * beside it if it does.
 *
 * An options object with three required fields rather than three positional
 * arguments, so leaving one out is a compile error. Same reason
 * `sectionArt(game, name)` takes the asking game first: a check that can be
 * forgotten is a check that will be.
 *
 * - `photograph` — whether the page has a real picture at all. Decided by the
 *   caller through `recordImage` in `social.ts`, which already refuses the six
 *   collections whose picture is an emblem this site drew: a generated emblem
 *   depicts nothing, and putting one behind a headline tells a reader
 *   scrolling Discord that they are looking at a picture of Walking Fortress.
 * - `credit` — the credit stored on that upload.
 * - `creditsShown` — `showImageCredits` on Site settings.
 *
 * ## Why the owner's credits switch reaches this far
 *
 * `ImageCredit` reads `showImageCredits` and prints nothing when it is off.
 * There is no version of that behaviour here where the card keeps the
 * photograph and drops the line, because the rule above has no exception in
 * it: the card prints the credit in full, or it does not use the picture. A
 * switch that turns credits off cannot print the credit, so the card gives up
 * the picture and draws its own ground.
 *
 * That is not the switch being overridden — it is the switch being honoured
 * exactly, with the one thing it cannot do spelled out. A page with credits
 * off still carries the footer's rightsholder note and the fan-project
 * disclaimer under every picture on it; a share card leaves the site with this
 * network's wordmark on it and nothing else at all.
 */
export const cardGround = (options: {
  photograph: boolean
  credit: string | null | undefined
  creditsShown: boolean
}): CardGround => {
  if (!options.photograph) return { kind: 'drawn', because: 'no-image' }
  if (!options.creditsShown) return { kind: 'drawn', because: 'credits-switched-off' }

  const text = options.credit?.trim() ?? ''
  const basis = creditBasis(text)

  // No credit is not permission. An uncredited photograph under this
  // network's wordmark is the one output this route must never produce.
  if (basis === 'none') return { kind: 'drawn', because: 'uncredited' }

  if (text.length > CARD_CREDIT_BUDGET) {
    return { kind: 'drawn', because: 'credit-will-not-fit' }
  }

  return { kind: 'photograph', credit: text, copyright: creditMark(basis) === 'copyright' }
}

/**
 * The title's size, in px, for a title of this length.
 *
 * Satori lays out and wraps text but reports nothing back, so a card cannot
 * measure its own headline and shrink to fit the way a browser could be made
 * to. The steps below are read off the live data: guide titles on this network
 * run from 21 to 83 characters, and the four bands are where each one stops
 * fitting the title box in four lines.
 *
 * Steps rather than a continuous formula because a formula makes every card a
 * slightly different size for no reason a reader could name, and because a
 * step is a number somebody can check against a rendered card.
 */
export const cardTitleSize = (title: string): number => {
  const length = title.trim().length
  if (length <= 34) return 62
  if (length <= 56) return 54
  if (length <= 72) return 46
  return 40
}

/**
 * The ruled ground, as y offsets.
 *
 * A leaf of vellum was pricked and ruled before it was written on, and that
 * ruling is what `public/og.png` uses as its backdrop — so the drawn card here
 * is visibly the same object as the network's own, rather than a second design
 * that happens to share a colour. 42px apart for the same reason it is there:
 * it reads as a prepared surface at full size and as nothing at all in a
 * 300px-wide timeline crop.
 *
 * Returned as a list of offsets because satori's gradient support does not
 * include `repeating-linear-gradient`, and fifteen one-pixel divs is a thing
 * that either renders or does not rather than a thing that might.
 */
export const CARD_RULE_GAP = 42

export const cardRules = (height: number): number[] => {
  const lines: number[] = []
  for (let y = CARD_RULE_GAP; y < height; y += CARD_RULE_GAP) lines.push(y)
  return lines
}

/**
 * The collections whose pages point their `og:image` at the drawn card.
 *
 * One list, read by `cardImage` in `social.ts` when it composes the URL and by
 * the route when it decides whether to answer for a path. Two lists would mean
 * a page could declare a card the route refuses to draw, which is a 404 in an
 * `og:image` — and a link with no preview is the quietest failure a share card
 * has, because nobody sees their own unfurl.
 *
 * `guides` alone today. Guides are the pages with a headline worth putting on
 * a card: they carry a title written as a sentence, a byline and a lead
 * photograph from their own game. A record page's title is a proper noun and
 * its own picture already says more than a card would.
 */
export const OG_CARD_COLLECTIONS = ['guides'] as const

export type OgCardCollection = (typeof OG_CARD_COLLECTIONS)[number]

export const isOgCardCollection = (value: string): value is OgCardCollection =>
  (OG_CARD_COLLECTIONS as readonly string[]).includes(value)
