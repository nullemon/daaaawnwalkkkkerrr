import type { Field } from 'payload'
import { GAME_SCOPED } from '../lib/tenancy'

/**
 * Every editorial sentence a wiki says about itself, as fields.
 *
 * The problem this solves is the one `src/lib/section-copy.ts` documents at
 * length: a sentence written about one game, hardcoded in a component, is
 * invisible until a second game exists — and then it is on every page of all
 * of them. The fix there was to key the copy to the game it was written about
 * and give everyone else a plain derived sentence. That stopped the bug but
 * left the words in the repository, where an editor cannot reach them.
 *
 * This is the other half. Everything here is **optional**: a blank field falls
 * back to exactly what the code produced before, so an empty record renders
 * the site it rendered yesterday. Nothing can be broken by not filling it in,
 * and `pnpm seed:copy` writes the current wording into every field so an
 * editor opens a real sentence to edit rather than an empty box.
 *
 * ## Tokens
 *
 * Several of these sentences count something. Hardcoding the count into an
 * editable string is how an about page ends up claiming a number the database
 * outgrew two months ago, so the counts stay live and the copy interpolates
 * them:
 *
 *   {game}    the wiki's short title, or its full title
 *   {count}   how many records are in the section
 *   {detail}  the section's second number — portraits, sourced segment costs
 *   {entity}  the publishing entity from Site settings → Legal & contact
 *   {rightsholders}  developer and publisher, linked to their company profiles
 *
 * An unknown token is left alone rather than blanked, so a typo shows as
 * `{gmae}` on the page instead of silently deleting the number.
 */

/** Human labels for the section select. Derived so it cannot drift from the list. */
const SECTION_LABEL: Record<string, string> = {
  quests: 'Quests',
  achievements: 'Achievements',
  'court-activities': 'Court activities',
  endings: 'Endings',
  regions: 'Regions',
  courts: 'The Court',
  characters: 'Characters',
  enemies: 'Enemies',
  'skill-trees': 'Skill trees',
  perks: 'Perks',
  items: 'Items',
  builds: 'Builds',
  mechanics: 'Mechanics',
  guides: 'Guides',
  maps: 'Maps',
}

const SECTION_OPTIONS = GAME_SCOPED.map((slug) => ({
  label: SECTION_LABEL[slug] ?? slug,
  value: slug,
}))

/**
 * Where a callout appears. Each of these is a box that currently prints a
 * Dawnwalker fact on every wiki that has the section — the "travel is free"
 * note on a region page being the worst of them, since it describes a segment
 * clock only one of the eight games has.
 */
const CALLOUT_OPTIONS = [
  { label: 'Quests — index', value: 'quests-index' },
  { label: 'Items — index', value: 'items-index' },
  { label: 'Endings — index', value: 'endings-index' },
  { label: 'Perks — index', value: 'perks-index' },
  { label: 'Builds — index', value: 'builds-index' },
  { label: 'The Court — index', value: 'courts-index' },
  { label: 'Court activities — index', value: 'court-activities-index' },
  { label: 'Quest — every detail page', value: 'quests-detail' },
  { label: 'Ending — every detail page', value: 'endings-detail' },
  { label: 'Guide — every detail page', value: 'guides-detail' },
  { label: 'Skill tree — every detail page', value: 'skill-trees-detail' },
  { label: 'Court — every detail page', value: 'courts-detail' },
  { label: 'Region — every detail page', value: 'regions-detail' },
]

const richText = (name: string, label: string, description: string): Field => ({
  name,
  type: 'richText',
  label,
  admin: { description },
})

/**
 * The copy tabs on a Game.
 *
 * An unnamed `tabs` field, so every field inside keeps its own top-level name
 * and the stored shape is identical to declaring them flat. It is here purely
 * because a Game edit screen with forty more fields on it stops being usable.
 */
export const gameCopyTabs = (): Field => ({
  type: 'tabs',
  tabs: [
    // ---------------------------------------------------------------------
    {
      label: 'Section copy',
      description:
        'The words at the top of each section index, and the callout boxes inside them. Blank falls back to the wording in the code, which for any game but Dawnwalker is a plain sentence built from the records themselves.',
      fields: [
        {
          name: 'sectionCopy',
          type: 'array',
          label: 'Section index copy',
          labels: { singular: 'Section', plural: 'Sections' },
          admin: {
            description:
              'One row per section. Tokens: {game}, {count}, {detail}. Any field left blank uses the built-in wording for that section.',
            initCollapsed: true,
          },
          fields: [
            {
              name: 'section',
              type: 'select',
              required: true,
              options: SECTION_OPTIONS,
              admin: { description: 'Which index this row is for.' },
            },
            {
              name: 'title',
              type: 'text',
              label: 'Browser title',
              admin: {
                description:
                  'The <title>, before the layout appends the wiki name. This is what a search result shows, so make it different from every other wiki’s.',
              },
            },
            {
              name: 'description',
              type: 'textarea',
              maxLength: 320,
              label: 'Meta description',
              admin: { description: 'The sentence under the title in search results.' },
            },
            {
              name: 'heading',
              type: 'text',
              label: 'Heading on the page',
              admin: { description: 'The <h1>. Usually shorter than the browser title.' },
            },
            {
              name: 'lede',
              type: 'textarea',
              label: 'Lede',
              admin: { description: 'The paragraph under the heading.' },
            },
            {
              /*
                A fingerprint of what `pnpm seed:copy` last wrote into this row.

                Seeding the built-in wording is what makes the admin usable —
                an editor opens a real sentence rather than an empty box. It
                also quietly kills the code the sentence came from: a stored
                row beats the built-in, so correcting `section-copy.ts` stops
                changing any page the moment a database has been seeded. A
                wrong sentence found and fixed stays on the site.

                So the seeder records what it wrote. If the row still matches,
                nobody has edited it and a corrected built-in replaces it. If
                it does not, an editor has been here and the row is never
                touched. That is the difference `pnpm seed:copy` cannot
                otherwise tell, and the reason `src/seed/copy/ui.ts` needs a
                hand-maintained list of superseded wording while this does not.
              */
              name: 'seeded',
              type: 'text',
              admin: { hidden: true },
            },
          ],
        },
        {
          name: 'callouts',
          type: 'array',
          label: 'Callout boxes',
          labels: { singular: 'Callout', plural: 'Callouts' },
          admin: {
            description:
              'The bordered notes inside a section. Leave a row out entirely and the built-in note is shown; add a row and tick "Hide" to show nothing. The Court activities note can use {needed}, {total} and {optional}; everywhere else, {game} and {count}.',
            initCollapsed: true,
          },
          fields: [
            { name: 'where', type: 'select', required: true, options: CALLOUT_OPTIONS },
            {
              name: 'hide',
              type: 'checkbox',
              label: 'Hide this callout',
              admin: {
                description:
                  'Tick to show nothing here. The right answer when the built-in note describes a mechanic this game does not have.',
              },
            },
            {
              name: 'heading',
              type: 'text',
              admin: { condition: (_, siblings) => !siblings?.hide },
            },
            {
              name: 'body',
              type: 'textarea',
              admin: { condition: (_, siblings) => !siblings?.hide },
            },
            {
              type: 'row',
              admin: { condition: (_, siblings) => !siblings?.hide },
              fields: [
                {
                  name: 'linkHref',
                  type: 'text',
                  label: 'Link',
                  admin: { width: '50%', description: 'Optional, e.g. /tools/build-planner.' },
                },
                { name: 'linkLabel', type: 'text', label: 'Link text', admin: { width: '50%' } },
              ],
            },
          ],
        },
        {
          name: 'guideGroups',
          type: 'array',
          label: 'Guide index groups',
          labels: { singular: 'Group', plural: 'Groups' },
          admin: {
            description:
              'How the guide index is grouped. Leave empty to use the built-in grouping. A guide matching no group lands in "Everything else", which is deliberate — a guide nobody can find is worse than an untidy heading.',
            initCollapsed: true,
          },
          fields: [
            { name: 'heading', type: 'text', required: true },
            { name: 'note', type: 'text' },
            {
              name: 'slugs',
              type: 'textarea',
              label: 'Guide slugs',
              admin: {
                description:
                  'One slug per line, e.g. beginners-guide. A guide is claimed by the first group that matches it, so order these the way you want ties broken.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'endsWith',
                  type: 'text',
                  label: 'Slug ends with',
                  admin: { width: '50%', description: 'e.g. -tree-guide.' },
                },
                {
                  name: 'contains',
                  type: 'text',
                  label: 'Slug contains',
                  admin: { width: '50%', description: 'e.g. ending.' },
                },
              ],
            },
            {
              name: 'matchRegions',
              type: 'checkbox',
              label: 'Also match "<region>-guide" for this wiki’s own regions',
              admin: {
                description:
                  'Reads the region records rather than a list typed here, so a new region files its guide without anybody remembering to come back.',
              },
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      label: 'Home page',
      description: 'The wiki’s own front page. The masthead lede is the Summary field further up.',
      fields: [
        {
          name: 'homeCopy',
          type: 'group',
          label: false,
          fields: [
            {
              type: 'collapsible',
              label: 'When the wiki is empty',
              admin: {
                description:
                  'Shown only while the wiki has no records at all. Four of the eight games are not out yet, so this is the first thing most readers of those wikis see.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'upcomingHeading',
                      type: 'text',
                      label: 'Heading — game not out yet',
                      admin: { width: '50%' },
                    },
                    {
                      name: 'buildingHeading',
                      type: 'text',
                      label: 'Heading — out, wiki thin',
                      admin: { width: '50%' },
                    },
                  ],
                },
                {
                  name: 'upcomingBody',
                  type: 'textarea',
                  label: 'Body — game not out yet',
                  admin: { description: 'Tokens: {game}, {publisher}.' },
                },
                { name: 'buildingBody', type: 'textarea', label: 'Body — out, wiki thin' },
              ],
            },
            {
              type: 'collapsible',
              label: 'Section headings',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'startHereHeading', type: 'text', admin: { width: '50%' } },
                    { name: 'startHereNote', type: 'text', admin: { width: '50%' } },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'browseHeading', type: 'text', admin: { width: '50%' } },
                    { name: 'browseNote', type: 'text', admin: { width: '50%' } },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'latestHeading', type: 'text', admin: { width: '50%' } },
                    { name: 'popularHeading', type: 'text', admin: { width: '50%' } },
                  ],
                },
                { name: 'recentHeading', type: 'text', label: 'Recently updated (rail)' },
                {
                  name: 'statsHeading',
                  type: 'text',
                  label: 'Record counts (rail)',
                  admin: {
                    description:
                      'The box counting what this wiki holds. Not the factsheet — that one is the game’s own details and takes its heading from the Interface text registry.',
                  },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'The "how this wiki is written" box',
              admin: {
                description:
                  'In the right-hand rail on the home page. This is the site’s pitch in three sentences — worth writing per wiki.',
              },
              fields: [
                { name: 'trustHeading', type: 'text', label: 'Heading' },
                { name: 'trustBody', type: 'textarea', label: 'Body' },
                /*
                  The heading over the sideways links, which only appear when
                  "Related wikis" on this game's own record has something in it.
                */
                {
                  name: 'relatedHeading',
                  type: 'text',
                  label: 'Heading over the related-wikis list',
                },
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      label: 'About page',
      description:
        'The longest piece of prose on the wiki, and the page a reader lands on when deciding whether to trust the rest. Every field falls back to the built-in wording.',
      fields: [
        {
          name: 'aboutPage',
          type: 'group',
          label: false,
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'title',
                  type: 'text',
                  label: 'Browser title',
                  admin: { width: '50%', description: 'Tokens: {game}, {title}.' },
                },
                {
                  name: 'metaDescription',
                  type: 'textarea',
                  maxLength: 320,
                  label: 'Meta description',
                  admin: {
                    width: '50%',
                    description:
                      'This was the one description repeated verbatim across all eight wikis — eight pages competing for the same result and the engine picking one. Worth writing per wiki.',
                  },
                },
              ],
            },
            { name: 'lede', type: 'textarea', admin: { description: 'Under the page title. Tokens: {game}.' } },
            {
              type: 'row',
              fields: [
                { name: 'purposeHeading', type: 'text', label: 'Heading — what it is for', admin: { width: '50%' } },
                { name: 'runsItHeading', type: 'text', label: 'Heading — who runs it', admin: { width: '50%' } },
              ],
            },
            richText('purpose', 'What this site is for', 'Tokens are not substituted in rich text — write it out.'),
            {
              /*
                The one field on this tab that is not optional prose.

                What shipped here was `settings.legalEntity ?? 'CWMI Group'`
                followed by "a digital agency operating since 2013 with offices
                in the Philippines, India and the United States" — a factual
                claim about a real business, hardcoded in a React component, on
                every wiki. A wrong corporate description on a page that names
                who is legally responsible for the site is not a copy problem.
                The entity itself still comes from Site settings so `LegalGap`
                can still mark it provisional; this is the sentence around it.
              */
              name: 'publisherLine',
              type: 'textarea',
              label: 'Who publishes this site',
              admin: {
                description:
                  'Tokens: {game}, {entity} (from Site settings → Legal & contact), {rightsholders} (developer and publisher, linked to their company profiles). Keep {entity} rather than typing the name, so the provisional-details warning keeps working.',
              },
            },
            richText('independence', 'Editorial independence', 'The paragraph about who makes editorial decisions.'),
            {
              type: 'row',
              fields: [
                { name: 'sourcingHeading', type: 'text', label: 'Heading — where facts come from', admin: { width: '50%' } },
                { name: 'confidenceHeading', type: 'text', label: 'Heading — where sources disagree', admin: { width: '50%' } },
              ],
            },
            richText('sourcing', 'Where the facts come from', 'Two paragraphs by default.'),
            richText('confidence', 'Where sources disagree', 'What this wiki does when two sources do not agree.'),
            {
              type: 'row',
              fields: [
                { name: 'limitsHeading', type: 'text', label: 'Heading — what we do not claim', admin: { width: '50%' } },
                { name: 'correctionsHeading', type: 'text', label: 'Heading — corrections', admin: { width: '50%' } },
              ],
            },
            richText('limits', 'What we deliberately do not claim to know', ''),
            richText('corrections', 'Corrections', ''),
            {
              name: 'extraSections',
              type: 'array',
              label: 'Extra sections',
              labels: { singular: 'Section', plural: 'Sections' },
              admin: {
                description: 'Appended after Corrections. For anything this wiki needs that the others do not.',
                initCollapsed: true,
              },
              fields: [
                { name: 'heading', type: 'text', required: true },
                { name: 'body', type: 'richText' },
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      label: 'Briefing',
      description:
        'Signed editorial opinion on the wiki home — a read on the game rather than a fact about it. Dawnwalker’s was written into a component; this is the field that lets any wiki have one.',
      fields: [
        {
          name: 'briefing',
          type: 'group',
          label: false,
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              label: 'Show the briefing on the home page',
              admin: {
                description:
                  'Off unless somebody has actually written one. An empty opinion box is worse than no opinion box.',
              },
            },
            {
              name: 'eyebrow',
              type: 'text',
              label: 'Eyebrow',
              admin: {
                condition: (_, s) => Boolean(s?.enabled),
                description:
                  'The label above the takes. It is what marks them as opinion rather than record — keep it doing that however it is worded.',
              },
            },
            { name: 'heading', type: 'text', admin: { condition: (_, s) => Boolean(s?.enabled) } },
            { name: 'lede', type: 'textarea', admin: { condition: (_, s) => Boolean(s?.enabled) } },
            {
              type: 'row',
              admin: { condition: (_, s) => Boolean(s?.enabled) },
              fields: [
                { name: 'endingsHeading', type: 'text', label: 'Endings table heading', admin: { width: '50%' } },
                { name: 'endingsNote', type: 'text', label: 'Endings table note', admin: { width: '50%' } },
              ],
            },
            {
              name: 'takes',
              type: 'array',
              label: 'Takes',
              admin: { condition: (_, s) => Boolean(s?.enabled), initCollapsed: true },
              fields: [
                { name: 'who', type: 'text', label: 'What this is about', required: true },
                { name: 'claim', type: 'text', label: 'The claim', required: true },
                {
                  name: 'reasoning',
                  type: 'textarea',
                  label: 'Why',
                  admin: {
                    description:
                      'This is opinion and is labelled as such on the page. It still has to be reasoning a reader can check against the records.',
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      label: 'Tools',
      description:
        'Only the tools this wiki has switched on use these. A wiki with no run checker can ignore the whole tab.',
      fields: [
        {
          name: 'toolCopy',
          type: 'group',
          label: false,
          fields: [
            {
              type: 'collapsible',
              label: 'Run checker',
              fields: [
                { name: 'runCheckerTitle', type: 'text', label: 'Browser title' },
                { name: 'runCheckerDescription', type: 'textarea', label: 'Meta description' },
                { name: 'runCheckerHeading', type: 'text', label: 'Heading' },
                { name: 'runCheckerLede', type: 'textarea', label: 'Lede' },
                { name: 'runCheckerHowHeading', type: 'text', label: '"How this works" heading' },
                {
                  name: 'runCheckerHowBody',
                  type: 'textarea',
                  label: '"How this works" body',
                  admin: {
                    description:
                      'States the size of the clock in prose. If this wiki’s game has a different budget, this is the sentence that has to say so.',
                  },
                },
                {
                  name: 'runCheckerFloorNote',
                  type: 'textarea',
                  label: 'The "floor, not a verdict" note',
                  admin: {
                    description:
                      'The central editorial claim of the whole tool: a total containing an unknown cost is a floor. Reword it, but do not turn it into a promise the data cannot keep.',
                  },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Build planner',
              fields: [
                { name: 'buildPlannerTitle', type: 'text', label: 'Browser title' },
                { name: 'buildPlannerDescription', type: 'textarea', label: 'Meta description' },
                { name: 'buildPlannerHeading', type: 'text', label: 'Heading' },
                { name: 'buildPlannerLede', type: 'textarea', label: 'Lede' },
              ],
            },
            {
              type: 'collapsible',
              label: 'Completion tracker',
              fields: [
                { name: 'completionTitle', type: 'text', label: 'Browser title' },
                { name: 'completionDescription', type: 'textarea', label: 'Meta description' },
                { name: 'completionHeading', type: 'text', label: 'Heading' },
                { name: 'completionLede', type: 'textarea', label: 'Lede' },
              ],
            },
            {
              type: 'collapsible',
              label: 'Your run',
              fields: [
                { name: 'runTitle', type: 'text', label: 'Browser title' },
                { name: 'runDescription', type: 'textarea', label: 'Meta description' },
                { name: 'runHeading', type: 'text', label: 'Heading' },
                { name: 'runLede', type: 'textarea', label: 'Lede' },
              ],
            },
          ],
        },
      ],
    },
  ],
})
