import type { Payload } from 'payload'
import type { CompaniesSite } from '../../payload-types'
import { COMPANIES_BUILT_IN } from '../../lib/companies-copy'

/**
 * Today's wording for the companies host, written into the global that can
 * change it.
 *
 * Every field on `companies-site` is optional and falls back to the sentence in
 * `src/lib/companies-copy.ts`, which is what makes the change safe to deploy —
 * and also what leaves an editor looking at a tab of empty boxes with no idea
 * what any of them currently say. So the shipped sentences go in, verbatim,
 * from the same constant the pages render, and the admin shows the live page.
 *
 * **It does not overwrite.** A field somebody has already filled in is left
 * alone on every run, because this sits in `pnpm db:reset` and that is the
 * command people run without thinking hard about it.
 *
 * Two things are deliberately not seeded: the footer links, whose hrefs are
 * built from the network origin at render time and would arrive here as a
 * localhost URL, and `coveredNote`, which has no shipped wording — writing one
 * would put a sentence on the page that nobody wrote.
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
    if (blank(stored?.[key])) patch[key] = text
  }
  return patch
}

const seed = async (payload: Payload): Promise<number> => {
  const current = (await payload.findGlobal({ slug: 'companies-site' })) as CompaniesSite

  const { groups: builtInGroups, profile: builtInProfile, ...builtInTop } = COMPANIES_BUILT_IN

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
    slug: 'companies-site',
    data: {
      ...top,
      ...(Object.keys(groups).length > 0 ? { groups: { ...current.groups, ...groups } } : {}),
      ...(Object.keys(profile).length > 0 ? { profile: { ...current.profile, ...profile } } : {}),
    } as Partial<CompaniesSite>,
  })

  return filled
}

export default seed
