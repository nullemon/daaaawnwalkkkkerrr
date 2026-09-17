import { describe, expect, it } from 'vitest'
import { faithful, PROBES } from './games'
import { fill } from '../../lib/copy'
import { sectionCopy, type CopyGame } from '../../lib/section-copy'
import { GAME_SCOPED } from '../../lib/tenancy'

/**
 * The seeded copy has to mean the same thing at every count the wiki can reach.
 *
 * `pnpm seed:copy` freezes a rendered sentence into an editable field. That is
 * safe for the numbers, which come back as `{count}` and `{detail}` — and it
 * was not safe for the *shape*, because several of these sentences change
 * shape with their counts and whichever branch the sentinels took was the one
 * that got stored. Seven wikis shipped a characters index reading "227
 * catalogued, every one with an official portrait" over a set where ninety had
 * none; Silent Hill's regions index was headed "All 1 regions"; A Plague Tale's
 * achievements description said "0 are held by fewer than one player in
 * twenty". All three render perfectly and all three are false.
 *
 * Both directions are pinned, the way `isNotAnEntity` pins both of its: a
 * sentence that changes shape must not be seeded, and a sentence that does not
 * must still be, or this guard has quietly emptied the admin instead.
 */

const GAMES: CopyGame[] = [
  { slug: 'dawnwalker', shortTitle: 'Dawnwalker', title: 'The Blood of Dawnwalker' },
  { slug: 'gears-of-war-e-day', shortTitle: 'Gears E-Day', title: 'Gears of War: E-Day' },
]

/** What the seeder would store for one field, or null where it refuses. */
const seeded = (game: CopyGame, section: string, field: 'title' | 'description' | 'heading' | 'lede') => {
  const COUNT = 424242
  const DETAIL = 131313
  const built = sectionCopy(section, game, { total: COUNT, detail: DETAIL })[field]
  const template = built.split(String(COUNT)).join('{count}').split(String(DETAIL)).join('{detail}')
  return faithful(template, (counts) => sectionCopy(section, game, counts)[field])
}

describe('the section copy this pass is allowed to freeze', () => {
  it('refuses a sentence whose shape depends on the count', () => {
    // "All 51 regions" / "All 1 region" — `plural()` is not a token.
    expect(seeded(GAMES[1]!, 'regions', 'title')).toBeNull()
    // "every one with an official portrait" is a claim, not a wording.
    expect(seeded(GAMES[1]!, 'characters', 'lede')).toBeNull()
    // The rarity sentence is dropped entirely when nothing is rare.
    expect(seeded(GAMES[1]!, 'achievements', 'description')).toBeNull()
    // "N of them with their own sourced article" has a no-detail form.
    expect(seeded(GAMES[1]!, 'factions', 'lede')).toBeNull()
  })

  it('still seeds the sentences that say the same thing at any count', () => {
    expect(seeded(GAMES[1]!, 'characters', 'heading')).toBe('Characters')
    expect(seeded(GAMES[0]!, 'regions', 'heading')).toBe('Vale Sangora')
    // Dawnwalker's own wording, tokenised rather than refused.
    expect(seeded(GAMES[0]!, 'perks', 'lede')).toContain('{count} perks catalogued, {detail}')
  })

  it('leaves nothing stored that disagrees with the code at any count', () => {
    for (const game of GAMES) {
      for (const section of GAME_SCOPED) {
        for (const field of ['title', 'description', 'heading', 'lede'] as const) {
          const template = seeded(game, section, field)
          if (template === null) continue
          for (const counts of PROBES) {
            expect(fill(template, { count: counts.total, detail: counts.detail })).toBe(
              sectionCopy(section, game, counts)[field],
            )
          }
        }
      }
    }
  })
})
