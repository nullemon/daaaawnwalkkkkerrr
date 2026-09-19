import type { Payload } from 'payload'
import { rich } from '../lexical'
import { hasRichText } from '../../lib/copy'

/**
 * The wording each wiki's own pages are already showing, written into the
 * fields that can change it: `homeCopy`, `aboutPage`, `toolCopy`, `briefing`.
 *
 * Without this pass the admin gains forty empty boxes and an editor has no way
 * to find out what any of them currently say short of reading the JSX. A
 * control that is present, reachable and uninformative is the same failure as
 * a checkbox that reads as ticked and does nothing.
 *
 * ## Two rules it cannot break
 *
 * **It never overwrites.** Anything already filled in is left exactly as it
 * is, on every run, because this sits in `pnpm db:reset` — the one command
 * people run without thinking hard about it — and a pass that reverts an
 * editor's work on a rebuild is worse than no pass.
 *
 * **Dawnwalker's wording is Dawnwalker's.** Seven of these wikis get the plain
 * derived sentence they render today, not the copy written when there was one
 * game. That distinction is the whole point of `src/lib/section-copy.ts`, and
 * losing it here would put it back through the seeder instead of the
 * component: the Gears of War about page telling readers about 480 segments,
 * with a real editor's name on the revision.
 *
 * The one place a game is named by slug is the briefing, and it is named
 * deliberately. "Commit to Crake early, or write him off" is a signed opinion
 * about one game's ally chains; there is no derived form of it and no other
 * wiki it is true on. Seed data is where content about a specific game
 * belongs — a component is not, which is why that text has moved here.
 */

/** Blank means "nobody has written this", for every shape these fields take. */
const blank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return !hasRichText(value)
  return false
}

type Row = Record<string, unknown>

/**
 * Copy `wanted` into `current`, skipping anything already there, and report how
 * many fields that actually was. The caller skips the write when the answer is
 * zero: `updatedAt` is what "Recently updated" reads off, so a no-op pass that
 * still writes would reorder every wiki's rail on every rebuild.
 */
const fillBlanks = (current: Row | null | undefined, wanted: Row): { next: Row; filled: number } => {
  const next: Row = { ...(current ?? {}) }
  let filled = 0
  for (const [key, value] of Object.entries(wanted)) {
    if (value === undefined) continue
    if (!blank(next[key])) continue
    next[key] = value
    filled += 1
  }
  return { next, filled }
}

// ---------------------------------------------------------------------------
// The home page. Identical on all eight, because every sentence on it is about
// how the wiki is written rather than about the game — the tokens carry the
// difference.

const HOME: Row = {
  upcomingHeading: 'This game is not out yet',
  buildingHeading: 'This wiki is just starting',
  upcomingBody:
    'Everything here comes from what {publisher} has actually confirmed — release, editions, requirements, features. There are no walkthroughs, no item lists and no boss strategies, because nobody has played it. Those arrive when there is something real to put in them.',
  buildingBody:
    'There is little here yet. What is here is sourced; nothing has been filled in from guesswork to make the wiki look bigger than it is.',
  startHereHeading: 'Start here',
  startHereNote:
    'The questions most people arrive with, each answered from a source you can check.',
  browseHeading: 'Browse the database',
  browseNote:
    'Only sections with records in them. A link to an empty index reads as a broken site, so there are none.',
  latestHeading: 'Guides',
  popularHeading: 'Hardest achievements',
  recentHeading: 'Recently updated',
  statsHeading: 'What is in this wiki',
  trustHeading: 'How this wiki is written',
  relatedHeading: 'Other wikis on this network',
  trustBody:
    'Every figure here is cited to the source it came from, with the date we read it. Where nobody has published something, the page says so rather than guessing — a blank is honest, and a plausible-looking number that turns out to be invented costs you a playthrough.',
}

// ---------------------------------------------------------------------------
// The about page.

const PUBLISHER_LINE =
  'The {game} Wiki is published by {entity}, a digital agency operating since 2013 with offices in the Philippines, India and the United States. The site is an independent fan project: it is not affiliated with {rightsholders}, and no endorsement is claimed or implied.'

/**
 * The about page, per wiki.
 *
 * Links are written as `[words](/path)` and `rich()` turns them into real
 * Lexical link nodes. That matters more than it looks: "if you can confirm
 * something here, tell us" with the anchor gone is not a plainer sentence, it
 * is a corrections form nobody can reach from the page asking them to use it.
 *
 * **No counted figure is seeded.** Rich text has no tokens, so a number typed
 * into one of these bodies is frozen the moment it is written - "15 of 93" on
 * the page whose whole argument is that our numbers are live, going wrong the
 * week somebody sources a quest cost, with nothing erroring. The live count
 * stays where it can stay live: the panel beside this prose, which reads it off
 * the database on every build.
 */
const aboutFor = (hasRunPlanner: boolean): Row => ({
  title: 'About the {game} Wiki',
  metaDescription:
    'Who runs the {game} wiki, where its facts come from, what we do when sources disagree, and what we deliberately do not claim to know.',
  lede: hasRunPlanner
    ? 'A run planner and database for {title}, built around the one constraint the game never lets you forget: you have 480 segments and you cannot have them back.'
    : 'A database for {game}, compiled from public sources, with every record carrying the citations it was built from.',
  purposeHeading: 'What this site is for',
  runsItHeading: 'Who runs it',
  purpose: hasRunPlanner
    ? rich(
        'Most guides for an open-world game are written as if you will eventually do everything. This one is not, because in this game you will not. Thirty days, sixteen segments each, and when the budget is gone the story ends whether or not you were ready. Two of the seven endings are lost by players who never knew they were on a clock.',
        'So the question this site is built to answer is not “how do I do this quest” but “what can I still reach from where I actually am”. The [run checker](/tools/run-checker) walks every ending’s prerequisite chain against the segments you have left. The [build planner](/tools/build-planner) does the same for a spec. Everything else on the site exists to feed those two.',
      )
    : rich(
        'One page per thing, each one saying where its facts came from and how far we trust them. There is no walkthrough written from trailers here and no filler: where a source does not say something, the field is empty and the page says so rather than guessing at it.',
      ),
  publisherLine: PUBLISHER_LINE,
  independence: rich(
    'Editorial decisions are made by the contributors listed here, not by the publisher, and nothing on the site is paid placement. If that ever changes it will be marked on the page it affects.',
  ),
  sourcingHeading: 'Where the facts come from',
  sourcing: rich(
    'Every record cites its sources with the date we read them, and the importer that builds this database rejects any record that arrives without one. We compile facts from public wikis, guides and reporting, then write our own prose. We never copy text or reproduce another site’s tables. Facts are not anyone’s property; the way they were written up is.',
    'We do not have privileged access to the game. Nothing here has been verified against a running copy, which is exactly why a claim we cannot source is left out rather than smoothed over, and why the citations are on the page rather than in a footnote nobody reads.',
  ),
  /*
    This section used to be a glossary: High, Medium and Low, and what each one
    meant. It explained a badge that printed on every record page.

    The badge is editorial now - `Confidence` renders it only for a signed-in
    editor - so the glossary taught a reader three words they would never meet
    again on the site, which is worse than saying nothing: it reads as a
    promise that the pages are annotated, and they are not. What survived is
    the half that was always about the reader's own page, and is still visible
    on it: where two sources disagree, the disagreement is written down.
  */
  confidenceHeading: 'Where sources disagree',
  confidence: rich(
    hasRunPlanner
      ? 'Published counts for a game vary widely depending on who is counting and what they count, and at least one ally questline is described with a different length and a different final quest name depending on the site. Where sources conflict we record the conflict on the page rather than pick a winner.'
      : 'Published counts for a game vary widely depending on who is counting and what they count. Where sources conflict we record the conflict on the page rather than pick a winner.',
    'Behind that, every record is rated for how far we trust it, and that rating decides what gets rewritten next. It is a working note for the people editing this wiki rather than something printed beside a fact, because a hedge next to a sentence does not help you decide whether to believe it — the sources underneath do, and they are on every page.',
  ),
  limitsHeading: 'What we deliberately do not claim to know',
  limits: hasRunPlanner
    ? rich(
        /*
          The shipped sentence opened "Only 15 of 93 quests have a figure we can
          stand behind". Both halves of that are counts, and a count typed into
          rich text is a claim the database stops agreeing with the week a quest
          cost is sourced. It points at the panel instead, which counts.
        */
        'Per-quest segment costs. Only some quests have a figure we can stand behind — the panel beside this counts them — and the rest are stored as unknown rather than as zero. An unknown cost is not a free quest, and a planner that quietly treated it as one would be worse than no planner, so the run checker reports any total containing one as a floor rather than a figure.',
        'The same rule applies everywhere else. A region we cannot source is left blank, an item whose location nobody publishes says so, and a picture is never captioned with a place unless a source names it. A gap is honest; an invented number is not.',
      )
    : rich(
        'A region we cannot source is left blank, an item whose location nobody publishes says so, and a picture is never captioned with a place unless a source names it. A gap is honest; an invented number is not.',
      ),
  correctionsHeading: 'Corrections',
  corrections: rich(
    'If you have the game in front of you and can confirm or contradict something here, [tell us](/corrections). Corrections go to a review queue and are read. Being wrong in public and fixing it quickly is the only way a site compiled from second-hand sources earns any trust at all.',
  ),
})

// ---------------------------------------------------------------------------
// The tools. Seeded per feature: a wiki with no run checker should not carry
// four fields describing one, because the next person to read them has no way
// to tell that nothing renders from them.

const RUN_CHECKER: Row = {
  runCheckerTitle: 'Run checker — which endings can you still reach?',
  runCheckerDescription:
    'Enter your current day and the quests you have finished. Find out which of the seven endings are still reachable, which are out of time, and which you have.',
  runCheckerHeading: 'Can you still make it?',
  runCheckerHowHeading: 'How this works',
  runCheckerHowBody:
    'A run is 480 segments — thirty days of eight daylight and eight night segments. The checker walks each ending’s prerequisite chain, subtracts what you have already done, and compares what is left against your remaining budget. It also treats a completed quest that permanently excludes part of a chain as a hard lock rather than a time problem, because no amount of remaining time fixes that. {clockLink}.',
  runCheckerLede:
    'Every other {game} planner builds a route from day one. This one starts from where you actually are: tell it your day and what you have finished, and it works out which endings are still on the table.',
  runCheckerFloorNote: 'Read these as a floor, not a verdict',
  runTitle: 'Your run',
  runDescription:
    'Where you are in the thirty days, which endings you can still reach from here, and what to do next.',
  runHeading: 'Your run',
  runLede:
    'Everything you have ticked, what it costs you, and which of the {endings} endings are still open from where you actually are. Kept in this browser unless you sign in.',
}

const BUILD_PLANNER: Row = {
  buildPlannerTitle: 'Build planner — pick perks across all three trees',
  buildPlannerDescription:
    'Plan a {game} build across Swordmastery, Witchcraft and Vampirism. Enforces one ultimate per tree, totals the segment cost, and gives you a link you can share.',
  buildPlannerHeading: 'Build planner',
  buildPlannerLede:
    'Three trees, nine ultimates, one ultimate per tree. Pick your way through and share the result as a link.',
}

const COMPLETION: Row = {
  completionTitle: '{game} completion tracker',
  completionDescription:
    'Tick off the {count} achievements in {game} and see what is left, weighted by how few players have each one.',
  completionHeading: 'What is left?',
  completionLede:
    'Tick off what you have earned in {game}. The tracker weights what remains by how few players have each one, so it tells you how much work is actually left rather than how many boxes are unticked.',
}

// ---------------------------------------------------------------------------
// The briefing.

/**
 * Dawnwalker's read on Dawnwalker, which is where it has always been true and
 * nowhere else. Every number in it is a token: "there are 42 across the three
 * courts" typed out is a sentence that goes quietly wrong the week a court's
 * activity count is corrected.
 */
const BRIEFINGS: Record<string, Row> = {
  dawnwalker: {
    eyebrow: 'Our read',
    heading: 'If you are starting now',
    lede: 'Opinions, not facts. The reasoning is shown so you can disagree with it.',
    endingsHeading: 'The {endings} endings',
    endingsNote:
      'Most are decided at the finale and cannot be lost early. The rest are gated on chains you finish long before you get there.',
    takes: [
      {
        who: 'Court order',
        claim: 'Fight {cheapest} first.',
        reasoning:
          'The duel unlocks at roughly three quarters of a vassal’s Court Activities, and the courts are not the same size: {courtSizes}. A proportional threshold on a smaller court is simply less work, so {cheapest} is the cheapest duel to reach — and clearing one court early tells you what the other two will cost.',
      },
      {
        who: 'Ally chains',
        claim: 'Commit to Crake early, or write him off.',
        reasoning:
          'Crake’s chain runs eight quests and each appears only after the previous closes. You cannot parallelise it and you cannot compress it, which makes it the one thing on this list a late run genuinely cannot buy back. Lacra’s chain is shorter but almost entirely night-locked, so taking it commits your nights and leaves your days as the flexible half.',
      },
      {
        who: 'Budget',
        claim: 'Do not clear every Court Activity.',
        reasoning:
          'There are {activities} across the three courts and you need roughly {needed}. That gap is the largest single saving available to a tight run, and most walkthroughs will happily march you through all of them.',
      },
    ],
  },
}

// ---------------------------------------------------------------------------

const seed = async (payload: Payload): Promise<number> => {
  const { docs: games } = await payload.find({
    collection: 'games',
    limit: 1000,
    depth: 0,
    pagination: false,
  })

  let total = 0

  for (const game of games) {
    const features = game.features ?? []
    const hasRunPlanner = features.includes('run-checker')

    const home = fillBlanks(game.homeCopy as Row | null, HOME)
    const about = fillBlanks(game.aboutPage as Row | null, aboutFor(hasRunPlanner))

    const tools = fillBlanks(game.toolCopy as Row | null, {
      ...(hasRunPlanner ? RUN_CHECKER : {}),
      ...(features.includes('build-planner') ? BUILD_PLANNER : {}),
      ...(features.includes('completion-tracker') ? COMPLETION : {}),
    })

    /*
      The briefing's switch is seeded only alongside its takes. `enabled` is a
      checkbox, and a checkbox an editor has deliberately unticked looks exactly
      like one nobody has touched — so writing `true` on every run would turn a
      wiki's briefing back on at every `db:reset` and call it seeding. Once
      there are takes on the record, this group belongs to whoever wrote them.
    */
    const wantedBriefing = BRIEFINGS[game.slug]
    const briefingRow = (game.briefing ?? null) as Row | null
    let briefing: { next: Row; filled: number } = { next: briefingRow ?? {}, filled: 0 }
    if (wantedBriefing && blank(briefingRow?.takes)) {
      briefing = fillBlanks(briefingRow, wantedBriefing)
      /*
        Set outright rather than through `fillBlanks`, because an unticked
        checkbox is stored as `false` and `false` is not blank — so the switch
        would be the one field the seeder could never write, and the takes it
        just seeded would render nowhere.
      */
      if (briefing.next.enabled !== true) {
        briefing.next.enabled = true
        briefing.filled += 1
      }
    }

    const filled = home.filled + about.filled + tools.filled + briefing.filled
    if (filled === 0) continue

    await payload.update({
      collection: 'games',
      id: game.id,
      data: {
        homeCopy: home.next,
        aboutPage: about.next,
        toolCopy: tools.next,
        briefing: briefing.next,
      },
    })

    total += filled
  }

  return total
}

export default seed

// ---------------------------------------------------------------------------

/**
 * The one exception to "it never overwrites", and it is narrow for the reason
 * `correctPrivacy` is narrow: a stale sentence about mechanism is not a stale
 * sentence, it is a false one.
 *
 * Five fields on every wiki described a confidence badge printed beside every
 * record. The owner has since decided that rating is editorial — `Confidence`
 * in `src/components/Badges.tsx` renders it for a signed-in editor and for
 * nobody else — so an about page headed "What the confidence ratings mean",
 * glossing three words a reader will never meet, is a promise the pages do not
 * keep. The terms page said it outright: "Every page shows a confidence
 * rating". That one is a disclaimer, which makes it the worst of the five.
 *
 * Each field is rewritten **only while it still carries the wording this
 * repository shipped**, which is the evidence nobody has redrafted it. An
 * edited field is printed and left alone, with what to check by hand.
 */

/** Rich text or plain, flattened far enough to look for a sentence in. */
const textOf = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  if (typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  const parts: string[] = []
  if (typeof record.text === 'string') parts.push(record.text)
  if (record.root) parts.push(textOf(record.root))
  if (Array.isArray(record.children)) parts.push(textOf(record.children))
  return parts.join(' ')
}

/**
 * `group` is the field on the game that holds it, `key` the field inside,
 * `stillSays` the fragment that proves it is ours, and `wanted` reads the
 * replacement out of the same constants the seeder fills blanks from — so a
 * later edit to the wording cannot leave the corrector writing the old one.
 */
const CONFIDENCE_CORRECTIONS: {
  group: 'homeCopy' | 'aboutPage'
  key: string
  stillSays: string
  wanted: (hasRunPlanner: boolean) => unknown
  checkByHand: string
}[] = [
  {
    group: 'homeCopy',
    key: 'trustBody',
    stillSays: 'carries a confidence rating',
    wanted: () => HOME.trustBody,
    checkByHand: 'it may still tell readers each figure carries a confidence rating; no page prints one',
  },
  {
    group: 'aboutPage',
    key: 'metaDescription',
    stillSays: 'what the confidence ratings mean',
    wanted: (run) => aboutFor(run).metaDescription,
    checkByHand: 'the search result for /about may still promise an explanation of the confidence ratings',
  },
  {
    group: 'aboutPage',
    key: 'lede',
    stillSays: 'a rating for how far we trust it',
    wanted: (run) => aboutFor(run).lede,
    checkByHand: 'the lede may still say each record carries a rating readers can see',
  },
  {
    group: 'aboutPage',
    key: 'sourcing',
    stillSays: 'every record carries a confidence rating rather than presenting',
    wanted: (run) => aboutFor(run).sourcing,
    checkByHand: 'the sourcing section may still point at a rating on the record',
  },
  {
    group: 'aboutPage',
    key: 'confidenceHeading',
    stillSays: 'What the confidence ratings mean',
    wanted: (run) => aboutFor(run).confidenceHeading,
    checkByHand: 'the heading may still announce a glossary of ratings readers cannot see',
  },
  {
    group: 'aboutPage',
    key: 'confidence',
    stillSays: 'agreed by multiple independent sources',
    wanted: (run) => aboutFor(run).confidence,
    checkByHand: 'the section may still be a High/Medium/Low glossary for a badge no reader is shown',
  },
]

export const correctConfidenceCopy = async (payload: Payload): Promise<void> => {
  const { docs: games } = await payload.find({
    collection: 'games',
    limit: 1000,
    depth: 0,
    pagination: false,
  })

  let rewritten = 0
  const leftAlone: string[] = []

  for (const game of games) {
    const hasRunPlanner = (game.features ?? []).includes('run-checker')
    const groups: Record<string, Row> = {
      homeCopy: { ...((game.homeCopy as Row | null) ?? {}) },
      aboutPage: { ...((game.aboutPage as Row | null) ?? {}) },
    }

    let changed = 0
    for (const rule of CONFIDENCE_CORRECTIONS) {
      const held = groups[rule.group][rule.key]
      // Blank means the page renders the built-in wording, which is already
      // the corrected one; `seed` above fills it in.
      if (blank(held)) continue

      const wanted = rule.wanted(hasRunPlanner)
      if (textOf(held) === textOf(wanted)) continue

      if (!textOf(held).includes(rule.stillSays)) {
        leftAlone.push(`${game.slug} ${rule.group}.${rule.key} \u2014 ${rule.checkByHand}`)
        continue
      }

      groups[rule.group][rule.key] = wanted
      changed += 1
    }

    if (changed === 0) continue
    await payload.update({
      collection: 'games',
      id: game.id,
      data: { homeCopy: groups.homeCopy, aboutPage: groups.aboutPage },
    })
    rewritten += changed
  }

  if (rewritten === 0 && leftAlone.length === 0) return
  if (rewritten > 0) {
    console.log(
      `  confidence copy: rewrote ${rewritten} field${rewritten === 1 ? '' : 's'} that described a badge readers are no longer shown.`,
    )
  }
  for (const note of leftAlone) {
    console.log(`  confidence copy: LEFT ALONE ${note}. Edited since it shipped, so nothing here touched it.`)
  }
}
