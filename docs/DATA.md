# Where the data comes from, and where to get more

The single biggest constraint on this project: **nobody working on it has the
game.** Every fact currently on the site was compiled from public sources on
13 September 2026 and has not been verified against *The Blood of Dawnwalker*
itself. That is why every record carries a confidence rating and citations.

## What is seeded now

| Area | State |
| --- | --- |
| 7 endings and their gates | Good — multiple sources agree |
| 10 regions | Good |
| 3 courts, activity counts (14/12/15) | Good |
| Ally questlines (Lacra, Crake) | Names and order only |
| 3 skill trees, 3 ultimate perks | Partial |
| The clock: 480 segments, 8+8 per day | Good — this is the best-sourced fact we have |
| **Per-quest segment costs** | **Missing, deliberately** |
| Court Activities, individually | Missing — 41 to document |
| Items beyond a couple of legendaries | Missing |

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
