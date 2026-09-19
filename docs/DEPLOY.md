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
participate in IndexNow.** For Google the sitemap in Search Console is the only
channel, and that is the next section.

### Google Search Console

```bash
pnpm seo:search-console
```

Prints every property to add, in the order to add them, with the sitemap URL to
submit for each and the admin URL of the box its token goes into. It reads the
same pass `pnpm check:launch` does, so "this wiki has a token" is answered once
and not twice — see the note in `CLAUDE.md` about two implementations of one
finding.

**One property per origin**: the apex, every wiki, and the companies and people
hosts. That is eleven today. Google treats a subdomain as a separate site, so
the network's token does not verify any of them — which is the cost of the
subdomain decision, accepted knowingly. See `docs/NETWORK.md`.

Which methods this deployment can actually use, which is the part worth knowing
before opening Google's verification dialog:

- **HTML tag** — supported, and what the admin is built for. The content value
  goes in **Site settings → SEO & analytics** for the apex, or on the Game for a
  wiki; an empty field on a Game inherits the network's. It is served from the
  database by `verificationMetadata` in `src/lib/tags.ts`, so nothing is
  deployed and nothing is committed.
- **DNS TXT** — supported, and the shortest path by a distance. One TXT record
  at the apex registers a *Domain* property, which covers every label under it
  including wikis that do not exist yet, with no token pasted anywhere. It is
  set at the registrar, so nothing in this repository can check it.
- **HTML file** — *not available.* Google asks for `/google<token>.html` at the
  root, and `proxy.ts` rewrites any path whose first segment is not in
  `PASS_THROUGH` onto a game prefix. The file 404s on every host. This is the
  same trap the IndexNow key file fell into, and the reason that key is answered
  from the database by a route rather than being a file.

**`companies.<domain>` and `people.<domain>` serve no verification tag at all.**
Their layouts never call `verificationMetadata`, so there is nothing for the
network token to reach them through — pasting one in and then choosing "HTML
tag" for those two hosts will never verify. Use a Domain property, or have those
two layouts emit the tag. `pnpm check:launch` reports it and
`pnpm seo:search-console` prints it beside the property list.

### The IndexNow key

A key is already generated and committed at `public/<key>.txt`, so this works
with no setup. The key is **published by design, not a secret**: the file being
reachable is the whole of the proof that the key is yours.

To use your own instead: **Site settings → SEO & analytics → IndexNow key.**
Any 8–128 characters of `a–z A–Z 0–9 -`; 32 random hex characters is the usual
shape, and Bing Webmaster Tools will generate one. A malformed key is refused
in the form rather than accepted and rejected later — IndexNow answers a bad
submission with HTTP 422 and a body that says only that verification failed,
which does not distinguish a malformed key from an unreachable file.

**Blank means "use the key that shipped"**, never "serve nothing" — the same
rule every editable field follows, see `docs/COPY.md`. The full order is
settings, then `INDEXNOW_KEY` in the environment, then the committed file, and
`resolveIndexNowKey` in `src/lib/indexnow.ts` is the one place that decides it.

Rotating is typing a new key and saving. There is nothing to deploy, because
`/<key>.txt` is not a file lookup: `proxy.ts` matches the *shape*
`<8–128 chars>.txt` on any host and rewrites it to
`src/app/api/indexnow/[key]/route.ts`, which serves whichever key is live as
`text/plain` and **404s for every other**, including the one that was live
before a rotation. A route that echoed back any key it was asked for would
confirm a key anybody guessed, which would let a third party submit URLs on
this network's behalf by pointing `keyLocation` at us.

That exemption is also the bug it was written for. Nothing exempted the key
file before, so a wiki host rewrote `/<key>.txt` into `/<game>/<key>.txt` and
404ed, and the apex redirected it to `<key>.txt.<domain>` because an
unreserved first segment is read as a game slug. Every submission the tool had
ever made would have failed verification.

`pnpm indexnow` now **asks every host for the key file before it sends
anything**, and sends nothing if any of the ten does not answer with the key.
That is the difference between a sentence naming the host and a 422 naming
nothing.

### Publishing a page announces it

The site pings IndexNow when a record is published: **one URL, the page of the
record that was published, on its own wiki's host.** Not the sitemap, not the
section index, not the hub.

This used to say that nothing triggered IndexNow automatically and that this
was deliberate, and the two arguments recorded against a trigger were real. So
the ping is the answer to both of them rather than a decision to ignore them.

**"A save hook would submit the whole sitemap for a typo fix."** It would, if
it submitted the sitemap. IndexNow is priced in trust rather than in requests,
and re-submitting unchanged URLs is the documented way to get a key throttled,
so what protects the key is not politeness — it is four refusals, each of
which drops the submission rather than delaying it, and each of which says so
once:

| | |
| --- | --- |
| **Only the serving site pings** | A seed run publishes thousands of records and announces none of them. The discriminator is `NEXT_RUNTIME`, which the `next` binary sets for `dev`, `build` and `start` and which `tsx` does not have — so `pnpm seed`, `pnpm ingest` and every pass in `pnpm db:reset` are silent by construction, not by a flag somebody has to pass. A **standalone** build started as `node server.js` has no `next` binary in the chain and so announces nothing until its environment sets `NEXT_RUNTIME=nodejs` itself. That is a guard failing in the safe direction; if you want the ping on such a deployment, set the variable there and nowhere a seed script will see it. |
| **Only a real public origin** | No localhost, no unset `NEXT_PUBLIC_SITE_URL`. |
| **A burst ceiling** | More than 25 URLs in one ten-second batch is a script rather than an editor. The batch is dropped **whole** — sending an arbitrary 25 of 400 is a submission that looks successful and announced the wrong pages — with a line saying to run `pnpm indexnow -- --send` after the deploy. |
| **An hourly ceiling** | 200 URLs an hour, for the slow version of the same thing. |

Publishes are also coalesced: twenty pages in a minute are one submission.

**"Every public page is prerendered, so a saved record is not live until the
next build."** Also true, and why **nothing is announced without asking the
host for the URL first**. A page that answers 404 because the build has not
run yet is not submitted — announcing it would invite a crawler to fetch a 404
and remember it. A page that answers 200 is a real page whose text may be one
revision behind, which is a re-crawl doing what a re-crawl is for. The key
file is checked on that host too, once per process, because an unreachable
`/<key>.txt` is the one thing that makes IndexNow refuse a submission and it
says so only as a 422 naming nothing.

Nothing is retried and nothing is queued across a restart. Everything the ping
might miss, `pnpm indexnow -- --send` submits in full, with somebody watching —
that tool is still the one to run after a deploy, and it is still a dry run by
default.

To turn the ping off and go back to manual-only, set `INDEXNOW_PING=off` in the
environment. There is no value that forces a submission past the checks above;
a switch that could would be a switch that submits `http://localhost:3000/…`
to Bing.

The logic and the ceilings are `src/lib/indexnow-ping.ts`, which imports
nothing and is unit-tested in both directions; the half that reads the database
and makes the requests is `src/lib/indexnow-publish.ts`, attached to every
collection with a public page by `withPublishPing` in `payload.config.ts`.

---

## Analytics: the one scheduled job on this deployment

`/admin1621/analytics` counts page views itself. Nothing external is involved and
there is nothing to sign up for - the switch is Site settings -> SEO & analytics
-> "Measure page views on this network", and it is on.

One thing wants a scheduler:

```
pnpm analytics:roll
```

It summarises each UTC day into `analytics-daily` and deletes individual page
views older than 62 days. Run it once a day, any time; it is idempotent and a
missed run is caught up by the next one.

**It is not a hard requirement, and that is deliberate.** `/api/hit` runs the
same pass after a response, at most once an hour per process, and the analytics
view re-summarises today whenever somebody opens it. A deployment with no cron
keeps working. What a real scheduler buys is a site that is quiet for a week
still having its history rolled up before the retention boundary reaches it.

The screen says when the summaries were last written, and names any day that
has page views on disk and no summary - so a scheduler that has stopped is
visible on the page rather than being something you find out about in two
months.

Nothing here needs a second database, a queue, or a key. The rows are in the
same libSQL database as the content.

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

**Setup, once.** In `.env`:

```bash
REMOTE_URL=https://your-domain.com
```

**Then open a session.** A session is asked for from the terminal and approved
by you in the admin, after comparing a sixteen-character code printed in both
places, and you tick what that one session may do — create pages but not
delete, say. It expires, it is revocable in one click, and every write it makes
is in the Remote log with what changed. `docs/REMOTE.md` is the whole design;
the short version:

```bash
pnpm remote connect                            # or --can read,create,update
#   → prints a code, waits. Approve it at /admin1621/remote.
pnpm remote status
pnpm remote disconnect
```

Sessions need `REMOTE_CONTROL_SECRET` set on the deployment and the box ticked
at **Network → Remote control**. Without both, `/api/remote/*` answers 404 and
there is nothing to use.

**About `REMOTE_API_KEY`.** It is the older way in — a per-user key from
**Users → your account → "Enable API Key"** — and on a deployment that has
remote control it is **refused**, by the server, with a sentence. An API key
is unscoped, never expires and its writes are not in the Remote log, so while
one worked there would be a way around every per-session capability you tick.
It still works exactly as it did on a deployment that has never set
`REMOTE_CONTROL_SECRET` — a staging site, a local copy. `docs/REMOTE.md` has
the argument and the way back.

Whichever credential is in play, never paste it into a chat: every tool here
reads `.env`, which is gitignored, so whoever is doing the work never needs to
see it.

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

A command the session was not approved for is refused by the server, naming
what the session *may* do — `pnpm remote status` prints the same list. Widening
it is another `pnpm remote connect`, because a grant that could be changed
after the fact would not be a grant.

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
