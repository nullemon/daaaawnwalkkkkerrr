# Dawnwalker Guide

A guide, database and run planner for *The Blood of Dawnwalker*, built around
the mechanic the game is actually about: a budget of **480 time segments**.

Next.js 16 + Payload CMS 3 on libSQL. Every public page is prerendered to
static HTML; the admin at `/admin` is a full CMS.

---

## Working on this from your own machine

Claude Code runs locally — CLI, desktop app, or IDE extension — which removes
two limits the cloud session has: it can read files on your disk, and it is
not behind a network policy that blocks games-media sites. See
`docs/LOCAL-SETUP.md`. `CLAUDE.md` is picked up automatically, so a local
session starts with the whole project in hand.

## Running it locally

```bash
pnpm install          # npm has a resolver bug on this dependency tree — use pnpm
cp .env.example .env  # then set PAYLOAD_SECRET
pnpm seed             # creates the admin user and loads the researched content
pnpm dev              # http://localhost:3000
```

The seed prints the admin login it creates. Override it before running:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a real password' pnpm seed
```

**Change that password immediately** — the default is a placeholder, and the
seed only creates a user when none exists, so it will not overwrite yours later.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build (prerenders every page) |
| `pnpm start` | Serve the production build |
| `pnpm seed` | Load/refresh hand-written seed content — idempotent, matches on slug |
| `pnpm import` | Ingest researched JSON from `src/seed/raw/` — validates and rejects uncited records |
| `pnpm assets` | Attach images in bulk from `assets/<collection>/<slug>.<ext>` (`--force` to replace) |
| `pnpm assets:match <dir>` | Match extracted game files to records by filename; `--apply` stages them into `assets/` |
| `pnpm test` | Run the run-checker unit tests |
| `pnpm generate:types` | Regenerate `payload-types.ts` after a schema change |

## The admin panel

`/admin`. Content is grouped by what it is for:

- **Run** — Quests, Court Activities, Endings. These drive the run checker.
- **World** — Regions, Courts, Characters, Enemies.
- **Character** — Skill trees, Perks, Items, Builds.
- **Content** — Mechanics, Guides.
- **Admin** — Corrections queue, Media, Player accounts, Users, Site settings.

Fill in **Site settings → Legal & contact** before launch. The privacy, terms
and contact pages render a loud in-page warning for every detail left unset,
because a privacy policy has to name who is actually responsible for data.

Site settings hold the site name, nav, home-page copy, and the ad/analytics
switches, so none of that needs a code change.

### Two schema details that matter

**Quest relationships are load-bearing.** `prereqs`, `excludes` and
`requiredQuests` are the edges of the graph the run checker walks. Getting them
wrong produces confidently wrong answers, which is worse than no answer.

**"Cost confirmed" is not the same as "cost 0".** Leave it unticked unless a
source actually publishes a segment cost. Unticked means *unknown*, and the
checker reports totals containing it as a floor rather than a figure. The same
rule governs a perk's segment cost: blank means nobody published it, and the
field deliberately has no default — a default would turn "unknown" into a
number the site cannot stand behind.

### Two auth collections

`users` are editors and own the admin panel. `players` are readers with an
optional account that syncs their run. Payload's default write access is *any
authenticated user*, so every content collection states its write rules
explicitly via `isEditor` in `src/fields/shared.ts`. If you add a collection,
give it `publicRead` or equivalent — inheriting the default would let any
reader who signs up edit your content.

## Deploying

The database is libSQL, so the same adapter runs a local file in development
and a hosted database in production — deploying is a change of environment
variable, not a change of code.

**Vercel + Turso** (simplest):

1. Create a Turso database, take its URL and auth token.
2. Set on Vercel: `DATABASE_URI=libsql://…`, `DATABASE_AUTH_TOKEN=…`,
   `PAYLOAD_SECRET=…`, `NEXT_PUBLIC_SITE_URL=https://yourdomain`.
3. Deploy, then run the seed once against the remote database.

**A VPS** works too: `pnpm build && pnpm start` behind a reverse proxy, with
`DATABASE_URI=file:./dawnwalker.db` on a persistent volume.

Media uploads are written to disk, so on serverless hosting point Payload at
object storage (`@payloadcms/storage-s3` or similar) before relying on uploads.

## Testing

`pnpm test` covers the clock arithmetic and the reachability solver — 25 tests
over transitive prerequisites, cycles in the data, exclusion lock-outs,
best/worst-case affordability, and unknown costs. The solver is deliberately
free of Payload types so it can be tested without a database.

## Images and data collection

`docs/ASSETS.md` covers where to source game art, what sizes to use, and the
legal position. Drop files into `assets/<collection>/<slug>.<ext>` and run
`pnpm assets` — the folder picks the collection, the filename picks the record.
Until a record has an image the site falls back to its own icon set, so a
missing image never leaves a hole.

Two browser console tools live in `tools/`:

- `grab-images.js` — find every image on a page, name them, and download one
  zip already laid out for `pnpm assets`. Zips in the page; nothing uploaded.
- `extract.js` — pull a table off a page into our JSON schema, ready for
  `pnpm import`. See the end of `docs/DATA.md` for what it is and is not for.

## Honest limitations

Read `docs/DATA.md` before trusting a number on this site. Short version: it
was compiled from public sources without access to the game, published
per-quest segment costs are not reliable enough to use, and the site says so
rather than guessing.
