import { describe, expect, it } from 'vitest'
import { relatedGuides, type GuideLike } from './related-guides'

const NAMES = ['The Blood of Dawnwalker', 'Dawnwalker']

const guide = (slug: string, title: string, date?: string): GuideLike => ({
  id: slug,
  title,
  slug,
  date: date ?? null,
})

/* Real titles off the Dawnwalker wiki, shortened. */
const ALL: GuideLike[] = [
  guide('anca-guide', 'Anca: The Cheapest Romance and the Earliest Companion', '2026-09-17'),
  guide('romance-guide', 'Every romance in The Blood of Dawnwalker', '2026-09-16'),
  guide('companions-guide', 'Companions and when each one joins', '2026-09-15'),
  guide('achievements-known', 'Every achievement in The Blood of Dawnwalker', '2026-09-17'),
  guide('rarity-bands', 'The rarest achievements and how few players have them', '2026-09-14'),
  guide('what-kind-of-game', 'What kind of game The Blood of Dawnwalker is', '2026-09-13'),
  guide('cloud-saves', 'Cloud saves and cross-platform progress', '2026-09-12'),
  guide('content-warnings', 'Content warnings', '2026-09-11'),
]

const slugs = (rows: GuideLike[]) => rows.map((row) => row.slug)

describe('relatedGuides', () => {
  it('never lists the guide it is beside', () => {
    const current = ALL[0]
    expect(slugs(relatedGuides(current, ALL, NAMES))).not.toContain(current.slug)
  })

  it('leads with the guides that share a word, whatever their date', () => {
    /*
      Anca's page is about a romance and a companion. `achievements-known` is
      the newest guide on this wiki and has nothing to do with either, so under
      the old rule — the collection sorted on a date and sliced — it led.
    */
    const shown = slugs(relatedGuides(ALL[0], ALL, NAMES))
    expect(shown.slice(0, 2)).toEqual(['romance-guide', 'companions-guide'])
    expect(shown.indexOf('achievements-known')).toBe(2)
  })

  /*
    The defect this replaced. Every article on a wiki showed the same six,
    because the list was the collection sorted on one column and sliced.
  */
  it('gives two different guides two different rails', () => {
    const anca = slugs(relatedGuides(ALL[0], ALL, NAMES)).slice(0, 3)
    const achievements = slugs(relatedGuides(ALL[3], ALL, NAMES)).slice(0, 3)
    expect(anca).not.toEqual(achievements)
    expect(anca[0]).toBe('romance-guide')
    expect(achievements[0]).toBe('rarity-bands')
  })

  it('does not relate two guides that share only the game name', () => {
    /*
      `what-kind-of-game` and `achievements-known` have nothing in common but
      "The Blood of Dawnwalker". Without the discount that is four shared words
      and the strongest match on the wiki — the failure `lib/terms.ts` records.
    */
    const onlyScored = relatedGuides(
      ALL[3],
      [ALL[5]],
      NAMES,
      6,
    )
    // It still appears, because the rail tops up from the newest — but as a
    // top-up, never as a claim of relation.
    expect(slugs(onlyScored)).toEqual(['what-kind-of-game'])

    const scoredAgainstReal = slugs(relatedGuides(ALL[3], ALL, NAMES))
    expect(scoredAgainstReal.indexOf('rarity-bands')).toBeLessThan(
      scoredAgainstReal.indexOf('what-kind-of-game'),
    )
  })

  it('fills the rail from the newest when too few are related', () => {
    const shown = relatedGuides(ALL[6], ALL, NAMES)
    expect(shown).toHaveLength(6)
    expect(slugs(shown)).not.toContain('cloud-saves')
  })

  it('returns everything there is rather than padding, on a thin wiki', () => {
    const thin = [guide('a', 'Alpha'), guide('b', 'Beta')]
    expect(slugs(relatedGuides(thin[0], thin, NAMES))).toEqual(['b'])
  })

  it('is empty when there is nothing else on the wiki', () => {
    expect(relatedGuides(ALL[0], [ALL[0]], NAMES)).toEqual([])
  })

  it('is deterministic, because every page here is prerendered', () => {
    // Two undated guides that tie on score must not depend on input order.
    const tied = [
      guide('z-one', 'Romance and gifts'),
      guide('a-two', 'Romance and gifts'),
      guide('anca', 'Anca romance'),
    ]
    const forward = slugs(relatedGuides(tied[2], tied, NAMES))
    const backward = slugs(relatedGuides(tied[2], [...tied].reverse(), NAMES))
    expect(forward).toEqual(backward)
    expect(forward).toEqual(['a-two', 'z-one'])
  })
})
