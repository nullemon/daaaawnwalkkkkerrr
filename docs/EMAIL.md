# Email

Everything the network sends, how to point it at a provider, and what to look
at when messages stop arriving.

Written 17 September 2026.

The design goal is one sentence: **the owner's whole job is pasting keys into
`.env`.** No code is edited to change provider, nothing is hardcoded, and
anything that cannot work refuses to start rather than accepting a message and
dropping it.

That last part is the whole point. An email is the purest form of the failure
this project keeps meeting — `sendEmail` resolves, the API returns 200, the
page says "check your inbox", and nothing arrives, with nothing in any log
because nothing failed. So every problem that can be found without a network
round-trip is found at boot, named by its variable, and the app does not start.

---

## The short version

```bash
# .env
EMAIL_PROVIDER=mailgun
EMAIL_FROM_ADDRESS=noreply@mg.example.com
EMAIL_FROM_NAME=Vellum
EMAIL_REPLY_TO=hello@example.com
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=mg.example.com
MAILGUN_REGION=us          # or eu — read the note, it is not cosmetic
```

```bash
pnpm email:test you@yourdomain.com
```

That sends one real message through whatever is configured and prints the
provider's own answer, verbatim. It exits non-zero if anything went wrong —
**including** when the provider is still `console`, because "printed to a
terminal" is not "delivered" and a script that called it success would be the
exact thing this is built to catch.

---

## The variables

Every one of these is in `.env.example`, commented, in this order.

| Variable | Applies to | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | all | `console` (default), `mailgun`, `resend`, `smtp` |
| `EMAIL_FROM_ADDRESS` | all but console | **Required.** Must be verified at the provider |
| `EMAIL_FROM_NAME` | all | Optional. No name sends a bare address |
| `EMAIL_REPLY_TO` | all | Optional |
| `EMAIL_OVERRIDE_RECIPIENT` | all | Staging only. Redirects every message to one inbox |
| `MAILGUN_API_KEY` | mailgun | |
| `MAILGUN_DOMAIN` | mailgun | The sending domain, e.g. `mg.example.com` |
| `MAILGUN_REGION` | mailgun | `us` (default) or `eu`. See below |
| `RESEND_API_KEY` | resend | Starts `re_` |
| `SMTP_HOST` | smtp | |
| `SMTP_PORT` | smtp | 587 by default |
| `SMTP_SECURE` | smtp | Derived from the port unless set |
| `SMTP_USER` / `SMTP_PASSWORD` | smtp | Both, or neither |

`console` is the default so a fresh clone runs with no credentials at all.
Nothing else defaults: a provider named without its key is a boot failure.

### The from-address is not the contact address

`EMAIL_FROM_ADDRESS` has to be an address the provider has been shown to own —
typically at the sending subdomain (`noreply@mg.example.com`), because that is
what the DNS records set up. The contact address readers write to
(`hello@example.com`) usually lives at the apex and is usually *not* accepted
as a sender. Put the contact address in `EMAIL_REPLY_TO`.

An address on `example.com` is refused outright at boot. It is syntactically
valid, so every provider accepts the API call — and then the message bounces
into a domain IANA reserved for documentation, where nobody is looking. That
check is `isProvisional` in `src/lib/legal.ts`, the same one the privacy policy
uses on the other stand-in values.

### Changing the sender without a redeploy

**Admin → Site settings → Legal & contact** carries three fields: sender name,
sender address, and reply-to. Filled in, they win over the environment; blank,
the environment's value is used. They are there because the name in somebody's
inbox is reader-visible copy, and `docs/COPY.md`'s rule is that anything a
person would want to reword is a field.

The environment variable is still required, and is the floor: it is what
guarantees the app boots with a working sender even if the database cannot be
read. The admin field is an override, validated at the point of entry — a
stand-in address is refused by the form, not accepted and bounced.

Changes take effect within a minute. The sender is cached that long so a burst
of password resets is one database query.

---

## One worked example per provider

### Mailgun

1. Add a sending domain in the Mailgun dashboard — `mg.example.com` rather
   than `example.com`, so the DNS records do not collide with your normal mail.
   **Note which region you pick.**
2. Add the TXT, MX and CNAME records it gives you, and wait for it to say
   Verified.
3. **Settings → API keys** for the key.

```bash
EMAIL_PROVIDER=mailgun
EMAIL_FROM_ADDRESS=noreply@mg.example.com
EMAIL_FROM_NAME=Vellum
EMAIL_REPLY_TO=hello@example.com
MAILGUN_API_KEY=0f3d1b2c-...
MAILGUN_DOMAIN=mg.example.com
MAILGUN_REGION=us
```

**The region is the one that catches people.** Mailgun runs two separate
stacks, US and EU. They share no domains, no keys and no API host: `us` is
`api.mailgun.net`, `eu` is `api.eu.mailgun.net`. A domain created in the EU and
addressed at the US endpoint does not say "wrong region" — it answers **401**,
which reads as a bad key and gets debugged as one for an afternoon. If you
ticked EU when creating the domain, this must say `eu`.

Mailgun is the one provider here talking to an HTTP API written for this
repository rather than through a Payload package, because Payload ships no
Mailgun adapter and the obvious substitute is worse: Mailgun's SMTP endpoint
wants the **per-domain SMTP password**, not the API key, so `smtp` with an API
key in `SMTP_PASSWORD` is an authentication failure with no explanation. If
SMTP credentials are what you have, that route works — see the SMTP table
below.

### Resend

1. Add and verify a domain at resend.com.
2. **API Keys → Create**, with Sending access.

```bash
EMAIL_PROVIDER=resend
EMAIL_FROM_ADDRESS=noreply@example.com
EMAIL_FROM_NAME=Vellum
RESEND_API_KEY=re_...
```

A Resend key starts `re_`. A key starting `whsec_` is the webhook signing
secret from the next screen along; the app refuses to start on it rather than
letting you find out at the first password reset.

### SMTP — everything else

The escape hatch, and the most valuable one after Mailgun, because it covers
every provider not named above and a relay on your own box.

```bash
EMAIL_PROVIDER=smtp
EMAIL_FROM_ADDRESS=noreply@example.com
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
```

| Provider | Host | Port | Username | Password |
| --- | --- | --- | --- | --- |
| Postmark | `smtp.postmarkapp.com` | 587 | the server API token | the same token |
| SendGrid | `smtp.sendgrid.net` | 587 | literally `apikey` | the API key |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 | SMTP username | SMTP password |
| Zoho | `smtp.zoho.com` | 465 | the mailbox | an app password |
| Mailgun | `smtp.mailgun.org` (`smtp.eu.mailgun.org` in the EU) | 587 | `postmaster@<domain>` | the domain's SMTP password |
| Fastmail | `smtp.fastmail.com` | 465 | the mailbox | an app password |

Amazon SES SMTP credentials are **not** your AWS access key; SES generates a
separate pair. Zoho and Fastmail want an app password, not the account
password, if two-factor authentication is on — which it should be.

`SMTP_SECURE` is derived from the port when it is not set: `true` on 465, which
is implicit TLS, and `false` everywhere else, which means STARTTLS. Set it by
hand only for a relay that disagrees. Getting the pair wrong is another quiet
one — `secure: false` against port 465 does not error, it sits there until the
connection times out, because the server is waiting for a TLS handshake the
client is waiting to be invited to.

**SMTP is dialled at boot, and a refused connection stops the app starting.**
That is deliberate and it is not what the underlying library does:
`@payloadcms/email-nodemailer` runs the same check, catches the error and logs
it, so bad credentials boot clean and fail on the first password reset a
fortnight later. The cost is that an unreachable relay fails `pnpm build`,
which is the right moment to find out.

### console

The default, and the behaviour before any of this existed. Every message is
printed and discarded.

It prints more than Payload's own console adapter does: the sender, the
recipient, the subject, and **every link in the body**. In development the only
thing anybody wants out of a password-reset email is the link, and having to
dig it out of a database column is why nobody ever tests the flow.

---

## What the site actually sends

Today, one thing: **password reset for editor accounts** (`users`), triggered
from the admin's "Forgot password" link. That is it. There is no newsletter, no
contact-form relay, no moderation notification.

Two consequences worth knowing before you attach a real provider.

### The reset link is built here, not by Payload

Payload composes that URL from `config.serverURL`. This config deliberately
does not set one: the admin answers on all ten hosts (the hub, eight wikis,
`companies` and `people`), and pinning `serverURL` would make the admin's own
API calls cross-origin on nine of them. With it unset, Payload falls back to
the Host header, checks it against the CORS/CSRF allowlist, finds no allowlist
configured, and returns an empty origin — so the link in the email would have
been the bare path `/admin/reset/<token>`, which is not a link at all in a mail
client.

Nobody had ever seen that, because there was no adapter to deliver it. So
`src/collections/Users.ts` builds the URL itself, against `NEXT_PUBLIC_SITE_URL`
— the apex, which is the one host the link is always right for.

The same collection is why the message says nothing about any one game. This
email reaches editors of all eight wikis, and a sentence about one game in
shared code is on every page of all of them; an inbox is no different. The
network's name comes from Site settings, and if it cannot be read the sentence
drops the name rather than inventing one.

### Reader accounts cannot reset a password, and that is a gap

`players` — the optional reader accounts — has no forgot-password flow.
`AccountPanel` offers sign in and register and nothing else. Payload still
exposes `POST /api/players/forgot-password` whether anything links to it or
not, and if it is reached the message it composes points at
`/admin/reset/<token>`: the *editor* admin, whose reset view resolves tokens
against `users`. A reader following it would be told the token was invalid, on
a page they cannot sign into.

This was harmless while nothing was delivered. With a provider attached it is a
real message with a dead link. Finishing it needs an `/account/reset` page and
a template on the collection; until somebody builds both, the note in
`src/collections/Players.ts` says so rather than half-building it.

Also missing, and listed here so nobody assumes otherwise: the corrections and
requests queues send no notification. `pnpm check:launch` and the admin
dashboard are how they get seen.

---

## When mail silently stops arriving

In this order, because each step rules out the one after it.

**1. Is the provider still the one you think?**

```bash
pnpm email:test you@yourdomain.com
```

The first thing it prints is the resolved configuration — provider, sender,
domain, region, and which credentials are set (lengths only, never values). A
deployment that lost its environment falls back to `console`, which prints and
discards, and the only symptom is silence. This is the step that catches it.

**2. Did the provider accept it?**

The script prints the provider's own error text, unedited, because "Domain not
found" and "Invalid API key" are different afternoons. On Mailgun a 401 or 404
also prints the region and domain it used, since the wrong region is that same
401.

**3. Accepted is not delivered.** A provider can accept a message and then
bounce it, or suppress it because a previous message to that address bounced.
Only the provider's own log says which:

- Mailgun → **Sending → Logs**, and check the region selector matches
  `MAILGUN_REGION`. The other region's log is empty and looks like nothing was
  sent.
- Resend → **Emails**.
- Postmark/SendGrid/SES → Activity, Email Activity, and the configuration set's
  event destination respectively.

**4. Suppression lists are the usual answer to "it worked last week".** One
hard bounce — a typo'd address, a mailbox that filled up, a test to
`@example.com` — and the provider stops sending to that address, silently and
for good, until you remove it from the suppression list by hand. Nothing in
this codebase can see that list.

**5. Check DNS is still verified.** SPF, DKIM and DMARC records get moved by
whoever last edited the zone. A domain that falls out of verification does not
stop sending; it starts landing in spam folders, which is the same thing from
the reader's side and produces no error anywhere.

**6. Did the sender change in the admin?** Site settings → Legal & contact
overrides the environment. An address typed there that the provider has not
verified is rejected by the provider, not by the form — the form only refuses
addresses that are obviously stand-ins.

---

## Where the code is

| File | What |
| --- | --- |
| `src/lib/email.ts` | Reads the environment, validates it, names the variable at fault. No network, no Payload — unit-tested against a plain object |
| `src/lib/email.test.ts` | Pins both directions: a bad configuration is refused, a valid one is not |
| `src/lib/email-adapter.ts` | The provider adapters and the Site settings overlay |
| `src/seed/email-test.ts` | `pnpm email:test` |
| `src/collections/Users.ts` | The reset email and its URL |
| `src/globals/SiteSettings.ts` | The three admin-editable sender fields |

The split is the same one `src/lib/reachability.ts` uses and for the same
reason: the half that makes decisions has no I/O in it, so it can be tested
exhaustively, and the half that has I/O makes no decisions.
