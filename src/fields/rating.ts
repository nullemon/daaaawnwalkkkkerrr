import type { Field } from 'payload'

/**
 * This site's own verdict on a game, and why.
 *
 * The first opinion this network has ever published. Everything else here is a
 * fact with a citation, and the whole argument of the site is that it does not
 * guess — so a score has to be built so that it can never be mistaken for one
 * of those facts.
 *
 * Four things do that work:
 *
 * **It is signed and explained.** A score with no `rationale` does not render.
 * A number on its own is the thing every other site publishes and the thing a
 * reader cannot argue with; the paragraph is the part that is actually worth
 * reading, and making the number depend on it means nobody can ship the number
 * alone.
 *
 * **It says what it is based on.** `basis` is printed beside the number, and
 * there are two of them: a rating from play, and a rating from published
 * material about a game that has shipped.
 *
 * There used to be a third. "Outlook" let a score be published for a game
 * nobody had played, labelled as such — and the hub served Control Resonant at
 * **8.9/10** three weeks before launch on the strength of "Remedy has not
 * missed in a decade". The label was honest and it was not enough: a reader
 * scanning eight tiles reads the figure, and a screenshot of one carries the
 * figure without the six-point word under it. The option is gone, and
 * `src/lib/released.ts` rather than this select decides when a score may be
 * printed at all — a game that is not out shows none, whichever option is
 * ticked. A control that cannot change the outcome is worse than no control,
 * because it reads as one.
 *
 * **It is dated.** A game changes after launch — patches, a rewritten ending,
 * a server shutdown. A score with no date is a claim about a moving target.
 *
 * **And the game has to be out.** Not a property of this group at all — it is
 * `isReleased` in `src/lib/released.ts`, read by `editorialScore` before any
 * of the above is even looked at. It is listed here because an editor filling
 * this in on an unreleased game will see nothing appear on the site and
 * deserves to know why.
 */
export const ratingGroup = (): Field => ({
  name: 'rating',
  type: 'group',
  label: 'Our rating',
  admin: {
    description:
      'The only opinion on this site. It renders only when the score and the reasoning are both filled in — a number with no argument behind it is what everybody else publishes.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'score',
          type: 'number',
          label: 'Score out of 10',
          min: 0,
          max: 10,
          admin: {
            width: '30%',
            step: 0.1,
            description: 'One decimal place. Leave empty for no rating at all.',
          },
        },
        {
          name: 'basis',
          type: 'select',
          label: 'Based on',
          options: [
            { label: 'Playing it', value: 'played' },
            { label: 'Published material about it', value: 'published' },
          ],
          admin: {
            width: '40%',
            description:
              'Printed beside the score. There is no option here for a game that is not out: it shows no score at all, whatever is filled in.',
          },
        },
        {
          name: 'ratedOn',
          type: 'date',
          label: 'Rated on',
          admin: {
            width: '30%',
            date: { pickerAppearance: 'dayOnly' },
            description: 'A game changes after launch; a score with no date is a claim about a moving target.',
          },
        },
      ],
    },
    {
      name: 'summary',
      type: 'text',
      label: 'The verdict in one line',
      maxLength: 160,
      admin: {
        description: 'Shown under the stars and in the directory card. One sentence, not a slogan.',
      },
    },
    {
      name: 'rationale',
      type: 'textarea',
      label: 'Why this score',
      admin: {
        description:
          'Required for the rating to appear anywhere. Say what it does well, what it does badly, and what would move the number — this is the part a reader can disagree with, which is the only thing that makes a score worth publishing.',
      },
    },
  ],
})
