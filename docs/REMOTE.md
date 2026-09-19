# Remote control

Operating a running site from a terminal: what the flow is, what each step
actually proves, and what it deliberately does not attempt.

Written 18 September 2026.

Everything here is **off**. A deployment that never turns it on has no endpoint
that does anything: `/api/remote/*` answers 404 without an environment secret,
and 403 with a reason when the secret is set but the switch in the admin is
not. There is no default that grants anything.

---

## The short version

```bash
# On the deployment: .env
REMOTE_CONTROL_SECRET=<openssl rand -base64 48>

# In the admin: Network → Remote control → tick "Remote sessions are enabled"

# In the terminal
pnpm remote connect
#   → prints a 16-character code, e.g.  K7QD-3XMH-9RTV-P2WY
#   → waits
#
#   or ask for less:  pnpm remote connect --can read,create,update

# In the admin: Remote control → the pending session shows the SAME code.
#   Compare the two. Type it in. Tick what this session may do. Approve.

# Back in the terminal, the session opens and prints when it expires.
pnpm remote list guides --game onimusha-way-of-the-sword
pnpm remote update guides all-items ./patch.json --game onimusha-way-of-the-sword
pnpm remote disconnect
```

---

## The thing worth understanding before anything else

**The 16-character code is not the credential.** It cannot be, and designing as
though it were is the mistake this whole document exists to avoid.

The owner's requirement was that the same code appear in the terminal and on
the site, so that seeing it in both places shows the connection is real. That
requirement is exactly right, and it is a requirement about *display*. A string
that is printed to a screen, shown on a web page, read aloud, screenshotted
into a support thread or scrolled back to in a terminal buffer is not a secret,
and a credential that grants write access to a live public site must be one.

So the code does one job and only one: it lets a human confirm that the pending
session they are about to approve in the browser is the session sitting in
their terminal, and not somebody else's. That is the same job a Bluetooth
pairing code does, or the fingerprint SSH shows you the first time you connect.
It is compared, not trusted.

The credential the CLI actually uses afterwards is a 256-bit token the **server**
mints, the CLI never types, the browser never sees, and the database never
stores — only an HMAC of it, keyed on `PAYLOAD_SECRET`, so rotating that secret
ends every live session. It exists for the length of one session and then it
does not.

Three properties follow, and they are the design:

| | proves |
| --- | --- |
| the **code** | the session in the browser is the session in the terminal |
| the **device key** | the request came from a machine the owner has approved |
| the **session token** | the owner approved *this* session, and it has not expired |

Every request needs the last two. Neither one is enough on its own.

---

## The flow, end to end

1. **`pnpm remote connect`.** The CLI looks for `.remote/device.key`. If there
   is none it generates an Ed25519 keypair and writes the private half there,
   mode `600` (see the note below on what that is worth on Windows), gitignored. It signs a request to `POST /api/remote/session`
   carrying its public key, a label (the machine's hostname), and the capabilities
   it is asking for.

2. **The server decides whether it will open a session at all.** In order:

   - Is `REMOTE_CONTROL_SECRET` set? No → **404**. The endpoint does not exist.
   - Is Remote control enabled in the admin? No → **403**, saying so.
   - Is this device on the allow-list and enabled? No → the device is recorded
     as *pending* so the owner can see it, and the request is **403** naming the
     fingerprint to approve.
   - **Is the site finished?** `auditNetwork` runs, and any finding that is
     `blocking` and `owner` refuses the session, by name. This is the owner's
     "only works when we have entered all details", wired to the one place this
     project keeps its checks. See [The audit gate](#the-audit-gate).
   - Rate limits.

3. **A pending session is created.** It gets a 16-character code from
   `crypto.randomBytes`, over an alphabet with no `0`/`O` and no `1`/`I`/`l`,
   grouped `XXXX-XXXX-XXXX-XXXX`. The CLI prints it and starts polling. The
   session expires unapproved after ten minutes.

4. **The owner opens `/admin1621/remote`.** The pending session is there with the
   same code, the device name and key fingerprint, the IP the request came
   from, what it asked to be allowed to do, and a countdown. They compare the
   code with the one in their terminal, type it into the confirm box, tick the
   capabilities this session gets, and approve. See
   [What one session may do](#what-one-session-may-do).

5. **The CLI's next poll mints the token.** Approval writes no token anywhere:
   it flips a status. The token is generated when the CLI — which has the
   device key, which the browser does not — asks for it, handed back once, and
   stored only as an HMAC. This is the device authorization grant's shape and
   it is the reason the token never travels through the browser or sits in a
   row somebody could read.

6. **Every operation after that** goes to `POST /api/remote/op` with
   `Authorization: Remote <token>` and an Ed25519 signature over the method,
   path, timestamp, nonce and a hash of the body. The server checks the
   signature, the token, that the session is open and not expired and not idle,
   and that the device is still enabled — then performs the operation **as the
   editor who approved it**, with `overrideAccess: false`. A remote session is
   never more powerful than the person who approved it.

7. **Every write is logged** to `remote-log` before the response is returned:
   which session, which device, which collection and record, which fields
   changed, from what IP, at what time. Reads are counted, not logged row by
   row — a log nobody can read is not an audit trail.

The session closes on `pnpm remote disconnect`, on expiry, on idle timeout, or
the moment the owner clicks Revoke in the admin.

---

## What one session may do

The owner's requirement: *"I can select what you can add like new pages or
delete and perms in each session so it is easier."*

So a session is not granted a level, it is granted a **set**, and the set is
chosen at the moment it is approved. Five boxes:

| | |
| --- | --- |
| `read` | list records, fetch one |
| `create` | add records that did not exist |
| `update` | change the fields of a record |
| `publish` | take a draft live |
| `delete` | remove a record |

"Create pages, but never delete" is two rungs apart on a ladder and one
unticked box here, which is the whole reason the ladder went. The three old
scope names survive as **presets** — `read`, `write` (everything but delete)
and `full` — and they are a shorthand for a set and nothing more. No check
anywhere reads a preset.

**Each session gets the intersection of what the terminal asked for and what
the owner ticked.** Asking for everything grants nothing by itself; ticking a
box the terminal did not ask for does not widen the session, because the
request line on the approval screen says what that terminal intends to do and
quietly widening it would make that line a lie. The approval form therefore
offers exactly the boxes that were asked for — a control that could not have
an effect is a control that teaches somebody the grant is wider than it is.

The terminal asks with `--can`:

```bash
pnpm remote connect --can read,create,update   # a batch of new pages
pnpm remote connect --can read,update          # a correction run
pnpm remote connect --scope read               # looking, not touching
```

A name nobody recognises is refused rather than dropped. `--can creat,delete`
is an error naming `creat`, not a session quietly granted deletion alone —
a filter written to stop bad input throws away good input just as silently,
which is the Antar 4 rule in CLAUDE.md pointed at a permission list.

### How it is enforced

Server-side, on every operation, and **default-deny**:

- The grant is read off the session row, never off the request. A request names
  an operation and never a permission, so a client that asks nicely and one
  that asks any other way are refused identically.
- A row with no capabilities — hand-edited, restored from a backup, written
  before the field existed — can do nothing but `whoami` and `close`. Absence
  never widens a credential, the same rule `time.known: false` states about a
  segment cost.
- `whoami` and `close` need no capability at all. A session you cannot close is
  a credential you cannot put down.
- The grant is fixed when the token is minted and cannot be changed afterwards.
  Widening is a new session, which is one command.
- Every refusal is **logged**, and every log row — refusal or not — records
  what the session was *permitted* to do beside what it did. "What else could
  that session have done" is the second question anybody asks of a trail, and
  a table of operations cannot answer it: a session that could delete and
  never did reads exactly like one that could not.

An approval that would grant nothing is refused at the form rather than
recorded, because a session that can only close itself is one the terminal
would discover an operation at a time.

`src/lib/remote/policy.ts` holds all of it and imports nothing, so every rule
above is pinned in both directions — a granted capability works, an ungranted
one is refused — in `policy.test.ts`.

---

## Why the terminal asks and the admin approves

The owner's phrasing — "we can paste that here" — describes the other
direction: a code minted on the site and typed into the terminal. That is a
worse design here, for two reasons.

**It authenticates the wrong thing.** A code minted in the browser and typed
into a terminal proves that whoever is at the terminal has seen the browser. It
says nothing about which machine the terminal is on, and the owner explicitly
asked for the machine to matter ("connected through approved device"). The
device keypair proves that properly and proves it on every request, not once at
the start.

**It makes the code a bearer secret.** If typing the code is what opens the
session, then the code is the credential — and the owner also wants it printed
on a web page. Those two requirements cannot both be satisfied by one string.
Splitting them is what lets the code be visible in both places, which is the
part of the request that mattered.

What the owner asked for is preserved exactly: the code appears in the terminal
and on the site, and the session does not open until a human has looked at both
and said yes. The confirm box in the admin is where they say it — the code has
to be typed in to approve, so approving is a deliberate act rather than a
mis-click, and a cross-site request that cannot read the page cannot forge one.

---

## The audit gate

`src/lib/audit.ts` is the only place on this project that decides whether
something is missing. `pnpm check:launch` prints those findings and the admin
dashboard renders them, and the reason both read one module is recorded in
CLAUDE.md: two implementations of one check means that the day they disagree
the reassuring one wins.

So the gate does not ask its own questions. `remoteBlockers()` in
`src/lib/remote/gate.ts` takes the findings `auditNetwork` already produced and
keeps the ones that are `level: 'blocking'` **and** `actor: 'owner'` — the
things only the owner can supply, that are bad enough to stop a launch. Today
that is:

- `NEXT_PUBLIC_SITE_URL` unset
- Legal details still flagged provisional
- A wiki, or a network host, whose subdomain label DNS will not serve

If any of those is outstanding, `pnpm remote connect` refuses and prints them.

Three deliberate exclusions:

- **`editorial` findings do not block.** A missing image credit is not a reason
  to refuse the owner access to their own site, and the most common use of this
  tool is fixing exactly that kind of gap.
- **`blocked` findings never block.** Seventy-eight quests with no published
  segment cost is the state of the world, not a chore. CLAUDE.md is explicit
  that `blocked` is never presented as an action, and a gate is an action.
- **`auditSource()` is not consulted.** It reads the repository from
  `process.cwd()`, which in a standalone deployment is not the repository, so
  it would return a clean bill of health it had not earned. Its own docstring
  says so.

The gate runs when a session **opens**, not on every operation. An audit pass
is ~190 count queries; running it per write would make the tool unusable and
would not catch anything, because nothing an open session does can create a
blocking owner finding.

---

## Threat model

### An attacker who has the 16-character code and nothing else

They can do nothing.

The code is not accepted by any endpoint. It is compared, in the admin, by
somebody already signed in as an editor, against a session that already exists
and that they are approving. There is no request anywhere in this design whose
outcome depends on presenting the code.

The one thing possession of the code changes is that somebody watching over the
owner's shoulder could approve a session they themselves requested, *if* they
were already signed into the admin as an editor and their device were already
on the allow-list. At that point the code is not what they defeated.

The confirm box still rate-limits and locks: five wrong codes and the session
is locked rather than merely unapproved. That is belt-and-braces — the code is
on the same screen as the box — but the box is the only place a code is ever
submitted, so it is the only place a guessing attack could exist, and leaving
it unlimited would be leaving a hole for a later change to fall into.

### An attacker who has the CLI's device key

This is the serious one, and it is the reason the key is the thing the design
protects rather than the code.

They can request sessions. They **cannot** open one: every session needs a
human in the admin to approve it, and the admin shows the device name, the
fingerprint and the IP the request came from. An unexpected pairing request
from a device the owner recognises but an IP they do not is the signal, and it
is on the screen.

They cannot use an existing session either, because the token is not in the
key file's neighbourhood by accident — `.remote/session.json` holds it, so
stealing the key file alone is not enough, and stealing both means the attacker
has the owner's home directory, at which point they have the owner's browser
session too.

Revocation is one click: disabling the device in the admin closes every session
it holds on the next request, and there is no cached grant anywhere that
outlives it.

The key is Ed25519 and never leaves the machine. What it proves is precisely
"the private half of a key the owner approved signed this request" — **not**
"this is that laptop". A copied key file is a valid device, and no design that
runs on an ordinary developer machine can say otherwise. A machine fingerprint
would prove less and claim more: it is forgeable by anyone who can send
headers, and it changes when a laptop updates, which means it fails open or
fails constantly.

The key file is written `0600`. Be clear about what that is worth: on Windows,
which is the machine this project is actually developed on, the mode argument
is largely decorative — NTFS permissions are not POSIX bits — so what protects
`.remote/device.key` there is the user profile it sits in and nothing else.
Saying "mode 600" and leaving it at that would be claiming a protection the
platform does not provide.

### An attacker who has neither but can reach `/api`

`/api` is in `PASS_THROUGH` in `proxy.ts`, so these routes answer on all ten
hosts and are as reachable as anything else on the network. What they get:

- Without `REMOTE_CONTROL_SECRET` set on the deployment: **404**, on every one
  of them, with no hint that the feature exists.
- With it set but the admin switch off: **403** and a sentence.
- With both on: a request with no valid signature is rejected before anything
  is read out of the database. A request signed by an unknown key creates a
  *pending device* row — which is the intended way an owner adds their own
  laptop, and is also an unauthenticated write, so it is rate-limited hard, and
  a pending device grants nothing until the owner enables it.
- `POST /api/remote/decide`, the admin's approve/deny form, requires a signed-in
  `users` session **and** the code typed back, so it is not reachable
  cross-site.

Replay: every signature covers a timestamp and a nonce. Timestamps more than
two minutes from the server's clock are refused; nonces are remembered for that
window. The nonce cache is in memory and therefore per process — behind two
instances a replay inside the two-minute window could land on the other one.
That is a real limit and it is written here rather than implied away; the
mitigation is that the window is short, every write is logged with its session,
and the operations are addressed by slug rather than being blind appends.

### The editor who approved the session

A session is not a super user. It runs with `overrideAccess: false` and the
approving editor's own account, so an editor assigned to one wiki cannot reach
another through it — the same rule `isEditorForGame` already applies in the
admin.

On top of that there is a denylist no session can cross, whoever approved it:
`users`, `players`, `remote-devices`, `remote-sessions` and `remote-log`. A
remote session cannot create an editor account, cannot approve a device, cannot
approve another session, and cannot edit its own audit trail. Those five are
refused in `src/lib/remote/policy.ts` before the operation reaches Payload, and
the refusal is not configurable from the admin — a switch that could turn it
off would be the hole.

---

## What this deliberately does not do

- **It does not leave the API key working beside it.** See below: on a
  deployment with remote control, `REMOTE_API_KEY` is refused.
- **It does not upload files.** `media` is on the allow-list for metadata, but
  the binary goes through the admin. A file upload over a signed JSON envelope
  is a second protocol, and this one is small enough to read.
- **It does not queue.** A session that expires mid-batch has done whatever it
  had done and no more. The log says what.
- **It does not notify.** A pairing request does not send email. It could —
  `src/lib/email.ts` is there — and the argument against is that the owner is
  the person making the request, so the mail would be to themselves about
  something they are watching a terminal for. Reconsider the day a second
  editor gets a device.
- **It is not a second admin.** Everything it can do, the admin can do, in a
  browser, with a form. This exists because forty edits are a terminal job and
  one edit is not.

---

## The API key, and why it stops working

`REMOTE_API_KEY` is Payload's own per-user API key, and it predates all of
this. It is long-lived, it never expires, nothing approves it, it carries that
user's full permissions, and **its writes are not in `remote-log`**.

On a deployment that has set `REMOTE_CONTROL_SECRET`, it is **refused**. Not
warned about — refused, in `isEditor` and `isEditorForGame`, which are the two
functions every content collection routes its write access through.

The reason is that the alternative makes the boxes above decorative. "Create
pages, no deletions" means nothing while a second credential in the same
`.env` can delete anything, and the moment a scoped session refuses an
operation — which is the feature working — the next thing to hand would be the
key that does not refuse. A fallback that still works is the one that gets
used.

A warning was the other option and it is the weaker one twice over. The person
running a script against a live site is not watching the logs, so a line
saying "an unscoped credential just deleted forty pages" is an autopsy rather
than a control; and this project already has the rule — `pnpm email:test`
exits non-zero on the `console` provider because printed is not delivered.
Refused is not warned. It is loud *as well*: the server prints the reason once
per process, and `pnpm remote` asks the site whether it has remote control
before falling back to a key, so the terminal gets a sentence naming what to
do instead of Payload's generic "You are not allowed to perform this action".

What still works, untouched:

- **Every deployment that has not set `REMOTE_CONTROL_SECRET`.** A staging
  site, a local copy, a network that wants nothing to do with sessions: its
  API keys behave exactly as they did. Nothing about this reaches a site that
  did not ask for the feature.
- **Public reads**, which never went through `isEditor` — `publicRead` answers
  `read: () => true`.

The switch read is the environment variable rather than the admin checkbox,
and deliberately: an access-control function runs on every request and cannot
afford a database read, and a credential whose validity depended on a tick-box
somebody could flip while looking for something else would be worse than
either answer. The way back is to unset `REMOTE_CONTROL_SECRET`, which turns
remote control off entirely. There is no setting that leaves both live.

`src/lib/remote/api-key.ts` is the module, `api-key.test.ts` pins it.

---

## Reference

### Files

| Path | What it is |
| --- | --- |
| `src/lib/remote/credentials.ts` | the code alphabet, code and token generation, hashing, constant-time compare |
| `src/lib/remote/session.ts` | the pure state machine: expiry, idle, single-use, what a status means |
| `src/lib/remote/gate.ts` | the audit gate, over findings `auditNetwork` produced |
| `src/lib/remote/policy.ts` | what is enabled, the capability set and what each operation needs, which collections a session may reach, the denylist |
| `src/lib/remote/signing.ts` | the canonical signing string, Ed25519 verification, the replay window |
| `src/lib/remote/server.ts` | the request-side glue: the only module here that touches the database |
| `src/collections/RemoteDevices.ts` | the device allow-list |
| `src/collections/RemoteSessions.ts` | one row per pairing request and the session it becomes |
| `src/lib/remote/api-key.ts` | why a Payload API key stops working once this is on |
| `src/collections/RemoteLog.ts` | the audit trail, including what each session was permitted to do |
| `src/globals/RemoteAccess.ts` | the switch, the lifetimes, the collection allow-list |
| `src/app/api/remote/session/route.ts` | open a pairing request |
| `src/app/api/remote/poll/route.ts` | the CLI's wait, and where the token is minted |
| `src/app/api/remote/op/route.ts` | every operation a session performs |
| `src/app/api/remote/decide/route.ts` | the admin's approve / deny / revoke form |
| `src/components/admin/RemoteView.tsx` | `/admin1621/remote` |
| `tools/remote.mjs` | the CLI |

`pnpm remote device` prints this machine's fingerprint without contacting
anything, which is what to compare against the device row in the admin.

### Statuses

| status | meaning |
| --- | --- |
| `pending` | waiting for a human. Expires ten minutes after it was asked for. |
| `approved` | a human said yes. The token has not been collected yet; ten minutes to do it. |
| `open` | the CLI holds a token. Expires at `expiresAt`, or after fifteen idle minutes. |
| `denied` | a human said no. |
| `locked` | too many wrong codes typed into the confirm box. |
| `expired` | ran out of time in `pending`, `approved` or `open`. |
| `revoked` | the owner ended it, or disabled the device. |
| `closed` | `pnpm remote disconnect`. |

Nothing transitions out of `denied`, `locked`, `expired`, `revoked` or
`closed`. A new session is a new row — a session that could be re-opened would
mean a token that outlives the decision to end it.

### Timings

All of these are in `src/lib/remote/policy.ts`, and the two the owner can
change are on the Remote control global with the code's values as the fallback.

| | |
| --- | --- |
| a pending session waits | 10 minutes |
| an approved session may be collected within | 10 minutes |
| a session lives, by default | 60 minutes (owner-settable, capped at 12 hours) |
| a session dies idle after | 15 minutes (owner-settable) |
| a signature is accepted within | ±2 minutes of the server clock |
| wrong codes before the session locks | 5 |

### Environment

```
REMOTE_CONTROL_SECRET=   # 32+ characters. Without it every route is a 404.
```

It is separate from `PAYLOAD_SECRET` on purpose: it is the switch that makes
the feature exist, and a deployment that wants nothing to do with remote
control should be able to have that be true without touching the secret its
whole database is keyed on. `PAYLOAD_SECRET` is still what tokens are HMAC'd
with, so rotating it ends every session, which is the correct behaviour.

### Setting it up the first time

1. Put `REMOTE_CONTROL_SECRET` in the deployment's environment and redeploy.
2. Sign into `/admin1621`, open **Remote control**, tick the switch, save.
3. `pnpm remote connect` in the terminal. It fails, naming your device
   fingerprint — that is the device registering itself. (`pnpm remote device`
   prints the same fingerprint at any time, offline.)
4. In the admin, **Remote devices** → the new row → name it, tick *Enabled*,
   save.
5. `pnpm remote connect` again. It prints a code and waits.
6. **Remote control** in the admin → the pending session, showing the same
   code. Compare, type it in, tick what this session may do, approve.
7. The terminal prints the expiry. `pnpm remote status` any time; `pnpm remote
   disconnect` when done.
