import type { Field } from 'payload'

/**
 * This site's own verdict on a game, and why.
 *
 * The first opinion this network has ever published. Everything else here is a
 * fact with a citation, and the whole argument of the site is that it does not
 * guess — so a score has to be built so that it can never be mistaken for one
 * of those facts.
 *
 * Three things do that work:
 *
 * **It is signed and explained.** A score with no `rationale` does not render.
 * A number on its own is the thing every other site publishes and the thing a
 * reader cannot argue with; the paragraph is the part that is actually worth
 * reading, and making the number depend on it means nobody can ship the number
 * alone.
 *
 * **It says what it is based on.** Four of these eight games are not out. A
 * review score for a game nobody has played is not a review score, so `basis`
 * is required and is printed beside the number: a rating from play, a rating
 * from published material, or an outlook. An outlook is a different kind of
 * claim and the page says so rather than hoping the reader assumes it.
 *
 * **It is dated.** A game changes after launch — patches, a rewritten ending,
 * a server shutdown. A score with no date is a claim about a moving target.
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
            { label: 'Outlook — it is not out yet', value: 'outlook' },
          ],
          admin: {
            width: '40%',
            description:
              'Printed beside the score. An outlook is not a review and the page must not let a reader think it is.',
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
