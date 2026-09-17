# Editable copy

Where every reader-visible sentence on this network lives, and why it lives
there rather than somewhere else.

The rule is one line: **anything a person would want to reword is a field, and
every one of those fields is optional.** A blank field falls back to the
sentence that shipped, so an empty database renders the site exactly as the
code does. Nothing here can be broken by not filling it in.

## Where a sentence lives

| What | Where | Admin |
|---|---|---|
| A record's own words — a quest's summary, a guide's body | the record | the collection |
| A wiki's section headings, ledes, callouts, guide groups | `sectionCopy`, `callouts`, `guideGroups` on the Game | Games → *the wiki* → Section copy |
| A wiki's home page, about page, briefing, tool pages | `homeCopy`, `aboutPage`, `briefing`, `toolCopy` on the Game | Games → *the wiki* → those tabs |
| The hub's own pages, and the notes printed on every page | Site settings | Admin → Site settings |
| Privacy, terms, contact | the `legal-pages` global | Admin → Legal pages |
| The companies host | the `companies-site` global | Network → Companies site |
| Buttons, empty states, form hints, enum labels | the `ui-strings` global | Admin → Interface text |

Four things stay in code deliberately. They are listed at the bottom.

## The three layers

`src/lib/section-copy.ts` is the worked example, and the order is the same
everywhere:

1. **What an editor wrote.** A `sectionCopy` row on the Game.
2. **The specific copy**, keyed to the one game it was written about —
   Dawnwalker, because for a while Dawnwalker was the only wiki with records.
3. **A sentence derived from the records**: the section, the game's name, and
   the count of what is actually in it.

Layer 3 is deliberately plain. A thin true sentence is worth more than a rich
one describing somebody else's game, which is what layer 2 was doing on seven
wikis before any of this existed — the Regions index on the Gears of War wiki
headed "Vale Sangora", in the `<title>` and the meta description too.

## Tokens

An editable sentence never contains a number that a record could change.

    {count}  how many records are in the section
    {detail} the section's second number — portraits, sourced segment costs
    {game}   the wiki's short title
    {entity} the publishing entity, from Site settings → Legal & contact

`src/lib/copy.ts` does the substitution. Two rules there are load-bearing:

- **Blank means "use the built-in"**, not "print nothing". Payload hands back
  `''`, `null` or `undefined` depending on how a field was emptied, and
  treating any of them as an instruction would let a half-filled record delete
  a page's heading. The only way to show nothing is an explicit switch — the
  `hide` checkbox on a callout.
- **An unknown token stays visible.** `{gmae}` on the page is a typo somebody
  fixes in a minute; a silently missing number is a wrong sentence nobody
  notices.

Where a token has to render as an element — `{rightsholders}` on a wiki's about
page is that game's developer and publisher, each an anchor onto the companies
host — `splitTokens()` returns the parts and the call site builds the nodes.
**Nothing editable ever reaches the DOM as markup.**

The same token name means something else on `/terms`, and the difference is
deliberate: there it is every developer and publisher the network covers, all
fifteen of them, as one plain-text list. The affiliation disclaimer names them
rather than gesturing at them, and fifteen anchors inside a legal sentence is a
worse sentence. Two renderings of one token is a thing to know about, not a
thing to tidy — this line said "two company names linked to their profiles"
about both of them, which was true of one. An admin-editable string rendered with
`dangerouslySetInnerHTML` is a stored-XSS hole waiting for the first editor
account that should not have had one; the licence-attribution template has
refused to be one since it was written, and that rule does not get an
exception for a `<b>`.

## Callouts are three-way, not two

    no row       → the built-in note, with its inline links and computed numbers
    row, hidden  → nothing at all
    row, filled  → the editor's heading and body

The middle case is the reason `src/components/Callout.tsx` exists. Most of
these boxes state a mechanic only Dawnwalker has — "travel is free" describes
its segment clock — and the right answer for the other seven wikis is an empty
space, not a reworded sentence. A plain override could not say that, which is
why the first fix wrapped each callout in `game?.slug === 'dawnwalker'`: right
for one wiki, and nothing anybody could put there for the rest.

`builtIn={false}` is the related case: the note points at a tool this wiki has
not switched on, so the built-in must not render and an editor's may.

## Interface text is a keyed table

There are a few hundred button labels and empty states. Three hundred named
fields would be three hundred columns and an unusable edit screen, so
`ui-strings` holds override rows keyed against `src/lib/ui-registry.ts`, which
is the single list of every string the interface can say. A call site asks for
a key and gets the override, then the registry default, then — if neither has
it — the key itself, visibly.

Client components read the same maps through `UiStringsProvider`. The registry
has no imports, so a component used outside the provider still says the right
thing; that matters because these components also render in tests and in the
admin's preview, neither of which has a layout above them.

## Seeding

    pnpm seed:copy

Writes the wording that shipped into the fields that can change it, so an
editor opens a real sentence rather than an empty box. It **never overwrites**
anything already filled in, which is what lets it sit in `pnpm db:reset` next
to the other passes without quietly reverting somebody's work.

Counts come back as tokens rather than as the number they rendered as: the
built-in copy is generated with sentinel counts and the sentinels are swapped
for `{count}` and `{detail}` on the way in.

Two things are deliberately not seeded. **Callouts**, because a seeded row
*shows*, which would put Dawnwalker's notes back on all eight wikis, and
because their built-in bodies carry inline links a plain-text field cannot.
**Guide groups other than Dawnwalker's**, because inventing groups for a wiki
nobody has read is writing content rather than seeding it.

## What stays in code, and why

1. **`src/components/LegalGap.tsx`** — the "this page is not ready to publish"
   warning and the `[FIELD — NOT YET SET]` markers. They exist *because* the
   editable values are untrustworthy. A warning the person being warned can
   delete is not a warning.
2. **`src/lib/legal.ts`** — the placeholder-detection patterns. Detection
   logic, not copy.
3. **`src/lib/credit.ts`** — "Unofficial fan project", "No affiliation is
   claimed", "Facts are compiled from public sources and have not been
   verified against the game." The whole value of those three is that they
   appear identically on every page of every wiki and cannot be edited away
   from one of them. The single `SiteSettings.footerNote` override that
   already exists is the exception; there is not a second one.
4. **`src/lib/credit.ts:33`**, the no-named-holder fallback — deliberately
   un-editable so nobody can replace an honest "we do not know whose this is"
   with a guess.
5. **The placeholder-contributor notice** on `/authors/[slug]`, shown while an
   author row has `provisional` ticked. Same reasoning as 1: it exists because
   the record it sits on is scaffolding, and a disclosure the person being
   disclosed about can reword away is not a disclosure. It is also the *only*
   place the flag renders — the byline on a guide prints the name either way,
   deliberately, and anything that says otherwise is stale. Thirty-six
   placeholders carried 394 bylines with four comments claiming a notice that
   no renderer had ever printed.
