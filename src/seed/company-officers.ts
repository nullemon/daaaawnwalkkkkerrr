import { pathToFileURL } from 'url'
import { slugify } from '../fields/shared'
import { listSentence } from '../lib/credit'
import { rich } from './lexical'

/**
 * Fill `people.companies` from the people each company's own article names.
 *
 *   pnpm seed:company-officers
 *
 * `keyPeople` is one text field holding what a Wikipedia infobox printed:
 *
 *     "Markus Mäki (chairman and CEO), Sam Lake (creative director)"
 *     "Haruhiro Tsujimoto (President and COO)"
 *     "Sébastien Wloch, David Dedeine"
 *
 * The `people` collection's own docstring lists "the named executives on
 * company records" as one of the three routes a name is allowed onto this
 * network by, and `companies` is the relationship that route was meant to
 * fill. It was empty. This splits the prose and fills it.
 *
 * ## Why splitting this is safe when splitting the actor strings was not
 *
 * The entity harvester refused to split `"Alan WakeMark Blum (voice)AWEMartin
 * McDougall (voice)"`, and was right to: there is no separator in it at all,
 * and picking where one name ends is guessing at somebody's name. These are
 * not that. They are comma-separated and the shape is the infobox template's
 * own, not a scrape artefact.
 *
 * ## Two claims, and the difference has to reach the reader
 *
 * A fragment reads as one of two things, and they are not the same fact:
 *
 *   - `<Name> (<role>)` — the article says what the post is. The record says
 *     so, and `roles` is `executive`.
 *   - a bare name — the article names them among its key people and states no
 *     post this can read. The record says *that*, `knownFor` is empty and
 *     `roles` is `developer`, the schema's "role not stated". Nothing here
 *     infers a job from the fact that the field is called `keyPeople`: "is the
 *     CEO" and "is named on the page" are different claims and the second one
 *     is the only one a bare name supports.
 *
 * ## The rules, which are narrow on purpose
 *
 *   - split on commas that are **not** inside brackets, so "Pony Ma (chairman,
 *     CEO)" stays one fragment
 *   - rejoin a bare name with a bracket-only fragment that follows it, because
 *     six infoboxes write "Strauss Zelnick, (chairman and CEO)" and the stray
 *     comma makes one officer look like two fragments. A bracket-only fragment
 *     on its own is still refused: it names nobody.
 *   - the name must pass `looksLikeName`, which is `tools/fetch-people.mjs`'s
 *     rule, not a second one written here
 *   - everything else is dropped and printed
 *
 * **The dropped list is the finding**, not the failure. It is printed in full
 * on every run so somebody can read it; do not widen a rule to shorten it.
 *
 * ## What a created record claims, which is very little
 *
 * A person who is not already here is created at low confidence with
 * `basis: 'company-officer'` and the company's own article as the source. That
 * is all it says: an article about the company printed this name on the day it
 * was read. It is not a biography, there is no date of birth, and nothing
 * about them is inferred from the company — the same restraint
 * `seed:companies` applies when it will not call a studio a game's developer
 * on the strength of appearing on that game's wiki.
 *
 * Idempotent. Matching is on name, so a second run finds the records the first
 * one created; it rewrites the sentences on those, because this pass owns what
 * it wrote, and on everybody else it adds nothing but the relationship and the
 * citation behind it.
 */

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

/**
 * Commas at bracket depth zero.
 *
 * "Pony Ma (chairman, CEO)" carries a comma that belongs to the role, and a
 * plain `.split(',')` turns it into a person called "Pony Ma (chairman" whose
 * job is "CEO)". Depth is tracked over both bracket kinds because a few
 * infoboxes use square ones for a reference marker.
 */
export const splitOutsideBrackets = (value: string): string[] => {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const character of value) {
    if (character === '(' || character === '[') depth += 1
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      out.push(current)
      current = ''
      continue
    }
    current += character
  }
  out.push(current)
  return out.map((fragment) => fragment.trim()).filter(Boolean)
}

/** A fragment that is nothing but a bracketed phrase: "(chairman and CEO)". */
const BRACKETS_ONLY = /^\([^()]*\)$/

/**
 * Put back together the officers a stray comma cut in half.
 *
 * Sony, Krafton, Take-Two, Wizards of the Coast, D3 Publisher and Bandai Namco
 * Studios all write `"Strauss Zelnick, (chairman and CEO)"` — one person, with
 * a comma between the name and the post. Split on commas outside brackets that
 * is two fragments, one naming nobody and one stating nothing, and both were
 * dropped: forty-seven officers whose roles were sitting right there.
 *
 * The join is deliberately the narrowest thing that fixes it. The left
 * fragment must contain no bracket at all and the right must be *only* a
 * bracketed phrase, so "(chairman)Yuji Asako" — the same field mangled a
 * different way — joins to nothing and stays in the dropped list where a human
 * can see it. A bracket-only fragment with no bare name before it is still
 * refused, because on its own it names nobody.
 */
export const rejoinStrayCommas = (fragments: string[]): string[] => {
  const out: string[] = []
  for (let index = 0; index < fragments.length; index += 1) {
    const here = fragments[index]!
    const next = fragments[index + 1]
    if (next && !/[()]/.test(here) && BRACKETS_ONLY.test(next)) {
      out.push(`${here} ${next}`)
      index += 1
      continue
    }
    out.push(here)
  }
  return out
}

// ---------------------------------------------------------------------------
// Is it a name?
// ---------------------------------------------------------------------------

/*
  These four rules are `tools/fetch-people.mjs`'s, copied rather than imported
  because that file exports nothing and is another pass's to change.

  Copied rather than reinvented, which matters more: a second, subtly different
  idea of what a name looks like is how the same person ends up accepted by one
  pass and dropped by the other, with nothing anywhere saying why. If that file
  widens its list, widen this one to match.

  `PARTICLES` is its full list. The brief asked for eleven; these are the
  seventeen the harvester already uses, and taking the superset is what keeps
  the two in agreement.
*/
const PARTICLES = new Set([
  'de',
  'del',
  'della',
  'der',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
  'y',
  'da',
  'dos',
  'den',
  'ter',
  'bin',
  'al',
])

const UPPER_FIRST = /^\p{Lu}/u
const SUFFIX = /^(Jr\.?|Sr\.?|II|III|IV|PhD|MBE|OBE)$/i
const NAME_PREFIX = /^(Mc|Mac|Fitz|O'|O’|D'|D’|L'|L’)/

/**
 * Two words shoved together with nothing between them — "AWEMartin",
 * "WakeMark". The prefix strip is what keeps McCaffrey, O'Quinn and MacLeod
 * out of the refusals.
 */
const isGlued = (word: string): boolean => {
  const core = word.replace(NAME_PREFIX, '')
  if (/\p{Ll}\p{Lu}/u.test(core)) return true
  /* An acronym run, then a word. */
  if (/^\p{Lu}{2,}\p{Ll}/u.test(core)) return true
  return false
}

/**
 * Is this a name we are willing to publish a page about?
 *
 * Two to four words, no digits, every word capitalised unless it is a particle
 * inside the name — "Alexandre de Rochefort", "Chris van der Kuyl". Four words
 * need a particle or a suffix holding them together, because four capitalised
 * words with nothing else are as likely to be two people as one.
 */
export const looksLikeName = (value: string): boolean => {
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 4) return false
  if (
    words.length === 4 &&
    !words.some((word, index) => index > 0 && PARTICLES.has(word.toLowerCase())) &&
    !words.some((word) => SUFFIX.test(word))
  ) {
    return false
  }
  if (/\d/.test(value)) return false
  if (words.some(isGlued)) return false
  return words.every((word, index) => {
    if (PARTICLES.has(word.toLowerCase()) && index > 0) return true
    return UPPER_FIRST.test(word)
  })
}

/*
  Infobox templates that leaked into the value rather than rendering.

  "ubl" and "Unbulleted list" are the wikitext template's own name arriving as
  text, and they are not people. `looksLikeName` already refuses both, but they
  are refused by name as well so the dropped list says which of the two things
  went wrong — a template leftover is a harvester bug worth seeing, and a real
  name that failed the rule is not.
*/
const TEMPLATES = new Set(['ubl', 'unbulleted list', 'plainlist', 'plain list', 'hlist', 'flatlist'])

/*
  Words that are a post rather than a person.

  Only used to answer "could this fragment be somebody's name at all" — never
  to read a name out of one. A fragment whose every word is on this list names
  a job with nobody in it.
*/
const POST_WORDS = new Set([
  'ceo', 'cfo', 'coo', 'cto', 'cio', 'cco', 'cmo', 'chief', 'officer', 'executive',
  'president', 'vice', 'chairman', 'chairwoman', 'chairperson', 'chair', 'chairmen',
  'director', 'managing', 'manager', 'management', 'general', 'head', 'lead',
  'founder', 'founders', 'cofounder', 'co-founder', 'owner', 'partner', 'principal',
  'developer', 'designer', 'producer', 'engineer', 'programmer', 'artist', 'writer',
  'board', 'division', 'group', 'emeritus', 'emeretus', 'interim', 'acting', 'senior',
  'and', 'of', 'the', '&', 'de', 'y',
])

/**
 * Could this fragment name a person at all?
 *
 * The one rule two files have to agree on. `seed:company-officers` drops a
 * fragment it cannot read into a record; `src/lib/officers.ts` prints every
 * fragment on the profile, on the stated grounds that "a name we cannot link
 * is still a name the source stated". Both decisions were written down and
 * they contradicted: twenty-two profiles printed things that are not people,
 * so `/cygames` listed `ubl`, `/sega` listed `(chairman and CEO)`, and
 * `/ageod` listed `CEO` and `lead developer` under the heading "Who runs it".
 *
 * The reasoning holds for `(chairman)Yuji Asako` — a real name the splitter
 * could not cleanly separate from its post, and dropping it would be this page
 * editing its own source. It does not hold for `ubl`, which is a MediaWiki
 * template's name, or for a bare job title, which names nobody.
 *
 * So the line is drawn at what is left when the brackets come off: a template
 * name is not a person, a fragment with nothing outside its brackets is not a
 * person, a fragment with no capital letter in it is not a name, and a
 * fragment made only of post words is a job rather than whoever holds it.
 * Everything else prints, name or not.
 */
export const couldNameAPerson = (fragment: string): boolean => {
  const residue = fragment
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\[[^\][]*\]/g, ' ')
    .replace(/[.,;:]/g, ' ')
    .trim()
  if (!residue) return false
  if (TEMPLATES.has(residue.toLowerCase())) return false
  /*
    A name is capitalised — or written in a script that has no capitals at all.
    Testing only for an uppercase letter would refuse 宮本茂 and 김정주 while
    accepting "CEO", which is the over-broad filter this repository has already
    been bitten by twice: it was a rule against sequels that deleted Antar 4.
  */
  if (!/\p{Lu}/u.test(residue) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(residue)) {
    return false
  }
  const words = residue.split(/\s+/).filter(Boolean)
  return !words.every((word) => POST_WORDS.has(word.toLowerCase()))
}

export type Officer = { name: string; role: string }

/**
 * `"Sam Lake (creative director)"` -> `{ name, role }`, or null.
 *
 * The name is whatever precedes the final bracketed phrase, tested with
 * `looksLikeName` rather than matched by a shape of its own — one rule for
 * what a name is, used by both paths. "Boris Nuraliev (Founder & CEO) (1991–)"
 * therefore reads as a name of "Boris Nuraliev (Founder & CEO)", fails, and
 * stays dropped, which is right: nobody can say which bracket is the post.
 */
export const readOfficer = (fragment: string): Officer | null => {
  const match = fragment.match(/^(.+?)\s*\(([^()]+)\)$/)
  if (!match) return null
  const name = match[1]!.trim()
  if (!looksLikeName(name)) return null
  return { name, role: match[2]!.trim() }
}

/**
 * A bare name with no post — `"David Dedeine"`.
 *
 * Refuses anything carrying a bracket, so a fragment the officer reader turned
 * down does not get in through the back door with its role thrown away.
 */
export const readKeyPerson = (fragment: string): string | null => {
  if (/[()]/.test(fragment)) return null
  if (TEMPLATES.has(fragment.trim().toLowerCase())) return null
  return looksLikeName(fragment) ? fragment.trim() : null
}

// ---------------------------------------------------------------------------
// Slugs and sentences
// ---------------------------------------------------------------------------

/*
  The same fold `src/seed/people.ts` applies, and it has to stay the same.

  `slugify` replaces anything outside `[a-z0-9]` with a hyphen, so "Markus
  Mäki" becomes `markus-m-ki` there and here — but only if both files fold the
  same letters first. If they drift, this pass creates a second record for
  somebody who already has one and the two disagree from then on.
*/
const FOLD: Record<string, string> = {
  ł: 'l',
  Ł: 'L',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ß: 'ss',
  æ: 'ae',
  Æ: 'Ae',
  œ: 'oe',
  Œ: 'Oe',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ı: 'i',
}

/* Exported because `src/lib/officers.ts` links the same names back on the
   company profile, and a second fold there would disagree with this one on
   exactly the records the fold exists for. */
export const personSlug = (name: string): string =>
  slugify(
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[łŁøØđĐßæÆœŒðÐþÞı]/g, (character) => FOLD[character] ?? character),
  )

const lower = (value: string): string => value.trim().toLowerCase()

/** Sentence case for a role a source wrote in lower case: "chairman" -> "Chairman". */
const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

/** "Capcom’s", but "Big Huge Games’" — a plural already ending in s takes the bare apostrophe. */
const possessive = (name: string): string => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

/**
 * The first line of text in a rich-text body, for asking what it already says.
 *
 * The same reader `company-games.ts` uses on the same question. Lexical's
 * "empty" is a root holding one empty paragraph, so the paragraph this wants is
 * the first one with text in it rather than the first one.
 */
const firstLine = (body: unknown): string => {
  const root = (body as { root?: { children?: { children?: { text?: string }[] }[] } } | null)?.root
  const paragraph = root?.children?.find((node) =>
    (node.children ?? []).some((child) => String(child?.text ?? '').trim().length > 0),
  )
  return (paragraph?.children ?? []).map((child) => String(child?.text ?? '')).join('').trim()
}

// ---------------------------------------------------------------------------

type CompanyRow = {
  id: string | number
  name: string
  keyPeople?: string | null
  sources?: { title?: string | null; url?: string | null; retrieved?: string | null }[] | null
}

type PersonRow = {
  id: string | number
  name: string
  slug: string
  basis?: string | null
  summary?: string | null
  /* Read, not written: the sameness test below asks what the stored body
     already opens with. */
  body?: unknown
  companies?: (string | number)[] | null
  sources?: { title?: string | null; url?: string | null; retrieved?: string | null }[] | null
}

type Post = {
  /* Null where the article names the person and states no post. */
  role: string | null
  company: CompanyRow
  source: { title: string; url: string; retrieved?: string | null }
}

/**
 * What the record says about one company, in a sentence a reader can check.
 *
 * The no-post wording is about this record rather than about the article,
 * deliberately. AGEod's infobox does state Philippe Thibaut's post — it writes
 * it without brackets, which this cannot read — so "the article does not state
 * a post" would be a claim about a source that is not true. What is true is
 * that no post is carried here.
 */
const clauseFor = (post: Post): string =>
  post.role
    ? `${possessive(post.company.name)} own article names them as ${post.role}`
    : `${possessive(post.company.name)} own article names them among its key people, with no post stated in a form this record can carry`

async function run(): Promise<void> {
  /*
    Imported here rather than at the top of the file so that
    `company-officers.test.ts` can pin the split rules without booting Payload,
    sharp and a database connection to do it.
  */
  await import('dotenv/config')
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const payload = await getPayload({ config })

  const companies = await payload.find({ collection: 'companies', limit: 1000, depth: 0, sort: 'name' })
  const rows = companies.docs as unknown as CompanyRow[]

  const posts = new Map<string, { name: string; posts: Post[] }>()
  const dropped: string[] = []
  const unsourced: string[] = []
  let withRole = 0
  let namedOnly = 0

  for (const company of rows) {
    if (!company.keyPeople?.trim()) continue

    /*
      The company's own article, which is the only thing a created record will
      be able to cite. `src/seed/import.ts` rejects a record with no source URL
      and this is the same rule at the other door: no citation, no record — and
      the company is named in the output so somebody can go and find one.
    */
    const cited = (company.sources ?? []).find((source) => source.url)
    if (!cited?.url) {
      unsourced.push(company.name)
      continue
    }
    const source = {
      title: cited.title || `${company.name} — Wikipedia`,
      url: cited.url,
      retrieved: cited.retrieved ?? null,
    }

    const keep = (name: string, role: string | null) => {
      const key = lower(name)
      const entry = posts.get(key) ?? { name, posts: [] }
      entry.posts.push({ role, company, source })
      posts.set(key, entry)
    }

    for (const fragment of rejoinStrayCommas(splitOutsideBrackets(company.keyPeople))) {
      const officer = readOfficer(fragment)
      if (officer) {
        withRole += 1
        keep(officer.name, officer.role)
        continue
      }
      const named = readKeyPerson(fragment)
      if (named) {
        namedOnly += 1
        keep(named, null)
        continue
      }
      const why = TEMPLATES.has(fragment.trim().toLowerCase())
        ? 'infobox template, not a person'
        : BRACKETS_ONLY.test(fragment)
          ? 'a post with nobody holding it'
          : 'not a name this pass will publish'
      /*
        Whether the profile still shows it, which is the other half of the
        decision and used to be invisible from here. A fragment that could name
        somebody is printed unlinked on the company page; one that could not is
        gone from both.
      */
      const shown = couldNameAPerson(fragment) ? ', still printed unlinked on the profile' : ''
      dropped.push(`${fragment}  — ${company.name}  (${why}${shown})`)
    }
  }

  // --- Who already has a record -------------------------------------------
  const people = await payload.find({ collection: 'people', limit: 5000, depth: 0 })
  const existing = people.docs as unknown as PersonRow[]
  const byName = new Map(existing.map((person) => [lower(person.name), person]))
  /*
    A second index on the slug, because "Olivier Deriviere" and "Olivier
    Derivière" are one person and only the slug says so. Name first, slug as
    the fallback — the slug is lossy, and two genuinely different names that
    fold together would be a worse mistake than a duplicate.
  */
  const bySlug = new Map(existing.map((person) => [person.slug, person]))

  let matched = 0
  let created = 0
  let unchanged = 0
  let failed = 0

  for (const [, entry] of posts) {
    const slug = personSlug(entry.name)
    const person = byName.get(lower(entry.name)) ?? bySlug.get(slug)
    const companyIds = entry.posts.map((post) => post.company.id)
    const companyNames = [...new Set(entry.posts.map((post) => post.company.name))]

    /*
      Low confidence, and the summary says exactly how little is known. A name
      in an infobox is a credit, not a biography: there is no date of birth
      here, no nationality, and nothing inferred from where the company is.

      Each post keeps its own company. The first version of this line joined
      every role with a comma and then named only the first company, so Tom
      Dusenberry read "Co-founder, CEO, 1998-2001, 704Games" — which puts him
      in a job at a company that never employed him, assembled out of two facts
      that were each true on their own. Six people hold posts at two companies
      and all six were wrong.
    */
    const when = entry.posts[0]!.source.retrieved
    const read = typeof when === 'string' && when.length >= 10 ? when.slice(0, 10) : null
    const summary = `${capitalise(listSentence(entry.posts.map(clauseFor)))}${read ? `, read on ${read}` : ''}.`

    /*
      A post, where there is one. A bare name gets no strapline at all rather
      than a made-up one: the directory line under the name is the most-read
      sentence on the record and "Executive" there would be the inference this
      pass exists not to make.
    */
    const posted = entry.posts.find((post) => post.role)
    const knownFor = posted ? `${capitalise(posted.role!)}, ${posted.company.name}` : ''

    /*
      The lede and the body are two different sentences, not one printed twice.

      `summary` is what the profile prints as the lede under the `<h1>`, and
      the body opens directly beneath it. Passing the identical string to both
      put the same sentence on the page twice, adjacent, on 469 profiles - it
      reads as a rendering fault, and nothing could have caught it but somebody
      opening a page. Fixed here rather than in the renderer, which would be
      hiding a record that really does hold the sentence twice.

      The lede goes back into the body only where the 320-character field could
      not hold the whole of it, because then the two are not the same sentence
      and the short one is missing a post somebody holds.
    */
    const short = summary.slice(0, 320)
    const blocks = [
      ...(short === summary ? [] : [summary]),
      'That is the whole of what this network knows about them. The name is here because a ' +
        'sourced article about the company printed it, which is the only claim this page makes — ' +
        'not that they were involved in any game covered here, and not that it is current: ' +
        'people change job more often than an infobox is updated.',
    ]

    const composed = {
      /*
        `developer` is the schema's "role not stated", which is the honest
        answer for a name printed under a heading rather than next to a job.
      */
      roles: [posted ? 'executive' : 'developer'],
      knownFor,
      basis: 'company-officer',
      confidence: 'low',
      summary: short,
      body: rich(...blocks),
    }

    if (person) {
      const current = (person.companies ?? []).map((value) =>
        typeof value === 'object' ? (value as { id: string | number }).id : value,
      )
      const merged = [...current]
      for (const id of companyIds) if (!merged.includes(id)) merged.push(id)

      /*
        The relationship is a claim — "this company's article names this
        person" — so it arrives with the citation that supports it. Without
        this the link would be the one thing on the record with nothing behind
        it.
      */
      const sources = [...(person.sources ?? [])]
      for (const post of entry.posts) {
        if (!sources.some((source) => source.url === post.source.url)) sources.push(post.source)
      }

      /*
        A record this pass wrote is a record this pass owns, so its composed
        sentences are rewritten from today's `keyPeople` rather than left at
        whatever the wording was the day it was created. Without this,
        correcting the sentence above would fix nothing already in the
        database — the same trap `seed:prune` exists for, where tightening a
        rule does nothing to the pages the loose rule already wrote.

        A person who is here for a game credit keeps everything they have.
        Only the relationship and its citation are added, because that is the
        only thing this pass knows about them.
      */
      const owned = person.basis === 'company-officer'
      const data = owned ? { ...composed, companies: merged, sources } : { companies: merged, sources }

      /*
        The body is compared too, and that is not belt and braces.

        This test decided a record needed no write from the summary alone, so
        the pass that fixed the duplicated paragraph above would have reported
        469 records "already linked" and rewritten none of them - a code fix
        that changes nothing, with a green run to say so. A seeder's sameness
        test has to cover every field it composes, or correcting one of them is
        a no-op nobody notices.
      */
      const same =
        merged.length === current.length &&
        sources.length === (person.sources ?? []).length &&
        (!owned ||
          (person.summary === composed.summary && firstLine(person.body) === blocks[0]))
      if (same) {
        unchanged += 1
        continue
      }
      await payload.update({ collection: 'people', id: person.id, data: data as never })
      matched += 1
      console.log(
        `  ${(owned ? 'rewrote' : 'matched').padEnd(8)} ${entry.name.padEnd(28)} ${companyNames.join(', ')}`,
      )
      continue
    }

    try {
      const record = await payload.create({
        collection: 'people',
        data: {
          name: entry.name,
          slug,
          ...composed,
          companies: companyIds,
          sources: entry.posts.map((post) => post.source),
        } as never,
      })
      byName.set(lower(entry.name), record as unknown as PersonRow)
      created += 1
      console.log(`  created  ${entry.name.padEnd(28)} ${companyNames.join(', ')}`)
    } catch (error) {
      /*
        Almost always a slug already taken by somebody whose name folds to the
        same thing. Reported rather than worked around: a suffixed slug would
        paper over two people being confused for each other.
      */
      failed += 1
      console.error(`  FAILED   ${entry.name.padEnd(28)} ${(error as Error).message}`)
    }
  }

  console.log(
    `\n${withRole} fragments read as <Name> (<role>), ${namedOnly} as a name with no post, ` +
      `${posts.size} distinct people.`,
  )
  console.log(
    `${matched} matched an existing record, ${created} created, ${unchanged} already linked, ${failed} could not be written.`,
  )
  if (unsourced.length > 0) {
    console.log(
      `\n${unsourced.length} companies skipped for having no source URL to cite: ${unsourced.join(', ')}`,
    )
  }
  console.log(`\n${dropped.length} fragments dropped — the finding, not the failure:`)
  for (const fragment of dropped) console.log(`  ${fragment}`)

  process.exit(0)
}

/*
  Only when this file is what was run.

  Without the guard, importing it to test `splitOutsideBrackets` would seed the
  database as a side effect of the import — which is a fast way to write to a
  live database from a test run and never work out where it came from.
*/
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
/* Case-insensitively, because Windows hands back the drive letter either way. */
if (invoked.toLowerCase() === import.meta.url.toLowerCase()) {
  run().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
