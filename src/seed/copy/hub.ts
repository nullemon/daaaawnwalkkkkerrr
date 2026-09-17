import type { Payload } from 'payload'
import type { SiteSetting } from '../../payload-types'

/**
 * The hub's own wording, written into the fields that can now change it.
 *
 * Every string here is the sentence the page renders today, copied out of the
 * component that renders it. The component keeps its copy as the fallback — it
 * has to, because a page must render on a database that has never been seeded
 * — so the wording exists in two places on purpose. The alternative is an
 * editor opening twenty empty boxes with no way to find out what any of them
 * currently say, which is a control that is present, reachable and useless.
 *
 * **Nothing already filled in is touched.** This runs inside `pnpm db:reset`,
 * the one command people run without thinking hard about it, and a pass that
 * reverted somebody's edits every time the database was rebuilt would be worse
 * than no pass at all.
 *
 * ## What is deliberately not seeded
 *
 * `footerColumns` and `railItems` are left empty, and that is the correct
 * state rather than an omission. Both fall back to lists that are *derived*:
 * the hub's footer has a column of every wiki, read from the database at build
 * time, and the rail's sections come from what each wiki actually has. Freezing
 * either into a settings row would turn a list that keeps itself right into a
 * copy that goes stale the day a ninth wiki is added — and `railItems` is
 * appended rather than substituted, so seeding it would print every link twice.
 *
 * Counts are never seeded into a sentence either. `{count}`, `{wikis}` and
 * `{pages}` are filled at render from what is actually in the database, which
 * is the whole reason this site's numbers are worth anything.
 */

/*
  Hub home page tab, and the two directory pages: field name to wording.

  Keyed to `SiteSetting` rather than to `string`, because the failure mode of
  this pass is a field name that does not exist — Payload drops an unknown key
  from an update without a word, so the seed would report the field filled, the
  admin would show it empty, and nothing anywhere would say why.
*/
const TEXT: Partial<Record<keyof SiteSetting, string>> = {
  // --- Hub home page: the hero ---
  searchPlaceholder: 'Search the network — a game, a boss, a guide…',

  // --- Hub home page: the three counters (labels only; the figures are counted) ---
  statWikisLabel: 'Wikis',
  statPagesLabel: 'Sourced pages',
  statUpcomingLabel: 'Not out yet',

  // --- Hub home page: section headings ---
  askingHeading: 'What people are asking',
  askingNote:
    'Real searches, harvested from Google’s own autocomplete, matched to the page that answers each. Where a question has no answer here, it is in the queue rather than filled with a guess.',
  directoryHeading: 'Every wiki',
  directoryNote:
    'Page counts are read from each database when this page is built, so they are what is actually there rather than what we would like to claim.',
  latestHeading: 'Newest writing',

  // --- Hub home page: the house rules ---
  rulesHeading: 'How these are written',
  /*
    `{count}` rather than "Four". The rules are an editable array now, so a
    typed-in number would have the page announce four rules directly above
    five of them. The token is spelled out in words at render.
  */
  rulesNote:
    '{count} rules, on every wiki here. They are the whole reason to read one of these instead of the bigger site that already ranks above it.',

  // --- Hub home page: what a search result shows ---
  metaTitleSuffix: 'game wikis, guides and databases',
  metaDescriptionFallback:
    '{wikis} game wikis and {pages} sourced pages. Every figure carries a confidence rating, and where sources disagree we say so rather than picking one.',

  // --- Directory & standing notes: the wikis directory ---
  wikisTitle: 'Every wiki on the network',
  wikisLede:
    'Each one is its own site with its own database. The page counts below are read from those databases when this page is built, so they are what is actually there rather than what we would like to claim.',
  outNowHeading: 'Out now',
  notOutYetHeading: 'Not out yet',
  notOutYetNote:
    'Built ahead of release from what publishers have confirmed. Everything on these is marked with where it came from, and the day the game ships is the day most of it gets checked against it.',

  // --- Directory & standing notes: the contributors directory ---
  authorsTitle: 'Contributors',
  authorsLede:
    'Guides are signed; the database pages are not, because a compiled fact sheet has no author to claim. A byline that is still a placeholder prints the name on the record and links to a profile that says plainly it is a placeholder — the flag comes off the day a real person is behind it.',

  // --- Directory & standing notes: the lines printed on several thousand pages ---
  /*
    `{corrections}` is the link to the corrections queue, rendered as a React
    child rather than pasted in as markup — see `src/components/Sources.tsx`.
    An editor who deletes the token loses the link, which is visible; an
    editor who could type an anchor would be typing into the DOM, which is a
    stored-XSS hole.
  */
  sourcesCaveat:
    'Facts compiled from public sources and not verified against the game. Spotted an error? {corrections} — corrections go straight to our review queue.',
  attributionFullExtra:
    'The wording on this page is our own; only the facts are reused. Reusing this page carries the same licence onward.',
  bylineTeamFallback: 'the {site} team',
  maintainerLine: 'Written and maintained by {maintainer}.',
}

/**
 * The four house rules, verbatim.
 *
 * The one array here worth seeding: unlike the footer columns it is a fixed
 * literal in the page rather than anything derived, so writing it into the
 * settings row changes nothing on the page and makes the network's only
 * statement of what it promises editable without a deploy.
 */
const RULES: { icon: string; heading: string; body: string }[] = [
  {
    icon: 'check',
    heading: 'Nothing is invented',
    body: 'Every figure comes from a source and can be traced. A record with no source is refused at import.',
  },
  {
    icon: 'warn',
    heading: 'Unknown is not zero',
    body: 'Where nobody has published a number, the page says so. A plausible guess costs a reader a playthrough.',
  },
  {
    icon: 'scroll',
    heading: 'Disagreements are recorded',
    body: 'Where two sources differ, both appear. Quietly picking one hides what a careful reader came for.',
  },
  {
    icon: 'book',
    heading: 'The prose is ours',
    body: 'Facts are free to compile; sentences are not. Nothing here is pasted, and nothing is written from a trailer.',
  },
]

/**
 * Blank, in the sense the renderer means it.
 *
 * `null`, `undefined` and `''` all arrive from Payload depending on how the
 * field got there, and all three fall back to the built-in sentence — so all
 * three are fields an editor has not filled in, and all three are ours to
 * write. Anything else is somebody's work.
 */
const isBlank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

const seed = async (payload: Payload): Promise<number> => {
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })

  const data: Record<string, unknown> = {}

  for (const field of Object.keys(TEXT) as (keyof SiteSetting)[]) {
    const text = TEXT[field]
    if (text === undefined || !isBlank(settings[field])) continue
    data[field] = text
  }

  if (!settings.rules || settings.rules.length === 0) data.rules = RULES

  const filled = Object.keys(data).length
  if (filled === 0) return 0

  // One write for the lot. A field-at-a-time loop would run the global's hooks
  // and revalidation twenty times over for a pass that changes one row.
  await payload.updateGlobal({ slug: 'site-settings', data: data as never })
  return filled
}

export default seed
