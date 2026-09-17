import { cache } from 'react'
import { client } from '@/lib/payload'
import type { PeopleSite } from '@/payload-types'

/**
 * The people host's own editable copy, and the wording it shipped with.
 *
 * `people.<domain>` is the fourth kind of site on this network — not the hub,
 * not a wiki, not the companies host — so its front page, its profile headings
 * and its shell come from a global of its own.
 *
 * The built-in sentences live here rather than beside each `<h2>` because two
 * things need the identical string: the page, as its fallback, and
 * `src/seed/copy/people.ts`, which writes today's wording into the global so an
 * editor opens real sentences instead of empty boxes. Two copies of a paragraph
 * is two paragraphs that drift, and the one that drifts is the seed —
 * silently, because a seeded field is never compared to anything.
 */

export type PeopleSiteCopy = Partial<PeopleSite>

/**
 * Never throws, because every page on this host reads it.
 *
 * A global nobody has saved yet, or a column added since the last
 * `pnpm db:reset`, throws on read — and the cost of that here is not a missing
 * heading, it is the whole subdomain answering 500. An empty object falls every
 * field back to the wording below, which is what shipped anyway.
 */
export const getPeopleSite = cache(async (): Promise<PeopleSiteCopy> => {
  try {
    const payload = await client()
    return await payload.findGlobal({ slug: 'people-site', depth: 0 })
  } catch {
    return {}
  }
})

/**
 * What the code says when nobody has written anything.
 *
 * Every key here matches a field on the `people-site` global one for one — the
 * seeder walks this object and writes each key into the field of that name, so
 * a key with no field would be sent to Payload and dropped, and a field with no
 * key would stay an empty box in the admin. Keep them in step.
 *
 * Tokens rather than values: `{count}` is the number of profiles at render
 * time, so the lede cannot claim a total the database has outgrown, and
 * `{network}` is the network's name, which is still a working title.
 * `{companiesLink}` renders as an element — see the note on `splitTokens` in
 * `src/lib/copy.ts` for why an editable string never reaches the DOM as markup.
 */
export const PEOPLE_BUILT_IN = {
  title: 'The people behind the games',
  eyebrow: 'Network',
  /*
    Three routes onto this host, and all three are named here.

    These four fields - the meta description, the lede, the shell description
    and the footer blurb - each said this host holds the people credited on
    these games and the actors who play their characters. 470 of 597 profiles
    are neither: they are names a studio's or publisher's own article printed,
    and the group note halfway down the same page says outright that appearing
    in a company's article is not a credit on anything this network covers. The
    front page contradicted four of its own sections, and the meta description
    carried the contradiction into search results.

    So the wording names the third route rather than implying it away. A reader
    who arrives expecting a credits index and finds a company officer has been
    told something false about what they are reading, and this host's whole
    argument is that it does not do that.
  */
  metaDescription:
    'Directors, designers, composers, writers and actors credited on the games this network covers, and the people the studio and franchise-wiki articles it cites name alongside them, with a source for every detail.',
  emptyNote:
    'No profiles have been published yet. Names reach this host from the games’ own credits, from the actors named on character pages, and from company articles — never from anywhere else, which is why it fills up slowly.',
  lede: '{count} people, grouped by how each name reached the network: credited on a game this network covers, named as the actor for one of its characters, or printed in an article this network already cites — a studio’s own list of key people, or a franchise wiki. Being named by a company or a wiki is not a credit on anything covered here, and each group below says what its own source supports. Every detail on a profile is what a source states; a field no source gives is left empty rather than filled in.',
  groups: {
    creditedHeading: 'Credited on a game we cover',
    creditedNote:
      'Named as director, designer, artist, writer, composer or producer in one of these games’ own credits or infobox, in the role the source states. It is not a full crew list — it is what a published source names.',
    castHeading: 'Actors and voice actors',
    castNote:
      'Here because a character’s own page names them as the actor. Their profile links back to every character they play, which is what makes a person page a route into the wikis rather than a dead end.',
    officersHeading: 'Named by a company',
    officersNote:
      'Named in a studio’s or publisher’s own article rather than on a game. Appearing in a company’s article is not a credit on anything this network covers, and these profiles say only where the name was found.',
    mentionedHeading: 'Named on a franchise wiki',
    mentionedNote:
      'A community wiki for a series names these people, and none of them is credited on a game this network covers — the director of the films, on the wiki for the games. They are listed because a source named them, and each page says exactly what that source supports and nothing more.',
  },
  whyHeading: 'Why people have their own site',
  whyBody:
    'A composer scores two of these games and an actor is in three. One page per person carries a whole body of work; one page per wiki is three thin copies that disagree the first time somebody corrects one. It is the same reason {companiesLink} live here rather than on each wiki.',
  profile: {
    gamesHeading: 'Games we cover',
    creditsHeading: 'Other credits',
    charactersHeading: 'Characters played',
    companiesHeading: 'Companies',
    /*
      Deliberately blank, by the owner's decision: the standing sourcing
      sentence came off the profiles and they are writing the provenance
      wording themselves. The key stays so the field keeps its box in the
      admin and the profile keeps rendering whatever gets typed into it — a
      field that is blank is editable, a field that is deleted is not. The
      citations are untouched; it is only this sentence that went.
    */
    sourcingNote: '',
    noPhotoNote:
      'No freely licensed photograph of this person has been found. Saying so is better than a silhouette, which reads as an image that failed to load.',
  },
  shellName: '{network} People',
  shellTagline: 'The people behind the games',
  /* Same correction as the lede and the meta description above: these two say
     what the host holds, on every page of it, and what it holds is mostly the
     third route. */
  shellDescription:
    'Directors, designers, composers and actors credited on the games {network} covers, and the people its studios’ own articles name.',
  footerBlurb:
    'Who made the games this network covers, who plays the characters in them, and who a studio’s own article names. One page per person, with a source for every line.',
} as const

/*
  Everything below is not on the global, and each one says why.

  The rule in docs/COPY.md is that anything a person would want to reword is a
  field. These are the exceptions the schema has no field for; they are kept
  here, named and commented, rather than inlined at a call site where the next
  person would have to find them one at a time.
*/

/**
 * Enum labels for `roles`.
 *
 * These belong in `src/lib/ui-registry.ts`, which is where the network words an
 * enum once — the companies host carries the same debt with its two-entry
 * `ROLE_LABEL`. Until they move, one map is read by both the directory and the
 * profile so a role cannot be worded two ways on two pages.
 */
export const PERSON_ROLE_LABEL: Record<string, string> = {
  director: 'Director',
  designer: 'Designer',
  artist: 'Artist',
  writer: 'Writer',
  composer: 'Composer',
  producer: 'Producer',
  programmer: 'Programmer',
  /*
    The schema's own label for this value is "Developer (role not stated)"
    (`collections/People.ts:91`), and it is worded that way on purpose:
    `seed:company-officers` picks `developer` precisely when the article names
    somebody among a company's key people and states no post. This map dropped
    the qualifier, so 165 profiles printed the bare word - a job title no
    source gave them - in the roles panel, on their directory badge and in the
    page title, while the body of the same page said "with no post stated".
    This map's own docstring says it exists so a role cannot be worded two ways
    on two pages; the admin and the page were the two pages.
  */
  developer: 'Developer (role not stated)',
  actor: 'Actor',
  'voice-actor': 'Voice actor',
  'motion-capture': 'Motion capture',
  executive: 'Executive',
}

/** Enum labels for a credit's `kind`, and the order the groups read in. */
export const WORK_KIND_LABEL: Record<string, string> = {
  game: 'Games',
  film: 'Film',
  tv: 'Television',
  album: 'Albums',
  other: 'Other',
}

export const WORK_KIND_ORDER = ['game', 'film', 'tv', 'album', 'other']

/** The label column of the profile infobox. Same registry debt as the roles. */
export const PERSON_ROW_LABEL = {
  roles: 'Roles',
  born: 'Born',
  birthPlace: 'Birth place',
  nationality: 'Nationality',
  activeSince: 'Active since',
  alsoKnownAs: 'Also known as',
  website: 'Website',
} as const

/**
 * The group for a record whose `basis` is none of the three.
 *
 * The companies index grouped on three bases when there were four, and quietly
 * hid a hundred and ninety-nine companies that were in the database, on the
 * sitemap and on no page a reader could reach. `basis` is optional here, so a
 * record written by anything that does not set it lands in this group instead
 * of vanishing.
 *
 * Deliberately not editable, for the reason `src/components/LegalGap.tsx` is
 * not: it marks something missing, and a warning the person being warned can
 * reword away is not a warning. It disappears on its own once every record
 * carries a basis.
 */
export const UNFILED_HEADING = 'Basis not recorded'
export const UNFILED_NOTE =
  'How these names reached the network was not recorded. They are listed rather than hidden, because a record on no page is a record nobody can correct.'

/**
 * A record with a name and no biography.
 *
 * "Nothing has been published about this person" and "somebody started this
 * page and gave up" look identical on the page, and only the first is true
 * here: a profile begins as a name, a role and a source, and that is the honest
 * state of most of them. So the page says so rather than showing a column of
 * white space under a heading.
 */
export const NO_BIOGRAPHY_NOTE =
  'No biography has been published here. What a source states about this person is in the panel and the sections above; where there is nothing, no source we cite gives it.'
