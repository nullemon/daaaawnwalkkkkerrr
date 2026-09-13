# Dawnwalker Guide

A guide, database and run planner for *The Blood of Dawnwalker*, built around
the mechanic the game is actually about: a budget of **480 time segments**.

Next.js 16 + Payload CMS 3 on libSQL. Every public page is prerendered to
static HTML; the admin at `/admin` is a full CMS.

---

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
| `pnpm seed` | Load/refresh seed content — idempotent, matches on slug |
| `pnpm test` | Run the run-checker unit tests |
| `pnpm generate:types` | Regenerate `payload-types.ts` after a schema change |

## The admin panel

`/admin`. Content is grouped by what it is for:

- **Run** — Quests, Court Activities, Endings. These drive the run checker.
- **World** — Regions, Courts, Characters, Enemies.
- **Character** — Skill trees, Perks, Items.
- **Content** — Mechanics, Guides.
- **Admin** — Corrections queue, Media, Users, Site settings.

Site settings hold the site name, nav, home-page copy, and the ad/analytics
switches, so none of that needs a code change.

### Two schema details that matter

**Quest relationships are load-bearing.** `prereqs`, `excludes` and
`requiredQuests` are the edges of the graph the run checker walks. Getting them
wrong produces confidently wrong answers, which is worse than no answer.

**"Cost confirmed" is not the same as "cost 0".** Leave it unticked unless a
source actually publishes a segment cost. Unticked means *unknown*, and the
checker reports totals containing it as a floor rather than a figure.

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

## Honest limitations

Read `docs/DATA.md` before trusting a number on this site. Short version: it
was compiled from public sources without access to the game, published
per-quest segment costs are not reliable enough to use, and the site says so
rather than guessing.
