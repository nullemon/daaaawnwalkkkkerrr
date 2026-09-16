# Putting the network live

What has to be true for seven subdomains to work, in the order you will hit it.

Written 15 September 2026.

---

## 1. Buy a domain

Anything. Nothing in the code names it — the origin comes from one environment
variable, and every wiki's host is derived from it.

The network is one deployment, not seven. All seven wikis and the hub are the
same application, and `src/proxy.ts` decides which one a request is for by
reading the Host header.

## 2. Point DNS at the deployment

Two records, and the wildcard is the one that matters:

| Type | Name | Value |
| --- | --- | --- |
| A or CNAME | `@` | your host |
| CNAME | `*` | your host |

The wildcard is what makes `dawnwalker.example.com` resolve without a DNS entry
per game. Adding the eighth wiki is then a row in the admin, not a DNS change
and a redeploy.

**Your host must also issue a wildcard TLS certificate** (`*.example.com`).
Vercel, Netlify and Cloudflare all do this on request; a plain VPS with certbot
needs `--preferred-challenges dns` because a wildcard cannot be validated over
HTTP. Without it every subdomain throws a certificate warning, which readers
read as "this site is compromised", not "the operator forgot a flag".

## 3. Set the environment

```bash
NEXT_PUBLIC_SITE_URL=https://example.com   # no trailing slash, apex only
PAYLOAD_SECRET=<long random string>
DATABASE_URI=libsql://<your-turso-db>      # file:./dawnwalker.db in development
DATABASE_AUTH_TOKEN=<turso token>
```

`NEXT_PUBLIC_SITE_URL` is load-bearing in four places, so it is worth
understanding rather than copying:

- `proxy.ts` uses it to work out which part of a Host header is the game. It is
  read from the environment rather than inferred from the request **on
  purpose** — inferring the domain from the Host header is how an application
  becomes routable as whatever domain an attacker sends.
- `gameUrl()` builds each wiki's canonical origin from it.
- `hub()` builds links from a wiki back to the hub's pages, in client
  components too, which is why it is `NEXT_PUBLIC_`.
- `robots.txt` and `sitemap.xml` use it to tell a wiki from the apex.

Set it wrong and the symptom is subtle: pages render, but canonicals and
sitemaps point at the wrong host.

## 4. Build and seed

```bash
pnpm install
pnpm db:reset     # eighteen passes: seed, ingest, companies, four guide generators, images
pnpm verify       # 1,378 records, 0 with no game
pnpm check:launch # what still wants a decision. Nothing here blocks a launch
pnpm build        # ~1,640 pages
```

`pnpm db:reset` is the whole content pipeline in one command, and the order in
it matters: the guide generators read records the entity pass writes, and
`seed:cite` runs last because it looks for guides with no source. If you add a
generator, add it to that chain too — a pass that only ever runs by hand is a
pass that is missing the next time somebody rebuilds from scratch.

`pnpm verify` is not optional ceremony. A record with no game does not error —
it silently never appears on any page. Run it after any import.

## 5. Name the network and set the tags

**Admin → Site settings → Identity.** The network ships as "Vellum", which is
a working name and nothing depends on it. Change it here and every wiki picks
it up — the footer, the hub title, the open-graph site name.

**Admin → Site settings → SEO & analytics.** Network-wide defaults for the
apex domain.

**Admin → Network → Games → *each game* → Search engine verification.** This
is the part that is easy to miss and expensive to miss. Each wiki is its own
origin, so Search Console treats it as a separate property and issues a
separate verification token. The network's token will not verify a subdomain.

The same screen holds that wiki's analytics. Any field left empty inherits the
network value, so if one GA4 property covers everything, set it once on Site
settings and leave the games blank.

The dashboard flags both: a live wiki with no verification token and no
analytics shows under "Needs attention", because neither failure is visible on
the site itself.

## 6. Tell the search engines

```bash
pnpm indexnow            # dry run: prints the hosts and URL counts
pnpm indexnow -- --send  # submit
```

That reaches Bing, Yandex, Seznam, Naver and Yep. **Google does not
participate in IndexNow.** For Google, add each host to Search Console as its
own property and submit `https://<host>/sitemap.xml`. Eight properties, because
Google treats a subdomain as a separate site — which is the cost of the
subdomain decision, accepted knowingly. See `docs/NETWORK.md`.

The IndexNow key is already generated and committed at `public/<key>.txt`. It
is published by design, not a secret; the file being reachable is the whole of
the proof that the key is yours.

It is served by every host because there is one deployment — **but only since
`proxy.ts` learned to leave it alone**. Nothing exempted it before, so a wiki
host rewrote `/<key>.txt` into `/<game>/<key>.txt` and 404ed, and the apex
redirected it to `<key>.txt.<domain>` because an unreserved first segment is
read as a game slug. Every submission would have failed verification. The
proxy matches the key by shape now (8–128 hex characters and `.txt`), so
rotating it is dropping a new file in `public/` and deleting the old one.

---

## Where the data comes from, and what is off limits

Worth knowing before adding a ninth wiki, because the question comes up every
time and the answer is not "whatever is on the internet".

| Source | Terms | Used |
| --- | --- | --- |
| Publisher store pages | First-party facts | Yes — release, editions, requirements, achievements |
| Fandom | robots.txt `Allow: /api.php?`, CC BY-SA | Yes — characters, items, bosses, locations |
| Wikipedia | No mining or AI prohibition, CC BY-SA 4.0 | Yes — production credits, engine, composer |
| Google autocomplete | Open | Yes — what to write about |
| **Fextralife / Valnet** | robots.txt prohibits automated retrieval outright, bans text and data mining, blocks `/wiki/*` | **No** |
| **PCGamingWiki** | Permissive robots.txt, but the server answers **403 to any client that identifies itself** | **No** |

The last two are the ones people ask about. Fextralife's prohibition is
unconditional — being non-commercial does not lift it, because commercial use
is only item (4) in a list that also bans text and data mining and dataset
creation. PCGamingWiki's robots.txt reads permissively and its server does not
behave that way: the same URL returns 142 KB to a browser and a 403 to an
honest client. Getting into either would mean disguising the request, which is
not something to do quietly.

Every record says where it came from and under which licence. `pnpm
check:launch` reports anything that does not.

## Keeping the game data current

```bash
pnpm refresh
```

One command, and it does all of it: re-read every store page, re-read
Wikipedia's credits, re-harvest the community wikis with their images, re-run
the search-query sweep, rewrite every generated page, and rebuild the icons.
Safe to repeat — everything is keyed on (game, slug), so it updates rather
than duplicates.

**Run it the week each game launches.** That is not housekeeping, it is the
whole plan for the wikis that are currently thin.

Four of the eight cover games that are not out yet:

| Wiki | Releases | Records today |
| --- | --- | --- |
| Control Resonant | 24 Sep 2026 | 7 |
| Silent Hill: Townfall | 23 Sep 2026 | 11 |
| Phantom Blade Zero | 28 Oct 2026 | 11 |
| Gears of War: E-Day | 6 Oct 2026 | 26 |

They are thin because nothing exists to put on them. There is no item list for
a game nobody has played, and the community wikis for these titles are
near-empty too. Two things change on launch day and both are automatic:

- **The achievement list appears.** Developers publish it at release, and it is
  typically forty to sixty pages. That is what took Onimusha from 34 records to
  86 and Zero Company to 58.
- **The community wikis fill up.** The harvester reads them again and picks up
  every character, weapon and location added since.

So the honest position is that four wikis are staged rather than finished, and
`pnpm refresh` is the thing that finishes them. Put a reminder in a calendar
for each of those four dates.

## Adding pages to a live site from a terminal

Once the network is deployed, adding a page normally means opening the admin
in a browser. That is right for writing prose and wrong for everything else —
a batch of forty generated guides, one correction applied across eight wikis,
a refresh the week a game ships. Those are terminal jobs.

`pnpm remote` talks to the running site's own REST API over HTTPS. No SSH, no
database credentials, no redeploy, and it behaves identically against
localhost and production.

**Setup, once.** In the admin: **Users → your account → tick "Enable API Key"
→ Save**, and copy the key it generates. Then in `.env`:

```bash
REMOTE_URL=https://your-domain.com
REMOTE_API_KEY=<the key>
```

The key carries exactly that user's permissions — an editor assigned to one
wiki cannot write to another with theirs, because the same access rules run.
Revoking one is unticking the box. Never commit it; `.env` is gitignored.

**Put the key in `.env` yourself rather than pasting it into a chat.** Every
tool here reads it from there, so whoever is doing the work never needs to see
it — and a key that was never in a transcript is one you never have to wonder
about. If one does get pasted somewhere, untick the box and tick it again: the
old key stops working immediately.

**Then:**

```bash
pnpm remote whoami                      # confirm which site and which account
pnpm remote list guides --game onimusha-way-of-the-sword
pnpm remote get guides all-items --game onimusha-way-of-the-sword
pnpm remote create guides ./page.json --game onimusha-way-of-the-sword
pnpm remote update guides all-items ./patch.json --game onimusha-way-of-the-sword
pnpm remote delete guides old-slug --game onimusha-way-of-the-sword --yes
```

`create` and `update` take a JSON file shaped like the record — the same
fields the admin form shows. `pnpm remote get` on an existing page prints one
to copy.

This is also how a future session at a terminal adds content to the live site
without touching the repository.

## Adding the eighth wiki

No deploy, no DNS change:

1. **Admin → Network → Games → Create.** Title, slug, status `building`.
   The slug becomes the subdomain, so choose it once — changing it later breaks
   every indexed URL on that wiki.
2. Write content. Every record asks which game it belongs to.
3. Flip status to `live` when it is worth reading.

A slug that collides with one of the hub's own paths (`about`, `authors`,
`wikis`, `privacy`…) is refused at the point of entry, because otherwise the
game would simply be unreachable with nothing anywhere saying why. The reserved
list lives in `proxy.ts` and `Games.ts` imports it, so the two cannot drift.

`status` does real work:

| Status | Effect |
| --- | --- |
| `planned` | 404s. Not in the directory. |
| `building` | Live, listed, and labelled "In progress" on its card. |
| `live` | Normal. |
| `archived` | Stays online, stops being updated. |

## Before you call it public

- **Site Settings → Legal & contact.** It ships with stand-in details and
  `legalProvisional` ticked, which makes privacy, terms and contact render a
  loud warning. Replace the details and untick it — that switch is what
  publishes them as real.
- **Change the seeded admin password.** `pnpm seed` creates
  `admin@example.com` with a default password when no user exists.
- **Editors.** Admin → Users. An editor with games assigned can only write to
  those; empty means all of them.

## Local development

`http://localhost:3000` is the hub. A wiki is `http://dawnwalker.localhost:3000`
— Chrome and Firefox resolve any `*.localhost` to 127.0.0.1 with no hosts-file
entry, so development exercises the same host-routing code path production
does.

Browsing the internal path form (`localhost:3000/dawnwalker/quests`) mostly
works, but root-relative links and `/search-index.json` will 404, because those
are written for the subdomain.
