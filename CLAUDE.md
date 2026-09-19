# Game wiki network — working notes

A network of game wikis sharing one admin, one account system and one set of
editorial rules. Next.js 16 + Payload CMS 3 on libSQL. Every public page
prerenders to static HTML; `/admin` is a full CMS.

Eight wikis today. `pnpm build` prerenders 3,194 pages from 2,000 game-scoped
records plus 321 company and 597 person profiles; the wikis run from 42 records
(Phantom Blade Zero) to 749 (Zero Company). *The Blood of Dawnwalker* was the
first and is second-largest at 512, and its 480-segment run planner is the
model for what a wiki here can have: one tool nobody else has.

Those figures move with every harvest. `pnpm verify` prints the record counts
and `pnpm build` prints the page count; neither is worth trusting from memory,
and an earlier version of this paragraph said 1,929 pages and 1,375 records for
long enough that both were wrong by a third.

**A tool per wiki, where the data supports one, and nowhere else.** Four have
one today — Dawnwalker's run checker and build planner, and the completion
tracker on the three released wikis whose achievements carry a global unlock
rate. The four pre-release wikis have none, and that is the finding rather than
the gap: see Outstanding.

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
pnpm build        # prerenders every page; prints the count (3,194 today)
pnpm test         # unit tests (998)
pnpm seed         # hand-written seed content, idempotent on slug
pnpm ingest       # ingest researched JSON from src/seed/raw/
pnpm db:reset     # delete the database and rebuild it from seed + raw
pnpm clean        # delete .next (devsafe does this, then starts dev)
pnpm assets       # attach images from assets/<collection>/<slug>.<ext>
pnpm verify       # every content record belongs to a game (see below)
pnpm remote <cmd> # content operations against a RUNNING site over its API
pnpm refresh      # re-read every store page and wiki, reseed, rebuild icons
pnpm check:launch # the launch checklist — NOT `pnpm audit`, that is pnpm's own
pnpm indexnow     # dry run; `-- --send` submits. Bing/Yandex/Seznam/Naver/Yep, not Google
pnpm seo:search-console  # every Search Console property, in order, with its sitemap
pnpm fetch:games  # just the store pages
pnpm fetch:entities  # just the community wikis
pnpm seed:games   # store-page facts -> mechanics pages and achievements
pnpm seed:entities   # harvested entities -> characters, items, enemies…
pnpm seed:prune-entities  # drop harvested records that are not things in the game
pnpm fetch:companies # company facts from Wikipedia -> raw/companies.json
pnpm seed:companies  # studio and publisher profiles for companies.<domain>
pnpm seed:prune-media    # delete orphaned images and stray files (--apply)
pnpm check:kind      # is each record the kind of thing it is filed as?
pnpm seed:art     # attach game key art and achievement icons
pnpm make:avatars # redraw contributor monograms
pnpm seed:avatars # attach them
pnpm assets:match <dir> [--apply]   # match extracted game files to records
pnpm email:test <address>           # send one message through whatever is configured
pnpm analytics:roll                 # summarise a day of page views, drop raw past 62 days
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

**A sentence about one game does not belong in a component.** It is invisible
until a second game exists, and then it is on every page of all of them - the
Regions index on the Gears of War wiki headed "Vale Sangora", in the `<title>`
and the meta description too. Reader-visible copy is a field: on the Game for
a wiki's own words, in a global for the hub, the legal pages, the companies
host and the interface. Every one of those fields is optional and falls back to
the wording in the code, so a blank record renders the site the code does.
`pnpm seed:copy` writes that wording in so an editor opens a real sentence.
See `docs/COPY.md` - it also lists the four things that stay hardcoded, and
why making the "this page is not ready to publish" warning editable would
defeat it.

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
- **`process.exit()` after a `fetch` aborts node on Windows.** A keep-alive
  socket that is still closing when the process exits trips a libuv assertion —
  `!(handle->flags & UV_HANDLE_CLOSING)`, exit code 127 — and the C stack trace
  lands *after* the message the script just printed, so a refusal reads as a
  crash and the sentence explaining it scrolls away. Every request in
  `tools/indexnow.mjs` carries `Connection: close` for this reason and no
  other. Any script that fetches and then exits non-zero needs the same.
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

- **"No such article" and "Wikipedia would not answer" were the same value,
  and the harvester wrote the second one down as the first.** Every failure in
  `tools/fetch-reference-facts.mjs` returned `null` — a 429, a 403, a dropped
  socket — and the loop could not tell those from a page that genuinely does
  not exist, so it printed "no article" and wrote `wikipedia: null` over a
  complete harvest. A rate-limited run took Dawnwalker's 753 bytes of infobox
  facts down to 77 and Onimusha's 836 to 92, then exited 0 with a tidy summary.
  Nothing downstream errored either: `tools/fetch-posters.mjs` reads the
  article URL out of those files, so the only visible symptom was five games
  reported as having "no Wikipedia article recorded" — including the one the
  owner had just asked for a cover of. The files were recovered from git.

  The same failure as the autocomplete one above, arriving through a second
  door, and the fix is the same shape: a refusal now throws, a refusal stops
  the sweep and exits non-zero, and no record is written if it holds fewer
  facts than the one already on disk. **A refusal is a fact about the network
  and must never be written down as a fact about the game.** Any harvester
  added here needs both halves — the file on disk is usually the only copy.

- **A flag that was not passed leaves no trace, and four wikis had no
  pictures because of one.** `tools/harvest-game.mjs` downloads each entity's
  lead image only with `--images`. Fire Emblem, Resident Evil Requiem, Forza
  Horizon 6 and Subnautica 2 were swept without it, so their harvests recorded
  365 image URLs and fetched none of them — and every pass downstream behaved
  correctly on that data, because `seed:entities` attaches a picture only where
  `imageFile` names a file. 365 records rendered a fallback icon, on four
  wikis, and nothing anywhere said why. The harvest file looks complete: the
  entities are all there, with their facts, their categories and the URL of the
  picture nobody fetched.

  `pnpm fetch:entity-images` downloads what a harvest already names, without
  re-sweeping the wiki, and `tools/lib/fandom-image.mjs` is the one copy of the
  download shared with the harvester. It also fixes the bug found while moving
  it: `imageFile` was recorded **before** the request, so a refusal left the
  harvest naming a file that was never written.

- **`push: true` asks a question when you remove a field, and `next dev` has
  nobody to answer it.** Deleting `bodyImagesHeading` from `Guides` made
  drizzle print "You're about to delete body_images_heading column in guides
  table with 597 items" into the dev log and wait. Every request hung, nothing
  errored, and the line reads like information rather than a prompt — the
  server had already printed `Ready in 419ms`. Adding a field never does this,
  which is why it is a surprise the first time.

  `pnpm db:reset` is the documented answer and the right one before a
  production build. `node tools/drop-column.mjs <table> <column>` is the one
  for the middle of a session: it drops the column and its `_v` mirror so push
  has nothing to ask about, and it refuses any column a collection still
  declares — dropping one of those makes push recreate it empty on the next
  boot, which blanks the field for every record.

- **A check that names the places it looks is always one group behind the
  schema.** `pnpm check:art` walked each record's top-level image fields and
  then `theme` by name, so when cover art landed at `profile.poster` it was
  simply outside the audit — fourteen pictures, on the collection the whole
  check is about. The count not moving when four covers were attached was the
  only sign, and only if you were watching the number. It walks every nested
  group now rather than a list somebody has to remember to extend.

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

- **A franchise wiki will sell you the film as a location.** The entity
  harvester takes only categories naming the specific game, which is most of
  the defence - but "Gears of War (film)" sits in the Gears of War category,
  and arrived in `regions`. Sixteen of them were live: the Gears TV series, the
  Silent Hill pachislot machine, four other Silent Hill games, each with a
  composed summary reading "<name>, a location in <game>". Every one had a real
  source URL, because the page it came from is real - only the *kind* of thing
  was wrong, and nothing here was checking kind. `pnpm verify` passed, the
  build was green, and the pages rendered perfectly.

  `isNotAnEntity` in `src/lib/harvest.ts` rejects them on the wiki's own
  parenthetical, and `pnpm seed:prune-entities` removes ones already written -
  the same relationship `seed:prune` has with the guide generators, and it is
  in `db:reset` for the same reason.

  **The first version of that rule deleted Antar 4**, a real moon on the Star
  Wars wiki, because it rejected any Title Case name ending in a digit.
  Numbered names are ordinary in science fiction; only a number after the
  *franchise's own name* means a sequel. A filter written to stop bad records
  is still a filter, and an over-broad one throws away the good ones just as
  silently. The tests pin both directions.

- **Counting rows is not checking kind, either.** `pnpm verify` asks whether a
  record belongs to a game and the build asks whether a page renders. Both were
  green while the Gears of War *film*, thirty-odd Gears novels, five Silent
  Hill soundtracks and thirteen studios sat in `regions`, each with a real
  source URL and a composed summary reading "<name>, a location in <game>". Of
  Gears' forty-five regions only nine were places; Silent Hill had one.
  `pnpm check:kind` is the check, and it reports in two tiers on purpose:
  mechanical findings fail the run, and anything matched on a guess is printed
  for somebody to read. Two guesses have already been wrong - one flagged a
  real enemy for containing "series", one deleted a real moon for ending in a
  digit - so the fifty-six titles it could not decide are a reviewed list in
  `src/lib/harvest.ts` rather than a cleverer regex.

- **A dropped template is silent, and takes its arguments with it.** The
  company harvester resolves `{{...}}` innermost-first and keeps the arguments
  of the ones on a list. A template *not* on that list is dropped whole, which
  leaves whatever sat outside the braces looking like a complete answer:
  `{{€|59.5 million}} (2025)` became "(2025)", and six companies stored that
  as their revenue. The list held currencies as ISO codes, which is how these
  templates are named on American company articles and not on European ones.
  Nothing errors, and the value is wrong rather than missing, so no emptiness
  check finds it. `tools/fetch-companies.mjs` now collects every value that
  resolves to nothing or to nothing but a year and prints it with the wikitext
  that produced it; add the template name to `KEEP_ARGS` and re-run. The
  resolver is importable and unit-tested because of this - `vitest` reaches
  `tools/**/*.test.mjs`.

- **The answer to a question about one collection often lives in another.**
  Onimusha's wiki had no cast, until somebody looked in `enemies`: its bosses
  are filed there, and each carries a full English, Japanese and Mandarin voice
  credit. Twenty-one credits sat in a collection nobody was reading, because
  the field was called `Voice Actors` rather than `actor` and the reader was
  pointed at `characters`. Survey the keys that are actually present across
  every harvested file before deciding which ones a pass reads - the harvest
  writes what the wiki had, not what the schema expected.

- **`next/script` at `beforeInteractive` does not inline your code.** What it
  emits into the document is `(self.__next_s=self.__next_s||[]).push([...])`,
  a queue Next's own runtime drains *after* the bundle loads. The theme script
  exists to stamp `data-theme` on `<html>` before the first paint, and it was
  running after it, so a reader whose toggle disagreed with their system
  preference got a flash of the wrong theme on every cold load of every page.
  React's "Encountered a script tag while rendering React component" warning
  was pointing straight at it for months and was read as noise, because the
  comment above the call claimed `next/script` was the documented way to avoid
  exactly that warning. Both halves were wrong: `next/script` is itself a
  client component rendering a `<script>`, which is what the warning is about.

  A **bare `<script dangerouslySetInnerHTML>` rendered by a server component**
  is the form that works. React only warns when it *creates* a script element
  during a client render; a server component's script is in the HTML and is
  hydrated rather than created, so it runs synchronously during parse and says
  nothing. Anything that must run before first paint goes in that form, and
  the check is the served HTML - if your code is not literally in it, it is
  not running when you think it is.

- **Grid and flex children default to `min-width: auto`**, so a wide table
  inside an `overflow-x` container drags the page sideways on a phone. The
  shrink-fix was one block at the end of `globals.css`; the visual-layer
  rebuild moved each rule next to the layout it protects, so `min-width: 0`
  now sits on `.split > *`, `.stack`, `.section`, `.rail`, `.tablewrap`,
  `.checker > *` and `.planner > *` in their own sections. Keep it there and
  give any new grid or flex container its own - somebody looking for the block
  at the end of the file will not find it and should not re-add a second copy.

- **An email adapter that boots clean and sends nothing.** Two of the defaults
  in this area are the exact failure this project keeps meeting.
  `nodemailerAdapter()` called with no transport quietly invents an
  **ethereal.email** test account: mail "sends", the API returns success, and
  every message lands in a throwaway inbox nobody opens. And its own `verify()`
  step catches the error and `console.error`s it, so a relay that refuses the
  credentials starts clean and fails on the first password reset a fortnight
  later. `src/lib/email-adapter.ts` builds the transport itself and verifies it
  itself, so neither path exists. `src/lib/email.ts` is the half with no I/O in
  it, and it refuses to boot naming the variable at fault. The provider is
  `EMAIL_PROVIDER`, the default is `console`, and `pnpm email:test <address>`
  exits non-zero on `console` because printed is not delivered. `docs/EMAIL.md`.

  Related, and **closed**: `players` had no password reset. Payload exposes
  `POST /api/players/forgot-password` whether anything links to it or not, and
  the link it composed pointed at `/admin/reset/<token>` — the editor admin,
  which resolves tokens against `users`, so a reader was told their token was
  invalid on a page they cannot sign into. `Players.ts` now carries its own
  template pointing at `/account/reset` on the **hub**, absolute (there is no
  `serverURL` here on purpose) and with the token in the **fragment** so it
  never reaches a server log, a Referer or `Beacon`. `PasswordReset.tsx` is
  both forms; `AccountPanel` links them.

- **Two implementations of one finding, and the reassuring one wins.** The
  admin dashboard asked whether a wiki had a Search Console token in its own
  words, from its own queries, while `pnpm check:launch` asked the same thing
  from `src/seed/audit.ts`. Neither errors and both look right, so the day they
  disagree the owner has no way to tell which is lying. Every check now lives
  in `src/lib/audit.ts`; `src/seed/audit.ts` is the report and its tiers, the
  admin renders the same findings as rows and sidebar badges, and
  `src/lib/audit-source.ts` holds the two that read the repository instead of
  the database so the admin never imports `fs`.

  Each finding carries `actor`: `owner` for the things only the owner can
  supply, `editorial` for work somebody with the sources can do, `blocked` for
  what nobody has published — **a `blocked` finding is never shown as an
  action, and never badged**, because a badge is a chore and 78 quests with no
  published segment cost is the state of the world. `info` findings ("serves on
  companies.example.com") are answers, not tasks, and appear in neither.

  Two honesty rules came out of it. The content scan was
  `find({ limit: 2000 })`, which stopped at two thousand rows and reported
  "343 of 2000 images have no credit line" for a library of 2,254 — a
  denominator wrong in the reassuring direction. It is `count()` now, over the
  whole collection. And a badge is deduplicated by the field it points at: the
  companies host and the people host both want a verification token and both
  point at the one network field, which is one empty box, not two.

  Payload 3.89 **cannot deep-link a tab** — the active tab is a user
  preference, not a URL — so a row carries a `#field-…` anchor *and* the tab
  named in words. Nothing about any of this is dismissable, for the reason
  `docs/COPY.md` records about `LegalGap`.

  **A page nothing links to is the same failure as an empty sitemap.** The
  navigation on this network is derived, not authored — the rail, the footer
  and the sitemap all come from `sectionsFor`, which returns only the sections a
  wiki has records in — so an *empty* index is in none of them and is reachable
  only by typing the URL. Seven of the sixteen section routes answer 404 in that
  state; the other nine answer 200, which is nineteen live pages that nothing on
  the network links to, `/maps` on all eight wikis among them. `auditNetwork`
  reports them from counts it was already taking, and `GUARDS_EMPTY_INDEX` in
  `src/lib/audit.ts` records which routes guard themselves — restated from the
  route files because they cannot be imported, and pinned against them by
  `audit.test.ts` so the two cannot drift. `LISTING_LIMIT` beside it is the
  other door into the same failure: every index reads its collection in one
  query with a fixed limit and no pagination, so a collection that grows past it
  does not paginate, it just stops listing the surplus — the shape that put 199
  company profiles on no page a reader could reach. Nothing is over a limit
  today, which is exactly when to write the guard.

- **A value a select no longer offers refuses every write to its document.**
  `outlook` was removed from `fields/rating.ts` — the owner's call, after the
  hub served Control Resonant at 8.9/10 three weeks before launch — and the
  four rows already carrying it stayed exactly where they were, because a pass
  that upserts and never deletes leaves its old output behind and so does a
  schema change. Nothing rendered, because `isReleased` refuses a score for a
  game that is not out, so the site looked perfect. What broke was *writing*:
  Payload validates the whole document, so `pnpm seed` died on "The following
  field is invalid: Our rating > Based on" at the first of the four and took
  the rest of `db:reset` with it, and an editor changing anything at all on
  Phantom Blade Zero got the same refusal about a field they had not touched.
  Only on an existing database — a fresh one creates those rows from
  `seed/games.ts`, which carries no rating, which is exactly why it survived.

  `clearWithdrawnVerdicts` in `src/seed/rating-basis.ts` is the repair, and the
  shape of it is the part worth keeping: **it removes the whole verdict, not
  the dead field.** Clearing `basis` alone fixes the write and breaks the
  decision, because `outlook` is load-bearing twice — it is the value the
  select refuses *and* the marker `verdict.ts` reads to stop a pre-release
  score being promoted into a review on launch day. A repair that blanks it
  rebuilds the exact failure the option was removed to prevent. Its own module,
  not a function in `seed/ratings.ts`, because that file calls `run()` at the
  top level and importing it would run the whole pass as a side effect.

- **An empty section index is not that wiki's section, and all sixteen say so
  now.** Seven `notFound()`d on an empty collection; the other nine answered
  200 with a heading over nothing, on a URL the rail, the footer and the
  sitemap had all left out — nineteen live pages nothing linked to, `/maps` on
  all eight wikis among them. The link graph here is *derived*, not authored:
  `sectionsFor` returns only the sections a wiki has records in, so a 200 on an
  empty one cannot be linked to by construction. `GUARDS_EMPTY_INDEX` in
  `src/lib/audit.ts` is all sixteen and is pinned against the route files by
  `audit.test.ts`; it is kept rather than deleted as a constant that is now
  every member, because what it catches next is the *seventeenth* collection.

- **An editable list that replaces a derived one can orphan pages, and the
  footer is where.** `settings.footerColumns` replaced the built-in site map
  outright the moment one column was filled — on all ten hosts, from one field
  on the network global. Two failures, neither of which errors: `/about`,
  `/corrections` and `/requests` have no other inbound link on a wiki host, so
  one admin save took nine pages off the site; and the columns are per host
  while the field is not, so an editor writing the hub's map served it as the
  section list of all eight wikis — the `footerNote` defect again. It is a
  merge now (`src/lib/footer-columns.ts`): a matching heading gains links, a
  new heading becomes a new column, and **nothing there can remove a built-in
  link**, which is the deliberate half. `companies/layout.tsx` had been stating
  that rule for its own column the whole time, while `[game]/layout.tsx`
  resolved the same field a second time with a comment arguing the opposite.

- **One tokeniser, because a matcher missing the game-name discount answers
  confidently.** There were two copies of the stop-word list and the word
  splitter — `lib/asking.ts` and `seed/topic-guides.ts` — and a line in this
  file asking whoever wrote a third to remember the discount. A note is the
  weakest guard there is. `src/lib/terms.ts` is the one copy, the third matcher
  (the "More guides" rail) is built on it, and the two rules it holds are
  pinned by tests: the game's own name never carries a comparison, and
  `singular` folds a trailing `s` **only after a consonant** — the first
  version turned `this` into `thi`, and a transform that is wrong in the
  direction of merging two things is exactly as silent as a filter that is
  wrong in the direction of deleting one.

- **A link to an index that 404s, and the fix that created it.** Making all
  sixteen section indexes `notFound()` on an empty collection was right and
  immediately broke three wikis: `RelatedList` printed "No quest in the
  database is filed under this region yet" and offered a "see all" link beside
  it, pointing at a `/quests` that no longer existed. Every region page on
  Onimusha, Silent Hill and Resonance. The guard is `items.length === 0`, and
  it is exact rather than approximate: the items are drawn from the collection
  the href points at, so a list with something in it *proves* the index
  renders. The wiki home had the same shape waiting — its "this wiki is just
  starting" branch renders only when `total === 0`, and its primary call to
  action linked `/mechanics`, which in that exact state is guaranteed to 404.

  **A link crawl is the only thing that finds these.** `node` cannot resolve
  `*.localhost` on Windows, so a crawler has to send the Host header itself —
  and `fetch` silently drops `Host` (undici treats it as forbidden), which
  hands back the apex on all ten hosts and reports a clean run. `node:http`
  passes it through. Both mistakes look like a passing audit.

- **Two spellings of one rule, and the third and fourth copies.** `developer`
  and `publisher` are free text off a store page, and "Konami, Annapurna
  Interactive" is two companies. `GameProfile` split on the comma;
  `[game]/about` did not and linked
  `companies.<domain>/konami-annapurna-interactive`, a 404, from every page
  that rendered the block; `lib/schema.ts` split on the comma again for the
  JSON-LD. Three answers to one question, and the naive comma is wrong too —
  `Atari, Inc.` is a real profile on the companies host, and splitting it gives
  an Organization named "Inc." in the structured data.

  `src/lib/rightsholders.ts` is the one answer, and it carries the second half
  of the rule as well: **a name that does not resolve to a profile is not a
  link.** `resolveRightsholders` in `lib/payload.ts` checks the far end, so a
  studio this network has not written up is named in the disclaimer — which it
  has to be — without being a link to nothing.

- **A control that is present, reachable and inert.** Three more, found by
  listing every field name declared in `collections/`, `globals/` and
  `fields/` and grepping for a read anywhere else: `bossEnemy` on Courts ("the
  duel at the end of this court"), `relatedGames` on Games ("how a new wiki
  gets its first traffic"), and `lastVerified` on Site settings, whose admin
  description read **"Shown on the home page"** while appearing on no page at
  all. All three were empty, which is exactly why nobody noticed: the failure
  only shows to somebody who fills one in, and what they see is nothing
  happening. All three render now, and all three render nothing while empty.

  The same scan clears five others — `spamScore`, `submittedBy`,
  `moderatorNote`, `editorNote` and `placeMarkers` are admin-only or a `ui`
  field, which is what they are meant to be. Worth re-running after a
  collection change; the whole check is one pass over the source.

- **A URL built at seed time is a URL frozen at seed time.** `seed:cite`
  stored `await gameUrl(game)` as a compilation guide's only citation.
  `gameUrl` reads `NEXT_PUBLIC_SITE_URL`, so a pass run on a developer's
  machine published `http://dawnwalker.localhost:3000/` into the database, and
  the deploy carried it. Nothing errors: the page renders, the link is blue,
  and `check:launch` counts the guide as cited. It is the trap
  `[game]/layout.tsx` already names about footer hrefs, arriving through the
  data instead of the code.

  The page and the records it compiles are on the same host by definition, so
  the citation is `/` — correct wherever the site is deployed. And
  `sourcesField` in `src/fields/shared.ts` now **refuses an absolute loopback
  URL on every write**, from a seeder, the remote API or the admin alike,
  because there is no such thing as a legitimate public citation of
  `localhost`. A relative path is allowed and is the right answer for a page
  citing its own site.

- **A 404 page that renders on the client is worse than the default one.**
  Next 16 serves `not-found.tsx` as a **client-rendered shell**: the response
  is 404, the browser shows the page, and the served `<body>` is empty — so a
  crawler and a reader with JavaScript off get a blank page. Two attempts made
  it worse, each by shipping the page they were written to replace: reading
  `headers()` threw, because `/_not-found` is prerendered and a static render
  has no request (`<html id="__next_error__">` is the tell); dropping that but
  staying `async` for one database read produced the empty body.

  **So the custom 404 is not shipped, and the built-in one is what serves.**
  The lesson is the check, not the fix: *strip the `<script>` tags and read
  what is left.* A page that renders only in the RSC payload looks perfect in a
  browser and is not there at all for half of what this site is built for.
  `global-not-found.tsx` behind `experimental.globalNotFound` is the documented
  route for an app with two root layouts, which this is; it is experimental and
  was not worth enabling on the way to a launch.

- **A file in `public/` is not a file the site will serve.** `proxy.ts` rewrites
  `/<anything>` onto a game prefix on a wiki host and redirects it to a
  subdomain on the apex, so a static asset is only reachable if its first path
  segment is in `PASS_THROUGH`. Three omissions so far, each invisible in its
  own way: three of the four declared favicons 308'd to a host that does not
  exist (a browser silently falls back to the next icon); the IndexNow key file
  404'd on every host, which is the one thing that makes IndexNow refuse a
  submission; and `public/art/` — all fourteen section band photographs —
  404'd on every wiki host, where `sectionArt` hands the path to a CSS
  `background-image`. **A missing CSS background is the quietest failure on the
  web**: no broken-image glyph, no layout shift, nothing in any log, and the
  band still renders at full height with its gradient and its credit line
  intact, crediting a photograph that is not there.

  All of them passed every check, because the checks ask whether the file is on
  disk and it always was. `src/proxy.test.ts` asks the routing table instead —
  every entry at the root of `public/` must be exempt — so a new asset fails on
  the commit that adds it rather than on the day somebody looks. It needs no
  server, which is why it is a unit test and not a `check:launch` fetch.

- **A scrim is not a brightness control, and the one that was too dark was the
  file.** The hub hero had already had its scrims measured and retuned, and the
  homepage still read as black. The picture in it has a greyscale mean of 11.5
  of 255 — `wikis[0]`, and `directory()` sorts by page count, so the one
  photograph a first-time reader of the network sees was chosen by which wiki
  had the most rows. It is `heroWiki` on Site settings now; blank still means
  `wikis[0]`, so a blank record renders the site the code does.

  The other half is the one worth remembering. **The scrim's strength is set by
  the text on it, not by the picture.** The band took the page's theme tokens,
  so the smallest type on it — 11.5px in `--muted` — needed its backdrop below
  0.039 luminance, which over a white sky is a 96% wash and a photograph nobody
  can see. `.page-art` has always done the opposite and says why: the band is a
  photograph in either theme, so the type on it stays light in either theme. A
  light register raised the allowed backdrop to 0.096 and the scrim fell to 62%
  as arithmetic rather than taste. Under the type the picture went from 1.25 to
  41.67 (mean |delta| per channel) with nothing below 4.5:1.

  Redefine the tokens the way `.page-art` does and you delete the search box:
  `HubSearch` paints `var(--ink)` on `var(--surface)`, which is white in the
  light theme. The light register is `--hero-*`, read only by the five copy
  elements, for that reason.

- **A mark beside a credit is a claim, and two characters is enough to make a
  false one.** Image credits are on now and print inside the picture, with a
  camera or a `©` — and `©` on a public-domain logo asserts a copyright the
  file does not carry, which is roughly half of the 105 logos harvested from
  Commons. The mark comes from `creditBasis` in `src/lib/credit.ts`, which
  reads the stored string, is tested against the real values, and returns *no
  mark* for anything it cannot place. One credit says "replace with a
  photograph" and is not one; one public-domain logo carries a `©` inside the
  author field Commons gave us. Both are pinned.

  **The overlay must never hide a word of it.** Past a length budget for its
  slot the credit stops being an overlay and prints under the picture, whole —
  Phantom Blade Zero's 269-character one rendered in five lines. A clamp, a
  fade or a scroller inside the overlay is `4206c56` in a new place, and that
  one hid 2,369 characters of Wikipedia's stylesheet for months behind a page
  that looked perfect.

  **And making the credits visible is what found the next one.** MediaWiki's
  `extmetadata.Credit` is the file page's *source* field — where the uploader
  found the file — and `Artist` is the author. `src/seed/posters.ts` had
  `Credit` second in its rightsholder chain, so the two cover arts with no
  `Artist` published their provenance as a copyright: "© May be found at the
  following website: Steam. Direct link to the media. Archived from the
  original on 12 August 2026…". The other six only escaped because they have
  an `Artist`; queued behind them were "Epic Games Store", "Eurogamer" and a
  bare xbox.com URL. A `©` over a sentence about a storefront is not a wrong
  name, which is what makes it worse than one — it asserts a copyright on
  behalf of nobody, in the line whose whole job is to say who owns the
  picture. The chain is `Artist → publisher → developer` now, and correcting a
  stored credit needs `pnpm seed:posters --force`, because the upload is keyed
  on filename and an ordinary run reuses the row.

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
pnpm seed:copy      # put the shipped wording into the fields that can change it
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

## Analytics

First-party, in the admin at `/admin/analytics`, and the whole design is forced
by one fact: **every public page is prerendered, so there is no request to
count.** Collection is therefore a client beacon - `src/components/Beacon.tsx`
posting to `src/app/api/hit/route.ts`, which is the only place a request is
ever seen. `/api` is in `PASS_THROUGH` in `proxy.ts`, so that route answers on
all ten hosts, and the Host header is the only thing that knows which site a
reader was on: `proxy.ts` has already hidden the game prefix from their URL.

The consequences are stated on the screen rather than discovered later. A
reader with JavaScript off is not counted; a crawler that does not execute the
page never reaches the endpoint, so the excluded fraction is a **floor** on
crawler traffic and not a measure of it.

**No address is stored, and no user-agent string.** `visitor` is a salted hash
of the address, the agent and the UTC date - the `Ratings` pattern, with the
date added. That rotation is a privacy decision and turns out to be the
performance one too: a key belongs to exactly one day, so the distinct readers
of a week are exactly the sum of seven daily counts, and the daily rollups can
answer a long window with **the same number** the raw rows would give. It also
means a multi-day reader count is a ceiling, which every figure on the screen
says.

Measured, not assumed. At 300,000 page views over 62 days a 30-day window costs
13.7s read row by row and 7ms read from rollups, because a `GROUP BY` on any
column outside the index fetches every row and thirteen breakdowns fetch them
thirteen times. So: sub-day windows and any filtered window read raw rows;
everything else reads rollups. A filter on a window past the 62-day retention
**cannot** be honoured, and the screen says so rather than returning the
unfiltered figure.

- **Country comes from the platform's header** (`x-vercel-ip-country`,
  `cf-ipcountry`). There is no geo database here and none is being added, so in
  development every row is `unknown` - rendered as a row with a count, never as
  a blank. Unknown is not zero.
- **Device is a claim**, read off the user-agent, and the card says so.
- **Direct means "the browser sent no referrer"**, not "came from nowhere".
- **The bot rules are a list with reasons** in `src/lib/analytics/agent.ts`, the
  matching rule is stored on the row, excluded rows are kept, and the screen
  prints the fraction and the rules. The naive rule - "the agent contains bot" -
  is the Antar 4 mistake: `CUBOT_NOTE_20` is a phone. The tests pin both
  directions.
- **Not game-scoped, and it must never be added to `GAME_SCOPED`.** It is not
  content, `pnpm verify` has no business in it, and the dimension wanted is the
  host - three of the ten sites are not games.
- The privacy policy describes all of this. `pnpm seed:copy` corrects the
  sections that stopped being true, and only while they still carry the
  sentence this repo shipped - an edited section is printed and left alone.

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

## The admin

It is **not** at `/admin`. `src/lib/admin-path.ts` holds the path and says why:
moving it is not a security control and is not claimed as one — every route
under it is access-checked and a path is not a password — but the default path
is what every commodity scanner tries first on every domain it can reach, and
off it that traffic never reaches a login form.

**Changing it is two edits that have to match**: the constant and the route
folder under `src/app/(payload)/`. Payload mounts at `routes.admin` and Next
serves whatever folder is on disk; disagree and the admin 404s with nothing
anywhere explaining it. `src/proxy.test.ts` pins the pair, plus the
`PASS_THROUGH` entry and the fact that there is exactly one admin folder. It is
not an environment variable because a route folder name is fixed at build time,
so `.env` could move the router and leave the pages behind.

Everything that has to follow the path goes through `adminUrl()` — the
findings in `lib/audit.ts`, every link in `components/admin/`, the reset email
in `Users.ts`, and the `Disallow:` in `robots.ts`. A moved admin still named in
robots.txt has published its own new address.

- **Search is one box across 23 collections** (`SearchView`, listed in
  `lib/admin-search.ts`). Payload searches one collection at a time, which is
  right when you know the answer is a quest and wrong for the question people
  actually arrive with — picking the collection first is the hard half. The
  list is written out rather than derived, so it cannot quietly start
  searching `analytics-events`. A GET form, not a typeahead: the query lands
  in the URL, and twenty-three queries per keystroke against SQLite is not a
  feature. Each group is capped and **says when it was cut**.
- **The login screen** carries the network's own mark, its name from Site
  settings, and one warning that matters: with no mail provider configured,
  Payload's "forgot password" accepts an address and delivers nothing. The
  screen says so, because the alternative is a locked-out owner waiting for a
  message that was never sent.
- **A root view is not in Payload's nav.** It exists at a URL and nothing
  links to it, so each one needs a nav entry — `beforeNavLinks` for search,
  `afterNavLinks` for analytics and remote.
- `AdminViewServerProps` **declares a `user` that Payload does not pass** to a
  root view. Read `initPageResult.req.user`; the typed version compiles and
  renders "sign in" to somebody who is signed in.

## The site's name and its mark

`settings.siteName` is the name everywhere — nothing hardcodes it, which
`pnpm check:launch` relies on when it reports that the network is still called
"Vellum". The mark beside it is a ruled sheet rather than an initial for the
same reason: it survives the rename.

An uploaded logo replaces the drawn mark in the rail, the footer and the two
home pages (`SiteLogo`). **Two slots, light and dark**, because a raster cannot
take `currentColor` the way the drawn `<path>` does, and a dark-ink logo on the
dark rail is invisible — silently, to everybody except whoever uploaded it in
the theme they happened to be using. Both pictures are in the document and CSS
chooses; the theme is stamped on `<html>` before first paint precisely so
nothing flickers, and a logo swapped by JavaScript would put the flicker back.

It does **not** replace the favicon or the share card. Those are rasterised by
`pnpm make:brand` from the same geometry and are a separate job.

## Adding a wiki

Creating the row **is** creating the site. There is no DNS record and no
certificate to add per wiki, because the deployment answers on `*.<domain>`
behind a wildcard certificate and `proxy.ts` maps any single label onto the
matching first path segment. `docs/DEPLOY.md` section 2 has the two records
that make that true; they are set up once, for the network, not once per game.

Two things had to be fixed before that was actually true:

- `[game]` carried `dynamicParams = false`, so only slugs known at build time
  rendered and a wiki created in the admin answered 404 until a rebuild. It is
  `true` now; an unknown slug is still a 404, decided by the database.
- Nothing checked that a slug was a **legal hostname label**. `slugify` covers
  the character rules by construction, but not the 63-character limit and not
  an all-digit label, either of which produces a host no resolver will serve.
  `src/lib/host-label.ts` is the check, and both `slug` and `subdomain` run it
  so the refusal happens in the admin where it can be explained rather than as
  a 404 with nothing anywhere saying why.

`pnpm check:launch` prints the host each wiki will serve on, and treats an
unservable label as blocking.

## The companies host

`companies.<network domain>` carries one page per studio and publisher. It
needs no routing of its own: `proxy.ts` maps a subdomain label onto the
matching first path segment, so this host lands on `/companies/...` exactly as
`dawnwalker.<domain>` lands on `/dawnwalker/...`, and the apex redirect sends
`<domain>/companies/x` to `companies.<domain>/x` for free. What it does need is
reserving - `NETWORK_SUBDOMAINS` in `proxy.ts`, which `Games.ts` validates new
slugs against so no wiki can ever shadow it.

`companies` is **not** game-scoped, and that is the point: Capcom appears on
one wiki today and would appear on three tomorrow, and a studio's page is
worth more as one record with its whole body of work than as three copies that
disagree the first time one is corrected. Same reasoning as `authors`.

`pnpm fetch:companies` harvests the facts from Wikipedia first. **"The top 100
most popular gaming companies" is not something anyone publishes**, because
popular is not measurable - so the spine is the published ranking *by revenue*,
the site says that is what the ranking means, and the date it was read is on
the page. The list reaches a hundred without anybody inventing one: the fifty
largest, plus the makers of our own games, plus everything those two name as a
parent or subsidiary in their own infoboxes. A name is there because a sourced
article named it, and following that edge builds the corporate graph at the
same time.

**Logos are downloaded only where the licence allows it.** Assuming a company
logo is non-free is wrong about half the time: the ones uploaded locally to
en.wikipedia under a fair-use rationale are, and most of the ones on Commons
are *public domain*, because a logo made of type and flat shapes falls below
the threshold of originality. So the harvester asks Commons for the licence of
each file and records it, and the seeder honours the answer - 105 taken, 127
left alone, each credited with the licence it actually carries.

Ask Commons for a **rendered thumbnail**, not the original. Most logos are SVG
and Payload cannot measure one - it throws `unable to determine dimensions` and
the upload fails silently inside a catch, which is how the first run produced
ten logos out of a hundred and twenty-five free ones.

`pnpm seed:companies` builds it from three sources and keeps them apart:

- **Each game's own `developer` and `publisher`.** Facts the store page states,
  so the profile can say which games are theirs and in what role. The game
  record stays the source of truth; the `games` relationship is the reverse
  index.
- **Studios the harvester filed as Regions.** Thirteen of them were live -
  Bloober Team and Konami as *places* in Silent Hill: Townfall. The research
  was real and sourced, so the migration moves them here rather than deleting
  them.

The second kind gets low confidence and a summary saying only where the name
was found. **Appearing on the Silent Hill wiki does not make a studio the
developer of the game this network covers**, and writing that it does would be
the invented fact the whole project exists to avoid.

## The people host

`people.<network domain>` carries one page per person: the directors,
designers, artists, writers and composers a game's own infobox credits, and the
actors a character's infobox names. Reserved in `NETWORK_SUBDOMAINS` alongside
`companies`, routed by the same rewrite, and network-wide for the same reason -
Olivier Derivière scored two of these eight games and Matthew Porretta is in
three Remedy titles, so a person filed under a game is a thin page per game
that disagrees the first time one is corrected.

**A name is here because a sourced page named it in a credited role.** The
routes are the games' own Wikipedia infoboxes; the `actor`, `voiced by`,
`portrayed by`, `Voice Actors`, `mo-capped by` and `Face Models` facts on
character *and enemy* infoboxes; and the executives named on company articles.
`basis` records which one, and is shown on the page - the same disclosure the
companies host makes, and the thing that stops this becoming a directory of
everyone.

There is a fourth `basis`, `wiki-mention`, for somebody a franchise wiki names
without crediting them on a game this network covers. Christophe Gans directed
the Silent Hill films and is all over the wiki Townfall is compiled from;
filing him as a game credit would be false and filing him as a character credit
would call him an actor. The condition is read off the wiki's own categories
rather than off the composed prose, so the sentence a reader sees and the group
the directory files them under cannot drift apart.

**Splitting a name is the operation to be most careful with.** Community wikis
concatenate without separators - `"Ilkka Villi (model)Matthew Porretta (voice)"`
splits on the bracket boundary, but `"Alan WakeMark Blum (voice)"` is a game
title welded to a first name and stays dropped. A fragment of four capitalised
words is only one person when the source supplies a particle or a suffix
holding it together; without that rule, "Stéphanie Cassignard Robyn Wolf" would
have been published as a human being. Dropped fragments are *listed*, which is
the only reason a character-range bug that silently rejected every Polish name
was ever found.

**These are pages about living people, and that changes the standard.** A
release date is a fact about a product; a date of birth is not. So `born` is
text rather than a date, because sources say "c. 1970" and a date picker cannot
- and turning that into 1 January 1970 invents precision about a person.
Nothing is inferred: not a nationality from a name, not a language from a
studio's address. A profile with a name, a role and a source and nothing else
is the honest state of most of them, and the page says so rather than rendering
a column of white space.

`Characters` has no actor field and should not grow one. The edge is stored on
the person - one actor plays several characters - and the character page reads
it backwards. A string copied onto each character is the shape that drifts the
first time one of them is corrected.

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
- **Images.** Records have image slots and fall back to the icon set. Perks,
  endings, builds, courts, court activities and skill trees have no photographic
  art and will not get any: a picture above the words "Walking Fortress" reads
  as a claim that it shows Walking Fortress, which is the rule `PageHeader` and
  `docs/ASSETS.md` already state for record pages. What they have instead is a
  generated emblem per record - abstract, deterministic from the slug, and
  credited as generated by this site so it cannot be mistaken for artwork from
  the game. `pnpm make:emblems` draws them, `pnpm seed:emblems` attaches them.
- **A tool for the four pre-release wikis.** Control Resonant, Gears of War:
  E-Day, Phantom Blade Zero and Silent Hill: Townfall have `comments` and
  nothing else, because the two things a tool could be built on are not there.
  Achievements with a global unlock rate arrive when a game ships, which is
  what `completion-tracker` needs and what the other three released wikis got.

  The obvious remaining candidate is a **"will it run" requirements
  comparator**, and it cannot be built honestly: every one of the eight
  publishes a minimum and a recommended spec, but telling a reader whether
  their GTX 1650 clears a listed GTX 1060 needs a GPU performance ranking, and
  nobody publishes one this project may use. The only ordering actually sourced
  here is the one each publisher states inside its own listing — minimum below
  recommended, for that game. A comparator built on anything else would be this
  network inventing the figure its whole argument rests on not inventing.

  So: no tool, rather than a tool that guesses. `pnpm refresh` the week each
  launches is what changes this, and it changes it by itself — the achievement
  list arrives, `completion-tracker` goes on the Game record, and the rail
  derives the rest.

- **Perk time costs** — 0 of 40. `timeCostSegments` deliberately has no default,
  so these read as unknown rather than free.
- **Owner-supplied settings** that `pnpm check:launch` reports and no source can
  supply: a Search Console token per subdomain (each is its own property), an
  analytics ID per wiki, real contributors in place of the 36 placeholder
  authors, and the network's own name — it is still "Vellum", a working title.
  The **IndexNow key** is not one of these, and is worth knowing about because
  it looks like one: it is Site settings → SEO & analytics → IndexNow key,
  blank falls back to the key committed in `public/`, and `/<key>.txt` is
  answered from the database on all ten hosts rather than being a file —
  `src/lib/indexnow.ts`, the route at `src/app/api/indexnow/[key]/`, and the
  shape match in `proxy.ts`. **Publishing a page now announces it** — one URL,
  its own page on its own host, never the sitemap — behind six guards, of which
  the one worth knowing is that the discriminator is `NEXT_RUNTIME`: the `next`
  binary sets it and `tsx` does not, so every seed pass and every step of
  `pnpm db:reset` is silent by construction rather than by a flag somebody has
  to remember. `INDEXNOW_PING=off` returns to manual-only, and
  `docs/DEPLOY.md` section 6 states both of the old objections and what each
  guard does about them.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
