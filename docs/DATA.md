# Where the data comes from, and where to get more

The single biggest constraint on this project: **nobody working on it has the
game.** Every fact currently on the site was compiled from public sources on
13 September 2026 and has not been verified against *The Blood of Dawnwalker*
itself. That is why every record carries a confidence rating and citations.

## What is in the database now

Researched by eight parallel agents against the contract in
`RESEARCH-CONTRACT.md`, then run through `src/seed/import.ts`, which rejects
any record without a citable source URL.

| Area | Records | State |
| --- | --- | --- |
| Items (weapons, armour, rings, manuals, recipes, ingredients) | 80 | Good on legendaries; common/rare tiers missing |
| Perks | 40 | All 9 ultimates found |
| Characters | 53 | 20 substantive, 33 name-only index entries marked low confidence |
| Court Activities | 41 | Ambrus 14/14, Bakir 13 (one too many), Xanthe 14/15 |
| Enemies and bosses | 16 | Of a reported 28 in the bestiary |
| Builds | 9 | — |
| Guides | 11 | ~600 words each, original prose |
| Regions | 10 | 3 rich, 4 solid, 3 thin |
| Quests | 93 | 30 side, 26 ally, 23 repeatable, 14 prologue |
| Endings | 7 | Requirements and outcomes separated |
| **Quests with a sourced segment cost** | **15 of 93** | First real cost data — the rest stay blank |

### Live conflicts a human should settle

- **"The Slits" vs "The Silts"** — region lists use one spelling, every page
  carrying real data uses the other. We kept `the-slits` and flagged it.
- **Segment costs that disagree** — `buried-past` is reported as 9–12, 16 and
  20 segments by three sources; `of-wolves-and-men` as 0 and as 10. Both are
  stored as wide min/max ranges with the conflict noted, not averaged.
- **Crake romanceable** — multiple launch guides list him as the third romance
  alongside Anca and Lacra; our earlier record said otherwise. Research won the
  upsert. Worth confirming.
- **Bakir's court count** — 13 found against a reported 12. Two entries
  (`Catalin's Tutor`, `A Mother's Plea`) are described as court activities but
  are structurally derivative. Neither was dropped to force the number.
- **Xanthe's 15th activity** — never named in any source found.
- **Ultimate exclusivity** — guides split between one ultimate *per tree* and
  one *per build*. Both readings are stated on each ultimate's page.

### Settled this round

- **Lacra's chain is six quests, not five.** The missing link is
  *The Night of Horrors*, which sits between *Our Rotten Roots* and *Midnight
  Reckoning* and must be done first or the romance is lost. That resolves the
  conflict this file previously recorded as open.
- **The third romance is Anca**, a herbalist from Coen's village, whose arc
  opens during the prologue.
- **Two more ally chains exist** beyond Lacra and Crake — Anca's and Vicho's.
- **There are no main quests after the prologue.** The researcher found zero
  and recorded zero rather than inventing a spine.

### Research limits hit this round

Every agent reported the same two ceilings, and they cap what more research can
achieve without changes:

1. **WebFetch is egress-blocked for every games-media domain** (game8,
   fextralife, powerpyx, gamespot, gamesradar and the rest). All data came from
   search-result summaries; no agent could open a single source page. The full
   item and perk tables live behind that block.
2. **The session-wide WebSearch budget (200 calls) was exhausted**, shared
   across the eight agents. Each completed around 16 searches of the ~20
   planned.

Raising the search budget, or allowlisting the wiki domains for fetching, is
the cheapest way to close the remaining gaps.

## Known contradictions in the public record

These are the reason the confidence system exists:

- **Quest count.** Published totals range from 128 to 233 depending on whether
  Court Activities and contracts are counted as quests.
- **Lacra's questline.** Described as both five and six quests, with the finale
  named *Midnight Reckoning* on some sites and *The Night of Horrors* on others.
- **The duel threshold.** "Roughly 75% of a vassal's activities" is widely
  repeated but we have not found it stated by the developer.

Where sources conflict, say so on the page. Do not pick a winner silently.

## Where to get better data, in order of value

### 1. Buy the game (~$70)

By far the highest-value option, and the only one that produces data nobody
else has. It converts the accuracy problem from permanent to temporary.

With the game you can record the one thing no site publishes reliably: the
actual segment cost of each quest step. Watch the hourglass warning before
committing, note the cost, move on. A few hours of deliberate play produces
data the whole site is currently missing — and it is the data the run checker
needs to stop reporting floors.

### 2. Datamine the installed game files

With the game installed, quest tables, item stats and skill data usually sit in
extractable archives. Community tools for Unreal-engine titles appear within
weeks of release; check Nexus Mods and the game's modding Discord for an
extractor. Output a JSON dump and the seed script can ingest it directly.

This is how the large sites fill 1,700-item databases. It is not available
without owning the game.

### 3. Watch complete playthroughs

Long-form blind playthroughs on YouTube show the journal, the day counter and
the hourglass prompts on screen. Slow, but it is a legitimate way to capture
quest order, phase restrictions and time costs without owning the game. Cite
the video and timestamp.

### 4. The community

- r/BloodOfDawnwalker and the official Discord — good for resolving specific
  contradictions by asking people mid-run.
- The site's own `/corrections` form — a review queue is already wired up.
  This is the cheapest source of corrections once there is any traffic.

### 5. Official material

Bandai Namco press kits, patch notes and the official site. Thin, but
authoritative, and worth citing at high confidence where it covers something.

## What not to do

**Do not bulk-copy another site's database.** Individual facts are not
copyrightable and compiling them is fine — that is what this site does. But:

- Copying prose or reproducing a site's tables verbatim is infringement.
- In the EU and UK, the *sui generis* database right protects substantial
  extraction of even purely factual databases. Scraping a competitor's quest
  table wholesale is actionable there regardless of the facts being facts.
- It is also strategically pointless: the differentiator is being the accurate,
  well-sourced one, and you cannot be that by mirroring someone else's errors.

The working rule: **two independent sources per figure, all prose original,
every source cited, confidence rated honestly.**

## Game assets

Screenshots and art belong to Bandai Namco / Rebel Wolves. Fan-site use is
tolerated, not licensed. Keep usage minimal, credit them in the media record,
and keep official logos out of the site's own branding.

## Collecting data yourself, from the browser

`tools/extract.js` is a console tool. Open DevTools on a page with a table or
a list of links, paste the file's contents in, pick the table, map its columns
onto our fields, and download JSON that drops into `src/seed/raw/` and runs
through `pnpm import`.

It fills in the page URL and today's date as the source on every record, since
the importer rejects anything uncited. It works one page at a time and does
not crawl or collect images.

Where the line is: compiling **facts** — an item's name, a quest's segment
cost, which region something is in — is fine, and it is what this whole
project does. Two things are not. Copying someone's **sentences** is
infringement, so rewrite every description in your own words. And lifting a
**substantial part of their database** is separately actionable in the EU and
UK under the sui generis database right, which protects the collection even
when every fact in it is free. Taking a page of figures to cross-check against
another source is ordinary research; mirroring a competitor's whole table is
not, and it also defeats the point — the site's advantage is being the
accurate one, which you cannot be by inheriting someone else's errors.
