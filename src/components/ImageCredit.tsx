import { Icon, type IconName } from './Icon'
import { getSiteSettings } from '@/lib/payload'
import { creditBasis, creditMark, creditPlacement, type CreditSlot } from '@/lib/credit'

/**
 * The credit for one picture, printed inside the picture.
 *
 * ## One switch, one component
 *
 * `showImageCredits` was read in two places and ignored in a third:
 * `EntityImage` and `PageHeader` honoured it, `GameProfile` printed its
 * figcaption unconditionally and `PersonProfile` and the companies logo
 * printed theirs the same way — so a single page could credit the cover art
 * and not the record photograph beside it, and nothing said which behaviour
 * was the intended one. Every image credit on the network now comes through
 * here, so the setting decides for all of them or for none of them.
 *
 * It is **on** now, by the owner's decision, taken with the CC BY-SA
 * consequence in front of him: several hundred images arrive from wikis whose
 * media is CC BY-SA, and attribution is that licence's condition rather than
 * its courtesy.
 *
 * ## The mark follows the basis
 *
 * A camera on a company logo would say a photographer took it; a `©` on a
 * public-domain file would assert a copyright the file does not carry. So the
 * mark is chosen from what the credit actually is — `creditBasis` in
 * `src/lib/credit.ts`, which is unit-tested against the real stored strings —
 * and `plain` gets no mark at all rather than a decorative one.
 *
 * ## It never hides a word of it
 *
 * `creditPlacement` decides overlay or under-the-picture on the length of the
 * credit and the width of the slot, because an overlay that clamps, fades or
 * scrolls an over-long credit is `4206c56` happening again somewhere new. See
 * the note on that function; the whole rule is there.
 */
export async function ImageCredit({
  credit,
  slot = 'wide',
  as = 'figcaption',
  ground = 'photo',
}: {
  credit?: string | null
  /** How much room this picture's credit has. See `CreditSlot`. */
  slot?: CreditSlot
  /**
   * What the overlay is sitting on.
   *
   * `photo` is the default and carries the dark scrim the contrast figures
   * were measured against — the only thing that makes light text safe over a
   * photograph nobody has graded.
   *
   * `panel` is for a picture that is not a photograph and is not full-bleed:
   * a company logo, which arrives as a transparent PNG centred on
   * `--surface` with 22px of padding round it. A near-black scrim there is a
   * black bar across a light panel in the light theme, and there is no
   * photograph under it for the scrim to be protecting the text from. It
   * takes the panel's own tokens and a rule instead.
   */
  ground?: 'photo' | 'panel'
  /**
   * `figcaption` inside a `<figure>`, `p` anywhere else.
   *
   * The three header bands — the hub hero, a wiki masthead, a section header
   * — carry their art as a decorative background or an `aria-hidden` `<img>`
   * rather than as a figure, and a `<figcaption>` outside a `<figure>` is
   * invalid markup that a screen reader announces as nothing in particular.
   */
  as?: 'figcaption' | 'p'
}) {
  const text = credit?.trim()
  if (!text) return null

  const settings = await getSiteSettings()
  if (!settings.showImageCredits) return null

  const basis = creditBasis(text)
  const mark = creditMark(basis)
  const place = creditPlacement(text, slot)
  const Tag = as

  /* `aria-hidden` on every mark. The credit sentence already names the
     licence and the holder in words, so the glyph is a visual restatement of
     text that is right there — announcing "copyright" before a line that
     reads "© Electronic Arts" is noise, and announcing "seal" is worse. */
  const icons: Record<Exclude<typeof mark, null | 'copyright'>, IconName> = {
    camera: 'camera',
    licence: 'licence',
    generated: 'spark',
  }

  return (
    <Tag
      className="imgcredit"
      data-place={place}
      data-basis={basis}
      data-ground={ground}
      data-slot={slot}
    >
      {mark === 'copyright' ? (
        <span className="imgcredit-mark" aria-hidden="true">
          ©
        </span>
      ) : mark ? (
        <span className="imgcredit-mark" aria-hidden="true">
          <Icon name={icons[mark]} size={13} />
        </span>
      ) : null}
      <span className="imgcredit-text">{text}</span>
    </Tag>
  )
}
