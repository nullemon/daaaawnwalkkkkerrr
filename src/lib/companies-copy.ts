import { cache } from 'react'
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
    /*
      Imported here rather than at the top of the file so that
      `companies-copy.test.ts` can pin `catalogueCap` — the rule that decides
      whether this host may call a catalogue complete — without booting
      Payload, sharp and a database connection to do it. The same guard
      `src/seed/companies.ts` carries, for the same reason.
    */
    const { client } = await import('@/lib/payload')
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
    /* True only of a catalogue that is not capped. The heading a capped one
       gets is `CAPPED_CATALOGUE_HEADING` below, and the reason it is not a
       field is written there. */
    catalogueHeading: 'Everything they are credited on',
    /*
      A price is a fact with a date on it, not a property of a game, and the
      date itself lives on the record — `catalogueNote` says which storefront
      was read and when. This is the standing half of that sentence: the part
      that is true of every catalogue on the host and would otherwise be
      retyped into three hundred records, drifting on every one of them.
    */
    cataloguePriceNote:
      'Price, score and store rating are what a storefront showed on the day the catalogue was read, not properties of the game. Where a title has a wiki on this network the row links to it; everything else links out to the shop.',
    /*
      "We have not read a store listing for this company" and "this company has
      released nothing" look identical as an empty list, and only the first is
      true. Most of the profiles on this host have no catalogue yet, so this
      sentence is the one most often read.
    */
    catalogueEmpty:
      'No catalogue has been compiled for this company yet. That means nobody has read a store listing for it, not that it has published nothing — the gap is ours.',
    catalogueCovered: 'Covered here',
    /*
      Token: {defunct}, the year as the record states it. A studio that has
      closed is the single most useful thing a page like this can say and the
      thing most often missing elsewhere, so it is a banner at the top of the
      profile rather than the eleventh row of a panel nobody scrolls to.
    */
    defunctNote:
      'No longer operating ({defunct}). Everything on this page is a record of what the company did, not what it does.',
    siteLabel: 'Official site',
    peopleHeading: 'Who runs it',
    /* Blank for the same reason as the people host's — see the note there.
       The date each figure was read is still on the page, in the citation. */
    sourcingNote: '',
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
 * How many titles a catalogue is showing, out of how many were found.
 *
 * `seed:company-games` writes "Showing 60 of 76 found." onto the end of
 * `catalogueNote` whenever the harvest hit its cap, and the profile printed
 * that note directly under a heading reading "Everything they are credited on"
 * with an eyebrow reading 60. Twenty-nine profiles claimed a complete
 * catalogue and then withdrew the claim one line below it - Capcom 60 of 76,
 * Konami 60 of 95, Take-Two 60 of 116.
 *
 * So the heading reads the note rather than assuming. The count has to match
 * the rows actually on the page: a note saying 60 over a table of 12 is a note
 * about some earlier state of the record, and trusting it would swap one wrong
 * heading for another.
 *
 * `null` for a catalogue that is not capped, and for a note an editor has
 * rewritten - and that second case is not a gap. An editor who takes the
 * sentence out has taken the contradiction out with it, and nothing on the
 * page then claims one thing and withdraws it in the next line.
 *
 * Kept in step with the sentence in `src/seed/company-games.ts`, which is the
 * only thing that writes it.
 */
export const catalogueCap = (
  note: string | null | undefined,
  shown: number,
): { shown: number; found: number } | null => {
  const match = /\bShowing (\d+) of (\d+) found\./.exec(note ?? '')
  if (!match) return null
  const said = Number(match[1])
  const found = Number(match[2])
  if (said !== shown || found <= shown) return null
  return { shown, found }
}

/**
 * The heading over a catalogue that is only part of one.
 *
 * Not a field, for the reason `src/components/LegalGap.tsx` is not one: it
 * exists to withdraw a claim the page would otherwise make, and a correction
 * the person being corrected can reword away is not a correction. The editable
 * `catalogueHeading` still words every catalogue that is actually complete,
 * which is the case an editor has something to say about.
 */
export const CAPPED_CATALOGUE_HEADING = 'Some of what they are credited on'

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

/**
 * What a company's own `role` enum is called, and what a catalogue row's is.
 *
 * These belong in `src/lib/ui-registry.ts` with every other enum label, and
 * they are not there for a reason worth writing down: the registry's `role.*`
 * group was populated for *characters* — protagonist, ally, vassal, antagonist,
 * merchant, minor — and it has no `developer` or `publisher` in it. Moving these
 * onto `ui.label('role', …)` would not error and would not show a missing key:
 * `fromMaps.label` tidies an unknown value and returns it, so every company
 * badge on the host would quietly become a lower-case "developer", and the
 * `<title>` tag with it. Sharing the group would also put two studios' roles in
 * the middle of a wiki editor's list of character roles, which is a worse
 * screen than the one that exists.
 *
 * So they live here, next to the rest of this host's wording, and there is one
 * copy for the network rather than one per page. `companies/page.tsx` still has
 * a third — deliberately out of scope for the change that wrote this note.
 */
export const COMPANY_ROLE_LABEL: Record<string, string> = {
  developer: 'Developer',
  publisher: 'Publisher',
}

/**
 * The same enum in the past tense, because a catalogue row is a credit.
 *
 * "Developer — Alan Wake 2" reads as a job title; "Developed" reads as what
 * they did to it, which is the question a body of work answers. `both` is its
 * own value rather than two badges: a studio that funded and made its own game
 * did one thing, not two.
 */
export const CATALOGUE_ROLE_LABEL: Record<string, string> = {
  developer: 'Developed',
  publisher: 'Published',
  both: 'Developed and published',
}
