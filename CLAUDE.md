# Game wiki network — working notes

A network of game wikis sharing one admin, one account system and one set of
editorial rules. Next.js 16 + Payload CMS 3 on libSQL. Every public page
prerenders to static HTML; `/admin` is a full CMS.

Eight wikis today, 1,702 prerendered pages. *The Blood of Dawnwalker* is the
first and still the largest — 440 of the 1,467 records — and its 480-segment
run planner is the model for what each wiki is meant to have: one tool nobody
else has.

The other seven are built from two sourced pipelines and nothing else:

- **Store pages** (`fetch:games`) — release, editions, system requirements,
  declared features, languages, and the achievement list with each one's
  global unlock rate once the game ships.
- **Community wikis** (`fetch:entities`) — characters, weapons, bosses and
  locations, taken as infobox *facts* with summaries composed by us. Only
  categories naming the specific game, because a franchise wiki covers eight
  of them and importing the wrong one is the hardest error to spot.

Four of the eight cover games that are not out yet, so they are thin on
purpose: there is no item list for a game nobody has played. `pnpm refresh`
the week each launches is what fills them, and it is the plan rather than an
afterthought. No walkthroughs written from trailers.

Each wiki is a subdomain (`dawnwalker.example.com`). Readers never see a game
prefix; `src/proxy.ts` maps host to the internal `/[game]/…` route. See
`docs/NETWORK.md` for the design and the decisions behind it.

## Commands

```bash
pnpm install      # NOT npm — see gotchas
pnpm dev          # http://dawnwalker.localhost:3000 — see 'Local dev' below
pnpm build        # prerenders ~1,700 pages across eight wikis
pnpm test         # unit tests (106)
pnpm seed         # hand-written seed content, idempotent on slug
pnpm ingest       # ingest researched JSON from src/seed/raw/
pnpm db:reset     # delete the database and rebuild it from seed + raw
pnpm clean        # delete .next (devsafe does this, then starts dev)
pnpm assets       # attach images from assets/<collection>/<slug>.<ext>
pnpm verify       # every content record belongs to a game (see below)
pnpm remote <cmd> # content operations against a RUNNING site over its API
pnpm refresh      # re-read every store page and wiki, reseed, rebuild icons
pnpm check:launch # the launch checklist — NOT `pnpm audit`, that is pnpm's own
pnpm fetch:games  # just the store pages
pnpm fetch:entities  # just the community wikis
pnpm seed:games   # store-page facts -> mechanics pages and achievements
pnpm seed:entities   # harvested entities -> characters, items, enemies…
pnpm seed:art     # attach game key art and achievement icons
pnpm make:avatars # redraw contributor monograms
pnpm seed:avatars # attach them
pnpm assets:match <dir> [--apply]   # match extracted game files to records
pnpm generate:types                 # after any collection change
```

## The rules that matter

**Never invent a fact.** This site's entire pitch is that it is the accurate,
well-sourced one. Every record carries a confidence rating and citations, and
`src/seed/import.ts` rejects any record without a source URL. If a source does
not state something, leave the field empty — a gap is fine, a fabricated
figure poisons the whole project.

**Unknown is not zero.** A quest with no published segment cost has
`time.known: false`, and the run checker reports totals containing it as a
floor rather than a figure. The same applies to `perks.timeCostSegments`,
which deliberately has no default — a default silently turns "nobody
published this" into a number the site cannot stand behind.

**Record source conflicts, do not resolve them.** Where guides disagree — the
Slits/Silts spelling, Bakir's activity count — the conflict goes in the copy
and in `docs/DATA.md`, not into a coin flip. See those files for the live list.

**Write original prose.** Facts are free to compile; sentences are not. Never
paste from another site.

**Every content record belongs to a game.** Thirteen collections carry a
`game` relationship, and every public read filters on it. A record without one
does not error — it simply never appears on any page, anywhere, with nothing in
any log. `pnpm verify` is the check; run it after any import.

The filter lives in `getAll`/`getBySlug` and nowhere else, and the types make
omitting it a compile error. `getAllAcrossGames` is the deliberate way to ask
for every game at once, and there are exactly two legitimate callers: a
contributor's profile and the hub.

## Architecture

- `src/lib/reachability.ts` — the run checker. Deliberately free of Payload
  types so it can be unit-tested without a database and shipped to the browser.
- `src/lib/segments.ts` — the clock. 30 days × 16 segments = 480.
- `src/collections/` — Payload schema. Quest `prereqs`/`excludes` are the edges
  of the graph the checker walks, so they are load-bearing, not descriptive.
- Endings compute `minSegments` and `latestStart` from their quest chain rather
  than storing them, so they cannot drift out of sync.
- `src/seed/` — `data.ts` hand-written, `raw/*.json` researched, `import.ts`
  validates and ingests, `assets.ts` and `match-assets.ts` handle images.

## Access control

Two auth collections: `users` are editors and own the admin; `players` are
readers with an optional account that syncs their run. **Payload's default
write access is any authenticated user**, so every content collection states
its rules explicitly via `isEditor` in `src/fields/shared.ts`. A new collection
that inherits the default would let any reader who signs up edit content.

## Gotchas that have already bitten

- **Use pnpm.** npm hits an arborist bug (`Cannot read properties of null
  (reading 'edgesOut')`) on this dependency tree and cannot install it.
- **Do not name a script after a pnpm built-in.** `pnpm ingest` was once
  `pnpm import`, which silently ran pnpm's own lockfile-import command instead
  and failed with `ERR_PNPM_LOCKFILE_NOT_FOUND`. It happened a second time with
  `pnpm audit`, which printed a CVE report for the dependency tree while the
  launch checklist it was meant to run never executed — and the report looks
  enough like output that it takes a moment to notice. It is `check:launch`
  now. `pnpm run <name>` always reaches the script, but the plain form is what
  people type.
- **Font variables belong on `<html>`, not `<body>`.** The tokens that
  reference them are declared on `:root`; a custom property referencing an
  undefined custom property computes to guaranteed-invalid, which silently
  fell back every font on the site to Times New Roman for several commits.
- **Schema changes need the database rebuilt.** Production builds run with
  `push: false`, so a new field breaks the build with a missing-column error.
  `pnpm db:reset` — the database is fully reproducible from seed plus
  `src/seed/raw/`, by design.
- **`db:reset` drops attached images, because they are not in the seed.**
  Uploads live in the database and in `media/`, not in `src/seed/raw/`, so a
  rebuild silently takes every record back to its fallback icon — the pages
  still render, which is exactly why nobody notices. `pnpm db:reset` carries
  `pnpm assets` in the chain to put them back — after the content passes and
  before the art ones, not at the end. That step no-ops cleanly on a machine
  with no `assets/` folder, so it is safe there. If portraits vanish,
  this is what happened, and `pnpm assets` alone fixes it.
- **Scripts must run on Windows too.** `pnpm devsafe` shipped as `rm -rf .next`
  and died with `'rm' is not recognized` on the machine this is actually
  developed on. Anything that touches the filesystem from `package.json` goes
  through `node -e` and `fs`, never a shell builtin. `&&` is fine — pnpm runs
  scripts through cmd.exe, which accepts it; it is PowerShell 5.1 that does not.
- **Windows will not delete a file another process has open.** `pnpm db:reset`
  fails with `EPERM` while a dev server is running, and node's `rmSync` retry
  options are silently ignored unless `recursive` is set — so the raw one-liner
  this started as gave a stack trace that said nothing about the cause. The
  work is in `tools/reset-db.mjs`, which retries, clears a read-only attribute,
  and names the likely culprit when it still fails.
- **Two generated files show up as uncommitted work.** `src/payload-types.ts`
  is rewritten by Payload on a schema change and sometimes just on `pnpm dev`;
  `next-env.d.ts` points at `.next/dev/types/` after `next dev` and
  `.next/types/` after `next build`, so it flips every time you switch. Neither
  is yours to merge — `git checkout -- <file>` and move on. The committed
  `next-env.d.ts` is the build form, which is what CI needs. `.gitattributes`
  pins line endings to LF so this stops being a whole-file diff on Windows.
- **Deleting a CSS block fails silently.** Removing the old header section
  took `.page`, `.prose`, `.lede`, `.icon-btn` and `.run-badge` with it. Every
  page lost its max width and ran to the edge, the theme toggle lost its
  button, and the run readout rendered as loose wrapping words down the rail —
  and nothing errored, no test failed. `pnpm check:css` compares every
  rendered className against `globals.css`; it runs as part of `pnpm check`.
- **`isolation: isolate` traps the z-index of everything inside it.** `.hero`
  isolates so its gradient stays behind its own content, which also meant the
  search dropdown could not rise above the tiles that come after the hero in
  the DOM — no z-index inside an isolated context escapes it. The container
  needs a z-index of its own, not the overlay.
- **Local dev needs a subdomain.** `http://localhost:3000` is the hub. A wiki
  is `http://dawnwalker.localhost:3000` — Chrome and Firefox resolve any
  `*.localhost` to 127.0.0.1 with no hosts-file entry. Browsing the internal
  path form (`localhost:3000/dawnwalker/quests`) mostly works but every
  root-relative link and `/search-index.json` will 404, because those are
  written for the subdomain.
- **It is `proxy.ts`, not `middleware.ts`.** Next.js 16 renamed the convention.
  The old name still resolves and is deprecated, so a file written from memory
  against middleware docs silently never runs.
- **A child `generateStaticParams` does not compose with its parent's.** The
  documented "top down" approach — a layout generating `[game]`, each child
  page generating its own `[slug]` — calls the child once per game with the
  right params, receives the right slugs back, and prerenders *none of them*.
  No error. The page count fell from ~400 to 185 and nothing said why. Every
  detail page generates the full `(game, slug)` set itself through
  `gameSlugParams` in `src/lib/params.ts`. Do not "tidy" that back.
- **Do not name a route folder `sitemap.xml`.** Next's metadata convention
  claims it. `[game]/sitemap.xml/route.ts` built without complaint and emitted
  one file at the literal path `/-/sitemap.xml` — the dash being the
  placeholder for `generateSitemaps`' `id` — while the route it was supposed to
  serve did not exist. `robots.txt` and `sitemap.xml` both answer per host by
  reading the Host header instead; they are the only two dynamic routes.
- **SQLite needs WAL and a real busy timeout.** `next build` prerenders with
  twenty-one workers all reading the same file. The adapter defaults to a
  rollback journal and `busyTimeout: 0` — fail rather than wait a millisecond —
  which aborted the build with SQLITE_BUSY at around page six hundred. Both are
  set in `payload.config.ts`. While chasing it, the navigation also turned out
  to be loading every row of thirteen collections to take its `.length` on
  every page render; that is `countRecords` now.
- **Adding a game-scoped collection anywhere but the end renumbers indexes.**
  Payload names compound indexes by position — `game_slug_5_idx` and so on — so
  inserting `achievements` after `endings` renamed every later collection's
  index and the next write failed with `index game_slug_5_idx already exists`.
  There is no way to name them; `pnpm db:reset` is the fix, and it now runs the
  whole seed chain including the new games' content and art.
- **Lazy quantifiers skip past optional groups.** The achievement scraper read
  fifty-two rows and captured a null unlock percentage for every one of them,
  silently. `[\s\S]*?` before an optional group matches the shortest thing that
  satisfies the *rest* of the pattern, which means skipping the optional group
  entirely. Split into blocks and read each field from its own block; do not
  write one regular expression that spans a whole record.
- **A blocked autocomplete endpoint writes an empty file over a good one.**
  After a few thousand requests in a day Google answers `suggestqueries` with
  a 403 "your computer or network may be sending automated queries" page, and
  it keeps answering it. The harvester's retry loop turned every one of those
  into an empty array, so a run stayed "successful" for an hour, found
  nothing, and would have replaced several thousand real searches — the only
  copy, gathered over days — with a valid empty file. Nothing would have
  errored; the generators downstream would simply have written fewer pages.
  `tools/fetch-search-queries.mjs` now treats 403/429 as terminal, stops the
  sweep, and refuses to write a harvest smaller than 90% of the one on disk.
  Keep that guard: it is the only thing standing between a rate limit and
  silent data loss.

- **A draft is a complete record that 404s, and every check agrees it is
  there.** `guides` is the one collection with `versions: { drafts: true }`,
  and Payload defaults a document it *creates* to `_status: 'draft'`. The
  generators never said otherwise, so 335 of 397 guides were written, counted,
  verified, committed and reported as finished while every one of them
  returned 404. `pnpm verify` passed, because the rows exist and carry a game.
  Counting the collection passed, because it counts rows. `pnpm build` was
  green and reported 1,666 pages, because a route whose `generateStaticParams`
  returns nothing is not an error. The only thing that found it was somebody
  opening a URL. Anything that creates a guide must pass `_status:
  'published'`; `pnpm verify` now fails while any draft exists and
  `pnpm seed:publish` backfills. **Counting rows is not checking pages.**

- **Copy written when there was one game is wrong on eight, and says so in
  search results.** Every section index hardcoded Dawnwalker's wording, so the
  Gears of War Regions page listed fifty-one Gears regions under the heading
  "Vale Sangora", titled itself "All ten regions of Vale Sangora", and quoted
  the 480-segment clock at a game that has no clock - in the `<title>` and the
  meta description as well as on the page. The footer went further: one
  `footerNote` on the network settings told readers of all eight wikis that
  "The Blood of Dawnwalker is developed by Rebel Wolves", which is a disclaimer
  naming the wrong company on every page of seven sites. The navigation was
  right the whole time, because navigation is derived and copy was not, and no
  test failed because nothing here is a type error. Section copy now comes from
  `src/lib/section-copy.ts` and the credits from `src/lib/credit.ts`, both
  keyed to the game and both unit-tested against exactly this. **If you write a
  sentence about the game into a `[game]` route, it is a bug** - it will be
  served on all eight.

- **`ART_GAME` named the owner and nothing made callers ask.** Every band in
  `src/lib/art.ts` is cut from a Dawnwalker press screenshot, which the module
  said in its own docstring - and then `sectionArt(name)` handed it to whoever
  asked. The wiki home checked; all fourteen section indexes did not, so the
  Onimusha Regions page opened with Dawnwalker beta footage credited to Rebel
  Wolves and Bandai Namco. `sectionArt(game, name)` takes the asking game
  first now, so the check cannot be forgotten - there is nowhere to put the
  section name except after the game's. Do not "tidy" that argument away.

- **A section with no records still served a 200.** `sectionsFor` keeps an
  empty section out of the rail and the sitemap skips it, so an empty index was
  reachable only by typing the URL - and what it served was the copy for the
  one game that does have the section, which is how Phantom Blade Zero came to
  have a page headed "The three courts and their Court Activities". The
  Dawnwalker-only indexes `notFound()` on an empty collection now.

- **Grid and flex children default to `min-width: auto`**, so a wide table
  inside an `overflow-x` container drags the page sideways on a phone. The
  shrink-fix is at the end of `globals.css`; keep it.

## How a guide gets written

Four passes, each grounded in a different source, each idempotent on
`(game, slug)` so they can be re-run in any order:

```bash
pnpm seed:guides    # hand-written, per game
pnpm seed:articles  # eight topics a Steam listing settles outright
pnpm seed:deep      # engine/composer/series facts, rarity bands, category roundups
pnpm seed:topics    # store features, stat comparisons, coverage, the demand side
pnpm seed:prune     # delete pages a generator would no longer write
pnpm seed:cite      # cite the pages that compile this wiki's own records
pnpm seed:guide-images  # a picture on every guide, from its own game
pnpm seed:publish   # publish drafts — see the gotcha above, this matters
```

`seed:prune` exists because the other passes upsert and never delete, so
tightening a filter does nothing to the pages the loose filter already wrote
— they stay in the database, in the sitemap, indexed, with nothing to mark
them as orphans of a rule that has since changed. Run it after changing any
generator's filters. It matches on the generated titles, which say exactly
what kind of page each one is, so it cannot touch anything hand-written.

All of them are in `pnpm db:reset`, in that order, and a new one belongs
there too. A pass that only ever runs by hand is a pass that is missing the
next time somebody rebuilds from scratch — `seed:topics` and `seed:cite` were
both left out of the chain once, and the only symptom was a hundred and
thirty-eight fewer guides than the run before.

`seed:topics` is the one with the rule worth remembering: **it is the only
pass that answers in the negative**, and a negative answer is always phrased
as "the store listing does not carry this, read on <date>" rather than "no".
A listing is strong evidence of presence and weak evidence of absence,
especially before release, and a wiki that says "no crossplay" the week a
publisher adds it has spent the only thing this site has.

The demand-side pages (`most-searched`, `open-questions`) are built from
`src/seed/raw/queries/`, which `tools/fetch-search-queries.mjs` fills. They
match a query to a page on the words that are *not* the game's own name —
without that discount every question matches every page, because every
question names the game. `src/lib/asking.ts` needs the same correction and
has it; if you write a third matcher, it needs it too.

**Guide counts are data-bound, not effort-bound.** A wiki for a game with a
twelve-article community wiki does not reach forty guides, and padding it is
the one thing that would cost this network its argument. `pnpm seed:topics`
prints a per-wiki count; the gap is the finding, not the failure.

## Maps

A base image, pins positioned as a percentage of it, and a found list kept in
the reader's own browser. `src/components/GameMap.tsx` is the viewer,
`src/collections/Maps.ts` the schema, and `src/components/admin/MarkerPlacer`
the click-to-place editor in the admin.

**Percentages, never pixels.** The pin data then survives the base image being
re-exported at a different size, which it will be the first time somebody
finds a cleaner scan. Replacing a base map with a differently *cropped* one
still moves every pin, and nothing can fix that but re-placing them.

**`markerSource` is required and stays required.** A pin is a claim a reader
will physically walk to, so it is the field on this site somebody would most
be tempted to eyeball - the same reason `src/seed/import.ts` rejects a record
with no source URL.

There are no maps yet, and that is a finding rather than a gap. Every
map-named file on all eight source wikis belongs to an *earlier* game in that
franchise - Azuchi Castle is not Way of the Sword - and using one would be the
misattribution `ART_GAME` exists to prevent, arriving through another door.

## Comments

Replies go exactly one level deep. Flat turns every disagreement into people
quoting each other by name; unlimited nesting eats the column on a phone until
the argument at the bottom is four words wide. A reply to a reply attaches to
the same top-level comment.

A reply whose parent is missing or unapproved is **promoted to top-level**
rather than dropped - a moderator has already approved it, and it reads fine
on its own. `parent` arrives from the public create endpoint like everything
else, so the beforeValidate hook drops one that is not a root comment on the
same page.

## The licence line

Site settings -> Hub home page -> attribution. **Off by default, by the
owner's decision, with the reason recorded at both ends.** Around five hundred
records restate facts from Fandom and Wikipedia, both CC BY-SA, and that
licence asks for credit as a condition of reuse; with the line off and nothing
else carrying it those pages sit outside the terms the facts arrived under. A
site-wide credits page is the usual way to satisfy it without a line on every
page. Do not quietly re-enable it, and do not quietly remove the warning.

The wording is an editable template. It is split on its token pattern and
rendered as React children, never `dangerouslySetInnerHTML` - an
admin-editable string that reaches the DOM as markup is a stored-XSS hole
waiting for the first editor account that should not have had one.

## Legal & contact

The operator details are real and published as real: CWMI Group (trading as
Code Web Media), the Manila office, and `the Philippines` as the governing law.
`legalProvisional` is **off**, which is the single switch that decides whether
privacy, terms and contact present their values or warn over every one of them
in red.

Turn it back on the moment any of those details changes and the new one has not
been confirmed. `isProvisional` in `src/lib/legal.ts` is the backstop for the
values nobody remembered to flag — an empty field, or text that gives itself
away, such as an `@example.com` address, which IANA reserves for documentation
and which can therefore never be a working inbox.

## Outstanding

Every item here is blocked on something nobody has yet, not on work nobody has
done. Padding any of them is the one thing that would cost this network its
argument.

- **Per-quest segment costs** — only 15 of 93 have one. Biggest single gap;
  needs the game or a source nobody has published yet.
- Common/rare gear, 12 of 28 bestiary entries, most recipe names.
- Xanthe's 15th Court Activity — never named in any source found.
- **Images.** Records have image slots and fall back to the icon set. Dawnwalker
  sits at 61 of 80 items and 5 of 16 enemies. See `docs/ASSETS.md`.
- **Perk time costs** — 0 of 40. `timeCostSegments` deliberately has no default,
  so these read as unknown rather than free.
- **Owner-supplied settings** that `pnpm check:launch` reports and no source can
  supply: a Search Console token per subdomain (each is its own property), an
  analytics ID per wiki, six real contributors in place of six placeholder
  authors, and the network's own name — it is still "Vellum", a working title.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
