import { cache } from 'react'
import { client } from '@/lib/payload'
import type { CompaniesSite } from '@/payload-types'

/**
 * The companies host's own editable copy, and the wording it shipped with.
 *
 * `companies.<domain>` is the third kind of site on this network — not the hub
 * and not a wiki — so its front page, its profile headings and its shell come
 * from a global of its own rather than from Site Settings or a Game record.
 *
 * The built-in sentences live here rather than beside each `<h2>` because two
 * things need the identical string: the page, as its fallback, and
 * `src/seed/copy/companies.ts`, which writes today's wording into the global so
 * an editor opens real sentences instead of empty boxes. Two copies of a
 * paragraph is two paragraphs that drift, and the one that drifts is the seed —
 * silently, because a seeded field is never compared to anything.
 */

export type CompaniesSiteCopy = Partial<CompaniesSite>

/**
 * Never throws, because every page on this host reads it.
 *
 * A global nobody has saved yet, or a column added since the last
 * `pnpm db:reset`, throws on read — and the cost of that here is not a missing
 * heading, it is the whole subdomain answering 500. An empty object falls every
 * field back to the wording below, which is what shipped anyway.
 */
export const getCompaniesSite = cache(async (): Promise<CompaniesSiteCopy> => {
  try {
    const payload = await client()
    return await payload.findGlobal({ slug: 'companies-site', depth: 0 })
  } catch {
    return {}
  }
})

/**
 * What the code says when nobody has written anything.
 *
 * Tokens rather than values, for the same reason the rest of the site uses
 * them: `{count}` is the number of profiles at render time, so the lede cannot
 * claim a total the database has outgrown, and `{network}` is the network's
 * name, which is still a working title. `{authorsLink}` renders as an element —
 * see the note on `splitTokens` in `src/lib/copy.ts` for why an editable string
 * never reaches the DOM as markup.
 *
 * `coveredNote` is deliberately absent: that section shipped with no note, and
 * inventing one here would put a sentence on the page that nobody wrote.
 */
export const COMPANIES_BUILT_IN = {
  title: 'Studios and publishers',
  eyebrow: 'Network',
  metaDescription:
    'Every developer and publisher behind the games this network covers, with which of their games are here and where each claim comes from.',
  lede: "{count} companies: the largest in games by published revenue, the studios behind the games this network covers, and everything those two name as a parent or a subsidiary. Every figure on a profile comes from that company's own article, with the date it was read.",
  groups: {
    coveredHeading: 'Behind a game we cover',
    rankedHeading: 'The largest in games',
    rankedNote:
      'Ranked by published revenue. Popularity is not a measurable quantity, so this is the ranking somebody actually publishes rather than one we invented — and it means revenue, on the date the list was read.',
    cataloguedHeading: 'Developers and publishers',
    cataloguedNote:
      'Every company Wikipedia files under video game development or publishing, which is a claim somebody else maintains rather than a list we drew up.',
    mentionedHeading: 'Named by another company',
    mentionedNote:
      'These are here because a company above names them as a parent or a subsidiary in its own article. Nobody drew up this list — it is what the corporate graph contains once you follow it one step, which is also why it is worth reading.',
  },
  whyHeading: 'Why these have their own site',
  whyBody:
    'A studio turns up on more than one wiki, and a company page that exists once carries its whole body of work instead of being three thin copies that disagree the first time one is corrected. It is the same reason {authorsLink} live on the hub rather than on each wiki.',
  profile: {
    gamesHeading: 'Their games on this network',
    peopleHeading: 'Who runs it',
    sourcingNote:
      'Named executives as its own article stated them on the date in the sources below.',
    /*
      One section carries the parent and the subsidiaries together, and the
      schema has a heading for each, so the profile uses whichever of the two
      matches what that company actually has. Both ship as the same words, so
      nothing moves until somebody edits one.
    */
    parentHeading: 'Corporate structure',
    subsidiariesHeading: 'Corporate structure',
    structureNote:
      'Each link exists because one of the two companies’ own articles named the other. A studio missing from this list is not evidence that it is independent.',
    knownHeading: 'What we know',
    knownNote:
      'This name appears in the community-wiki sources compiled for a game on this network. We have not established what it worked on or when, and would rather say so than fill the gap with a guess.',
  },
  shellName: '{network} Companies',
  shellTagline: 'Studios and publishers',
  shellDescription:
    'Every developer and publisher behind the games {network} covers, and which of their games are here.',
  footerBlurb:
    'Who made the games this network covers. One page per company, with everything of theirs we cover and a source for each claim.',
} as const

/**
 * The one clause on the index that shipped emphasised.
 *
 * "Popularity is not a measurable quantity" is the argument for ranking by
 * revenue at all, and it was bold on purpose. A textarea cannot carry markup
 * and an admin-editable string must never reach the DOM as markup, so the
 * emphasis follows the phrase instead of the field: an editor who keeps the
 * clause keeps the emphasis, and one who rewrites the note gets plain text
 * rather than bold landing on the wrong half of a new sentence.
 */
export const EMPHASISED_CLAUSE = 'Popularity is not a measurable quantity'
