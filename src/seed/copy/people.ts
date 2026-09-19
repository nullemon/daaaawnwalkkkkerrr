import type { Payload } from 'payload'
import type { PeopleSite } from '../../payload-types'
import { PEOPLE_BUILT_IN } from '../../lib/people-copy'

/**
 * Today's wording for the people host, written into the global that can change
 * it.
 *
 * Every field on `people-site` is optional and falls back to the sentence in
 * `src/lib/people-copy.ts`, which is what makes the host safe to deploy before
 * anybody has opened the admin — and also what leaves an editor looking at a
 * tab of empty boxes with no idea what any of them currently say. So the
 * shipped sentences go in, verbatim, from the same constant the pages render.
 *
 * **It does not overwrite.** A field somebody has already filled in is left
 * alone on every run, because this sits in `pnpm db:reset` and that is the
 * command people run without thinking hard about it.
 *
 * What is deliberately not seeded: the strings at the bottom of
 * `people-copy.ts` that have no field on the global. They are gap markers —
 * the unfiled-basis group and the missing biography — and a marker an editor
 * can reword away is not a marker. The empty-directory note started out among
 * them and was moved onto the global, because it is ordinary copy: it says how
 * names reach this host, which is an editorial explanation rather than a
 * warning about the state of a record.
 */

const blank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

/** Only the keys the stored record has nothing in. */
const missing = (
  stored: Record<string, unknown> | null | undefined,
  builtIn: Record<string, string>,
): Record<string, string> => {
  const patch: Record<string, string> = {}
  for (const [key, text] of Object.entries(builtIn)) {
    /*
      A built-in that is itself blank has nothing to write. `sourcingNote`
      ships as an empty string on purpose - the page prints it only when
      somebody has written one - so without this the pass wrote `''` over
      nothing, counted it as a field filled, and reported it again on the next
      run and every run after. Two of the fields in "2 fields now hold the
      wording they were showing anyway" held no wording at all, which is the
      one thing a report like that must not say. `coveredNote` avoids it by
      being left out of the map entirely; this makes the two cases behave the
      same whichever way somebody writes the next one.
    */
    if (blank(text)) continue
    if (blank(stored?.[key])) patch[key] = text
  }
  return patch
}

const seed = async (payload: Payload): Promise<number> => {
  const current = (await payload.findGlobal({ slug: 'people-site' })) as PeopleSite

  const { groups: builtInGroups, profile: builtInProfile, ...builtInTop } = PEOPLE_BUILT_IN

  const top = missing(current as unknown as Record<string, unknown>, { ...builtInTop })
  const groups = missing(current.groups, { ...builtInGroups })
  const profile = missing(current.profile, { ...builtInProfile })

  const filled = Object.keys(top).length + Object.keys(groups).length + Object.keys(profile).length
  if (filled === 0) return 0

  /*
    The groups are spread over what is already stored rather than sent on their
    own: a group field arrives as a whole object, so sending only the two keys
    this pass filled would take the editor's other four out with it.
  */
  await payload.updateGlobal({
    slug: 'people-site',
    data: {
      ...top,
      ...(Object.keys(groups).length > 0 ? { groups: { ...current.groups, ...groups } } : {}),
      ...(Object.keys(profile).length > 0 ? { profile: { ...current.profile, ...profile } } : {}),
    } as Partial<PeopleSite>,
  })

  return filled
}

export default seed
