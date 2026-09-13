# Dawnwalker Guide — working notes

A guide, database and run planner for *The Blood of Dawnwalker*, built around
the game's 480-segment time budget. Next.js 16 + Payload CMS 3 on libSQL.
Every public page prerenders to static HTML; `/admin` is a full CMS.

## Commands

```bash
pnpm install      # NOT npm — see gotchas
pnpm dev          # http://localhost:3000
pnpm build        # prerenders ~400 pages
pnpm test         # unit tests (30)
pnpm seed         # hand-written seed content, idempotent on slug
pnpm ingest       # ingest researched JSON from src/seed/raw/
pnpm db:reset     # delete the database and rebuild it from seed + raw
pnpm clean        # delete .next (devsafe does this, then starts dev)
pnpm assets       # attach images from assets/<collection>/<slug>.<ext>
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
  and failed with `ERR_PNPM_LOCKFILE_NOT_FOUND`. `pnpm run <name>` always
  reaches the script, but the plain form is what people type.
- **Font variables belong on `<html>`, not `<body>`.** The tokens that
  reference them are declared on `:root`; a custom property referencing an
  undefined custom property computes to guaranteed-invalid, which silently
  fell back every font on the site to Times New Roman for several commits.
- **Schema changes need the database rebuilt.** Production builds run with
  `push: false`, so a new field breaks the build with a missing-column error.
  `pnpm db:reset` — the database is fully reproducible from seed plus
  `src/seed/raw/`, by design.
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
- **`src/payload-types.ts` is generated and will block a pull.** Payload
  rewrites it on schema change and sometimes just on `pnpm dev`. Discard the
  local copy (`git checkout -- src/payload-types.ts`) rather than merging it.
  `.gitattributes` pins line endings to LF so this stops being a whole-file
  diff on Windows.
- **Grid and flex children default to `min-width: auto`**, so a wide table
  inside an `overflow-x` container drags the page sideways on a phone. The
  shrink-fix is at the end of `globals.css`; keep it.

## Outstanding

- **Per-quest segment costs** — only 15 of 93 have one. Biggest single gap;
  needs the game or a source nobody has published yet.
- Common/rare gear, 12 of 28 bestiary entries, most recipe names.
- Xanthe's 15th Court Activity — never named in any source found.
- **Images.** Records have image slots and fall back to the icon set. See
  `docs/ASSETS.md`.
- **Legal details are stand-ins.** Site settings → Legal & contact ships with a
  fictional name, an `example.com` address and Royal Mail's documentation
  postcode, so the pages read as finished. `legalProvisional` is ticked, which
  makes privacy, terms and contact render a loud warning and mark every value
  in red. Replace the details and untick it — that one switch is what publishes
  them as real. `isProvisional` in `src/lib/legal.ts` is the backstop if
  somebody unticks it with a placeholder still in place.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
