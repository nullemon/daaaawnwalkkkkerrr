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
pnpm db:reset     # seed + ingest + attach images. Destroys and rebuilds.
pnpm verify       # 422 records, 0 with no game
pnpm build        # ~600 pages
```

`pnpm verify` is not optional ceremony. A record with no game does not error —
it silently never appears on any page. Run it after any import.

## 5. Tell the search engines

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
the proof that the key is yours. It is served by every host because there is
one deployment.

---

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
