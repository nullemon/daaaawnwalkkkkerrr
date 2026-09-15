# A game-wiki network: design

How to turn the Dawnwalker site into a Fextralife-shaped network — one brand, one
admin, many games — without rebuilding what already works.

Written 15 September 2026. **Phases 1 to 4 are built.** The plan below is kept
because the reasoning still applies; see "What was actually built" at the end
for where reality differs from it, and `docs/DEPLOY.md` for putting it live.

---

## What Fextralife actually is

Worth being accurate, because the obvious assumption is wrong and it changes the
whole decision.

| Part | Software |
| --- | --- |
| `fextralife.com` — news, reviews, guides, forums | WordPress |
| `*.wiki.fextralife.com` — the game wikis | **MediaWiki 1.43.1** |

Two separate systems, because neither does both jobs. WordPress is a blog engine;
MediaWiki is a crowd-edited encyclopedia. Fextralife runs one of each and links
them together.

Their network looks like this:

- **A hub** at the apex domain: news, reviews, guides, forums, a directory of
  wikis, newsletter, premium tier, merch.
- **N game wikis**, one per subdomain, wildly uneven in size — Elden Ring at
  4.6K pages, Onimusha at 153. The long tail is the point: a small wiki costs
  almost nothing to host and still catches searches.
- **Shared audience**: every wiki links back to the hub and sideways to related
  wikis (The Forest → Sons of the Forest).

The model is not "one big site". It is a **portfolio of small sites sharing a
brand, an account system and an ad stack.**

---

## Why not WordPress, and why not MediaWiki

Our site is neither a blog nor a wiki. It is a **database-driven tool**.

The thing that makes it worth visiting over the six competitors that already own
the obvious domains is `reachability.ts` — a prerequisite-graph solver with 64
unit tests behind it — plus a build planner that enforces one-ultimate-per-tree,
a confidence model, and an importer that refuses any record without a source.

- **In WordPress** that logic becomes PHP rewritten from scratch, with quests and
  items as custom post types and relationships hand-rolled. Weeks of work to
  arrive somewhere worse at the one thing we are better at.
- **In MediaWiki** it is worse still. MediaWiki is prose pages edited by
  volunteers. Structured records feeding a solver is the opposite of its grain.

Copy Fextralife's **shape**, not its stack.

---

## Recommended architecture

Keep Payload + Next.js. Make it multi-tenant. Everything already built comes
along: the filterable `DataTable`, the SEO composer, sitemap and both feeds, the
image pipeline, the confidence model, the sourced-data importer, the run checker.

### Routing: paths first, subdomains when a game earns it

Fextralife uses subdomains because their wikis are genuinely separate MediaWiki
installs. We have no such constraint, and subdomains have a real cost: **each one
builds search authority separately from zero.**

So:

```
yournetwork.com/                    hub — directory, news, cross-game guides
yournetwork.com/dawnwalker/         a game
yournetwork.com/dawnwalker/quests/night-terrors
```

One domain accumulating authority across every game is materially better for a
new network than fifteen subdomains each starting cold.

Build subdomain support anyway — Next.js middleware rewriting
`dawnwalker.yournetwork.com/*` to `/dawnwalker/*` is about thirty lines — so a
game that outgrows the network can be lifted out later. Decide per game; default
to paths.

### Tenancy

A `games` collection, and a `game` relationship on every content collection.

```ts
// src/collections/Games.ts
{
  slug: 'games',
  fields: [
    { name: 'title' },              // The Blood of Dawnwalker
    slugField(),                    // dawnwalker
    { name: 'status' },             // planned | building | live | archived
    { name: 'publisher' },
    { name: 'releaseDate' },
    { name: 'subdomain' },          // optional; empty means serve under /slug
    { name: 'theme' },              // accent colour, hero art, logo
    { name: 'features' },           // which tools this game switches on
    { name: 'relatedGames' },       // The Forest -> Sons of the Forest
  ]
}
```

Every query filters by the current game. Three mechanisms do the work:

1. **Middleware** resolves host or first path segment to a game slug and sets it
   on the request.
2. **A scoped `getAll`** — one wrapper, so no page can forget the filter. This
   is the single most important piece: a missed filter leaks one game's content
   into another, and it will not be obvious.
3. **Access control** scopes editors to the games they are assigned, so a
   contributor hired for one game cannot edit another.

### The content model — the real design decision

Dawnwalker's collections are specific: quests, perks, endings, courts, court
activities. That vocabulary does not survive contact with a second game.

Do **not** create a collection per game. Fifteen games at eight collections each
is an unusable admin.

Instead, three tiers:

**Tier 1 — universal collections.** Almost every game has these, under names
most games recognise:

| Collection | Covers |
| --- | --- |
| `entries` | items, weapons, armour, consumables — anything you carry |
| `characters` | NPCs, bosses, party members |
| `locations` | regions, areas, dungeons |
| `creatures` | enemies, bestiary |
| `missions` | quests, contracts, jobs, chapters |
| `abilities` | perks, skills, spells, talents |
| `guides` | editorial |
| `mechanics` | systems explainers |

Each carries `game`, a `kind` (free text per game — "Court Activity", "Contract",
"Shrine"), plus shared fields: title, slug, summary, body, image, sources,
confidence, SEO.

**Tier 2 — per-game attributes.** A flexible key/value array on every record for
what one game needs and others do not: *Segment cost: 3*, *Weapon scaling: B*,
*Carry limit: 10*. Rendered as the fact panel. No schema change to add a game.

**Tier 3 — bespoke tools.** When a game genuinely needs its own solver, it gets
a module switched on by the `features` field. The Dawnwalker run checker is
exactly this: one game's tool, not the network's.

That tiering is the answer to the question I asked earlier. Most games do not
have a 480-segment budget, so the run checker is Tier 3 — but the *pattern* of
"a tool nobody else has" is what will differentiate each wiki, and the framework
should make adding one cheap rather than assume every game gets the same.

### What the hub is for

Not an afterthought. The hub is what makes this a network rather than fifteen
unrelated sites:

- **Game directory** with page counts, as Fextralife does — visible scale is
  persuasive.
- **Cross-game editorial**: news, reviews, "best RPGs with time limits".
- **One account** across every game: a saved run on Dawnwalker and a saved build
  elsewhere, under one login. We already have `players` and `RunProvider`.
- **Cross-linking**: every game page links to the hub; related games link
  sideways. This is how a new wiki gets its first traffic.

---

## Build order

Roughly a week of focused work to the point where adding a game is content entry
rather than engineering.

**Phase 1 — tenancy (1–2 days).** Games collection; `game` on every collection;
scoped query wrapper; middleware; per-game access control. Dawnwalker becomes
game one and must come through unchanged — that is the test.

**Phase 2 — generalise the model (1–2 days).** Rename collections to the neutral
vocabulary, add `kind` and the attributes array, migrate Dawnwalker's data onto
it. Keep the run checker pointed at the same records via Tier 3.

**Phase 3 — the hub (1–2 days).** Directory, hub home, cross-game search,
network navigation, per-game theming.

**Phase 4 — per-game SEO (half a day).** Sitemap per game plus a network index,
feeds per game, canonicals, IndexNow across all hosts. Mostly parameterising
what exists.

**Phase 5 — game two.** The real test. If it is a week of engineering rather than
a day of content, phases 1–3 were wrong and it is worth fixing then.

---

## Decisions to make before Phase 1

1. **Network name and domain.** Everything canonical flows from it.
2. **Paths or subdomains** as the default. Recommendation above: paths.
3. **Which game is number two**, and how much it differs from Dawnwalker. Pick
   something structurally *unlike* it — a game with no time limit — so the
   generalisation is tested honestly rather than flattered.
4. **Community features.** Fextralife has forums and comments. Both are
   moderation load. Worth deferring until traffic justifies staff.

---

## What carries over unchanged

Worth listing, because it is most of the value and none of it needs rewriting:

- `reachability.ts` and its 64 tests
- `DataTable` — filters, facets, sorting, unknown-sorts-last
- `seo.ts` — composed titles and descriptions for every record
- Sitemap, RSS, Atom, robots, IndexNow
- The image pipeline: fetch, match, attach, credit
- `FactPanel`, `RelatedList`, `Byline`, `EntityImage`
- The confidence model and the sourced-data importer
- Payload admin, auth, drafts, access control
- The check-css audit and the whole test suite

The editorial rules carry over too, and they matter more than the code: never
invent a fact, unknown is not zero, record conflicts rather than resolving them,
write original prose. Those are what make a small wiki worth reading when a
larger one exists.

---

## Decisions taken — 15 September 2026

The four questions at the top of "Decisions to make" have been answered. Recording
them here with their costs, because two of them go against the recommendation
above and the reasoning should survive the people who made it.

### 1. Subdomains, not paths

`dawnwalker.sitename.com`, not `sitename.com/dawnwalker`.

This overrules the recommendation in "Routing" above. The cost is real and is
accepted: **each subdomain accumulates search authority from zero**, so game
seven does not inherit anything from games one through six. Google treats a
subdomain as a separate site for most purposes.

What is bought with it:

- Each game reads as its own wiki, which is what the audience expects — every
  competitor in this space is shaped that way, Fextralife included.
- A game can be sold, moved or shut down without touching the others.
- Internal links need no game prefix. On `dawnwalker.sitename.com` a link to
  `/quests/night-terrors` is already correct, so the several hundred `<Link>`
  hrefs already written stay exactly as they are. Under paths, every one of
  them would have needed rewriting to carry the game.

That last point turned out to be the deciding practical one rather than the
branding: the path scheme is better for SEO and worse for everything else, and
the SEO gap narrows once the hub is linking every game from a page that does
accumulate authority.

The internal route structure is still path-based — `/[game]/quests/...` — and
`proxy.ts` maps host to prefix. So the decision is reversible: dropping the
proxy and linking with prefixes switches the whole network to paths.

### 2. The domain is not bought yet

Nothing may hardcode it. The origin already comes from `NEXT_PUBLIC_SITE_URL`
with Site Settings as the fallback, and per-game hosts derive from it, so
choosing the name later is an environment variable and a DNS record.

Until then, development uses `*.localhost` subdomains, which Chrome and Firefox
resolve to 127.0.0.1 without a hosts-file entry: `dawnwalker.localhost:3000`.

### 3. Comments, with nothing auto-published

Fextralife has comments; they are also most of its moderation burden. So:

- **Every comment is held.** No comment reaches a page until an editor approves
  it in the admin. There is no trust level that bypasses this and no timer that
  releases it.
- **Links are stripped, not just flagged.** A comment containing a URL is the
  overwhelming majority of spam. The filter runs before storage.
- The moderation queue is a first-class admin view, because a queue nobody can
  work through is the same as no comments at all.

Details in "Comments" below.

### 4. The first six games

The brief was games released in the last two to three months or releasing in
the next two to three months — a window of roughly June to December 2026.
Every date below was read from the game's own Steam store page rather than from
a news article, and every one of these six is inside the window.

| Game | Released | Publisher | Why it is here |
| --- | --- | --- | --- |
| Star Wars Zero Company | 27 Aug 2026 | Electronic Arts | Turn-based tactics. Squads, classes, missions — a shape nothing like Dawnwalker, which is the point |
| Resonance: A Plague Tale Legacy | 27 Aug 2026 | Focus Entertainment | Linear narrative adventure. Chapters and collectibles, a deliberately thin wiki |
| Onimusha: Way of the Sword | 3 Sep 2026 | Capcom | Action RPG, franchise revival. Weapons, souls, bosses — thick wiki |
| Control Resonant | 24 Sep 2026 | Remedy | Documents, abilities, altered items. Collectible-dense |
| Gears of War: E-Day | 6 Oct 2026 | Xbox Game Studios | Campaign shooter. Big brand, moderate wiki surface |
| Phantom Blade Zero | 28 Oct 2026 | S-GAME | Action RPG with heavy build variety. The best straight wiki candidate of the six |

Three are already out and three are not, which is deliberate: the ones already
released can be filled with real data now, and the three ahead of release are
where a new site can actually win, because the established wikis start from
nothing on launch day too.

The portfolio is also mixed on purpose. Two thick RPGs, one tactics game, one
shooter, two linear narrative games. If the three-tier content model survives
all six it is genuinely general; if it only fits the RPGs, that is worth
discovering on game two rather than game twelve.

**GTA 6 is not on the list.** It is in the window, it would out-traffic all six
combined, and every established wiki has had a team on it for a year. A new
network does not win that one, and losing it publicly is worse than not
entering. Revisit when the network has authority to spend.

**Marvel's Wolverine** (15 Sep 2026) was the strongest candidate left out. It is
PlayStation-exclusive, so it has no Steam page to verify against and no PC
audience, which is most of this kind of search traffic.

### What this changes above

The "Routing" section recommends paths. That recommendation was not taken.
Treat this section as current where the two disagree.


---

## What was actually built

Phases 1 to 4 landed on 15 September 2026, in two commits. What follows is the
difference between the plan above and the thing that exists.

### Done

**Tenancy.** A `games` collection and a `game` relationship on all thirteen
content collections, applied by one `scopedToGame()` wrapper so the pieces that
must happen together cannot be applied by halves — the field, dropping the
global unique on `slug`, the compound `(game, slug)` index that replaces it,
and per-game write access.

The filter lives in `getAll`/`getBySlug` and nowhere else, and the type
signature makes omitting it a compile error. That guard did not work on the
first attempt: every call site passed the document type explicitly, which made
TypeScript fall back to the default for the collection generic and collapsed
the requirement to "optional" at every site at once. Inferring the document
type from the slug fixed it and removed 99 redundant annotations.

**Routing.** `[game]` internally, subdomains publicly, `proxy.ts` mapping one
to the other and 308ing the apex path form onto the game's host so nothing is
reachable at two URLs.

**The hub.** Directory with live page counts, latest writing across all wikis,
contributor index, the legal pages, and the house rules stated plainly.

**Per-host SEO.** `robots.txt` and `sitemap.xml` answer for whichever host
asked; feeds and search index are per game; canonicals point at the game's own
origin. IndexNow submits per host.

**Comments.** Nothing auto-publishes, links removed before storage, 35 tests
covering the obfuscations. Details in `collections/Comments.ts`.

**The admin.** A dashboard showing the queues and every wiki's real record
count; editors assignable to particular games; groups renamed off Dawnwalker's
vocabulary.

### Not done, deliberately

**Phase 2's neutral vocabulary.** The plan proposed renaming the collections to
`entries`, `missions`, `locations` and so on, with a `kind` field and an
attributes array. That has not been done, and should not be until there is a
second game with real content in it.

The reason is that the rename is only worth its cost if it is informed. Six of
the seven wikis are empty; renaming `court-activities` to `missions` now would
be guessing at what Onimusha and Gears of War actually need from the schema,
and a guess baked into a migration is harder to undo than a rename done later
with evidence. The section navigation already derives from what a game has, so
an empty collection costs a game nothing today.

**Per-game section copy.** Every wiki's Regions index currently says "Ten
regions across roughly ten square kilometres", which is Dawnwalker's. It is
invisible while the other six have no regions, and it is the first thing to fix
when one of them does.

**Cross-game search on the hub.** `/wikis` lists seven games on one screen,
which is a better answer at this size than a search box. Worth revisiting at
fifteen.

### The test the plan set itself

> **Phase 5 — game two.** The real test. If it is a week of engineering rather
> than a day of content, phases 1–3 were wrong.

Adding a wiki is now: create a row in the admin, write content. No deploy, no
DNS change, no code. Six were added that way during the build. Whether the
*content model* survives a game unlike Dawnwalker is still untested, and that
is the honest open question — see "Not done, deliberately" above.
