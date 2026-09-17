import {
  personSlug,
  readKeyPerson,
  readOfficer,
  rejoinStrayCommas,
  splitOutsideBrackets,
} from '@/seed/company-officers'

/**
 * `company.keyPeople`, read back as the people it names.
 *
 * The field is one string holding what a Wikipedia infobox printed — "Megan
 * Ellison (founder), Nathan Gary (president)" — and the profile printed it as
 * prose, which made every one of those names a dead end on a network that has
 * a page for most of them. `pnpm seed:company-officers` already split this
 * string once, created 444 person records from it and set `people.companies`;
 * this reads the same string back so the page can link what that pass filed.
 *
 * **The split rules are imported, not rewritten.** A second idea here of where
 * one name ends would link the names it happens to agree with and silently
 * plain-text the rest — and the disagreement would be invisible, because an
 * unlinked name looks exactly like a person we have no page for.
 *
 * A fragment neither rule reads — "(chairman)Yuji Asako", an infobox template
 * that leaked into the value — comes back with no name and still gets printed.
 * A name we cannot link is still a name the source stated, and dropping it
 * would be this page quietly editing its own source.
 */
export type OfficerEntry = {
  /** The fragment as the infobox wrote it. What renders when there is no name. */
  text: string
  /** The name, where one of the two rules read one. */
  name: string | null
  /** The post, where the article stated one in brackets. */
  role: string | null
  /** This network's record for them, where there is one. */
  slug: string | null
}

type PersonLike = { name?: string | null; slug?: string | null }

const lower = (value: string): string => value.trim().toLowerCase()

export const readOfficers = (
  keyPeople: string | null | undefined,
  people: PersonLike[],
): OfficerEntry[] => {
  const value = keyPeople?.trim()
  if (!value) return []

  /*
    Two indexes, the same pair and the same precedence `seed:company-officers`
    uses when it asks whether somebody already has a record. Name first: the
    slug is a lossy fold — "Olivier Derivière" and "Olivier Deriviere" are one
    person and only the slug says so — and reaching for it first would let two
    genuinely different names that fold together point at each other.
  */
  const byName = new Map<string, string>()
  const bySlug = new Map<string, string>()
  for (const person of people) {
    const slug = person.slug?.trim()
    if (!slug) continue
    if (person.name) byName.set(lower(person.name), slug)
    bySlug.set(slug, slug)
  }

  return rejoinStrayCommas(splitOutsideBrackets(value)).map((fragment) => {
    const officer = readOfficer(fragment)
    const name = officer?.name ?? readKeyPerson(fragment)
    if (!name) return { text: fragment, name: null, role: null, slug: null }
    return {
      text: fragment,
      name,
      role: officer?.role ?? null,
      slug: byName.get(lower(name)) ?? bySlug.get(personSlug(name)) ?? null,
    }
  })
}
