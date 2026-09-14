# Where to get images, and how to hand them over

## How to hand them over

Drop files into `assets/<collection>/<slug>.<ext>` and run `pnpm assets`.
The folder picks the collection, the filename picks the record.

```
assets/items/durandal.png
assets/characters/lacra.jpg
assets/regions/laslea-glen.webp
assets/perks/last-stand.png
```

Folders: `items`, `characters`, `perks`, `quests`, `endings`, `regions`,
`enemies`, `builds`, `courts`, `court-activities`, `skills`.

The slug is the last part of the page URL — `/items/durandal` means
`durandal.png`. Capitals, spaces and underscores are tolerated, so
`Ancient Hero's Armour.png` resolves correctly. Existing images are kept
unless you pass `--force`. Anything that matches no record is listed at the
end of the run rather than silently dropped.

Assets are gitignored: they are large and not ours to redistribute.

## Two piles, and why only one is in git

`assets/` is gitignored. `public/art/` is committed. They hold the same kind of
material, so the line between them is worth stating.

`assets/` is the **library**: whole press packs and store downloads at full
size, most of it never used. Putting that in git would be redistributing a
175 MB media pack that anyone can already get from Rebel Wolves, for no reason
other than that we happened to download it. A `manifest.json` in each library
folder records where every file came from, and `tools/fetch-steam-art.mjs`
re-downloads the part the site actually depends on, so the pile is reproducible
without being committed.

`public/art/` is the **fourteen crops the site actually serves** — the home
hero and one band per section index, 1920px WebP, about 1.6 MB in total. These
are published on the site either way, which is the editorial fan-site use the
press kit exists for. Committing them is what makes a clean checkout build:
`assets/` is not in git, so a build that had to derive them would have nothing
to derive them from. `tools/make-art.mjs` regenerates them from the library if
you change the picks, and writes the credit strings to
`src/lib/art-credits.json`.

The rule of thumb: **git carries what the site serves, not what we collected.**

## Where art may and may not go

Decorative art goes on the home hero, the section indexes, and the social card.
It does **not** go on a record page.

No press kit or store page found so far says which place, person or creature
any official screenshot shows — no captions, no IPTC or XMP, no named character
renders. A forest screenshot above the words "Laslea Glen" reads as a claim
that it *is* Laslea Glen, whatever the alt text says, and that is exactly the
kind of claim this site cannot make without a source. An index page names a
whole section rather than one thing, which is why it can carry a band.

So a record gets an image only when a source names what the image shows. Until
then it keeps the fallback icon, which `EntityImage` renders deliberately.

There is exactly one source that does name its subjects — the Steam community
items in section 3 below, which the publisher titles per character. That is why
seven character pages have a face and no region page has a photograph.

Where a crop removes a burned-in disclaimer — several press screenshots are
stamped `PRE-BETA IN-GAME FOOTAGE (ACTUAL GAMEPLAY)` along the bottom, next to
the logos — that sentence moves into the visible credit instead. Cropping the
image must not quietly promote pre-release footage into a picture of the game
as shipped.

## Grabbing a whole page at once

`tools/grab-images.js` is a DevTools console tool. Paste it in on a page full
of images — a press kit, a Steam store page — and it finds every image,
including the full-size file behind a thumbnail link, and the ones set as CSS
backgrounds.

You get a grid: untick the junk, set a minimum width to hide 16px sprites,
give each keeper a collection and a filename, and download **one zip already
laid out as `<collection>/<slug>.<ext>`**. Unzip it into `assets/` and run
`pnpm assets`; nothing else to do.

A `manifest.json` rides along recording the source URL, page and date for
every file, so attribution survives into the project.

Zipping happens in the page, so nothing is uploaded anywhere. Some sites block
cross-origin reads, in which case a fetch fails — those are listed in the
manifest and in the panel, and have to be saved by hand.

## What sizes to aim for

| Use | Shape | Minimum | Notes |
| --- | --- | --- | --- |
| Item and perk icons | square | 128×128 | Transparent PNG is ideal — these sit on both light and dark backgrounds |
| Character portraits | 3:4 or square | 400px tall | |
| Region and location art | 16:9 | 1200px wide | |
| Enemy and boss art | 16:9 or square | 800px wide | |
| Home page key art | 16:9 | 1920px wide | Optional |
| Social preview | 1200×630 exactly | — | One image, used for every link share |

Payload generates thumbnail, card and hero sizes automatically, so upload the
largest you have rather than pre-shrinking. WebP and AVIF are fine.

## Where to get them, best first

### 1. Official press kits — the only properly licensed route

Press kits exist precisely so sites like this can use the art, and they
usually carry explicit permission.

- **Bandai Namco press site** — the publisher's press portal, filed by title
- **Rebel Wolves** — the developer's own site and press contact
- **The game's official site** — key art, logos, character renders

If you find a press kit, read its terms once. Most permit editorial and
fan-site use with credit. That single paragraph is worth more than everything
below it.

### 2. Steam — public, high resolution, easy

The Steam store page for The Blood of Dawnwalker carries key art, the header
capsule, and the official screenshot set. Steam's own CDN URLs are stable and
these images are published for promotion. Good for region art, key art and
the social preview; useless for item icons.

### 3. Steam community items — the only route that names who is in the picture

This is the one source that clears the bar in *Where art may and may not go*
above, and it is the reason any character page has a face on it.

Steam sells profile backgrounds and trading cards per character, and the
publisher titles each item: **"Ambrus (Profile Background)"**. That title is a
source naming the subject, not our guess at it. Nothing in the press packs
does this — their screenshots ship as `Screenshot (1..8).png` with no captions
and no IPTC or XMP metadata.

```bash
node tools/fetch-steam-art.mjs   # download, with a provenance manifest
node tools/make-portraits.mjs    # cut 3:4 portraits from the backgrounds
pnpm assets                      # attach them to the character records
```

Backgrounds are 1920×1080 with the figure right of centre, so a 3:4 slice
lands at 810×1080 — comfortably over the minimum above. Seven characters have
one: Ambrus, Anca, Bakir, Brencis, Coen, Crake and Xanthe.

Trading cards cover one more subject (Lacra) but the market API exposes only a
224×261 inventory icon, which is under the minimum and framed and logo-stamped
besides, so `make-portraits.mjs` deliberately does not cut from them. She keeps
the fallback icon rather than sitting blurry beside seven sharp ones.

Re-run the fetch after a patch or a seasonal sale: the set grows. Brencis was
missing from the first hand-made pass and only turned up once the download was
a script that pages the listing properly.

### 4. Your own screenshots — the only ones nobody else has

If you own the game: F12 on Steam, or the console capture button. This is the
best source for anything the official material does not cover — specific
locations, quest moments, boss encounters — and it is the only category of
image that makes the site visually distinct rather than identical to every
other wiki using the same press pack.

Photo mode, if the game has one, is worth the detour.

### 5. Extracted UI icons — what actually makes a database look right

Item and perk icons only exist inside the game files. This is the route that
gives a database its texture, and it is also the fiddliest.

**The tool is FModel**, not Vortex. Vortex is a mod manager and cannot open
game archives. FModel is an Unreal archive browser built on CUE4Parse.

- FModel: <https://github.com/4sval/FModel> (releases, or fmodel.app/download)
- Needs .NET 10 or later

**Setup, in order:**

1. Install FModel and point it at the game's `Paks` folder, typically
   `…\steamapps\common\The Blood of Dawnwalker\<Project>\Content\Paks`.
2. Set the engine version. The published mapping file is named for **UE 5.5**.
3. Add the **AES key**. The paks are encrypted, so nothing loads without it.
4. Add a **`.usmap` mapping file**. UE5 stores properties unversioned, so
   FModel cannot read asset structure without one.

The key and the mapping file are both published on Nexus and both change when
the game patches, so take the current ones from there rather than from any
guide:

- Mapping file: <https://www.nexusmods.com/thebloodofdawnwalker/mods/95>
- Generate your own (survives patches): <https://www.nexusmods.com/thebloodofdawnwalker/mods/136>

**Finding the icons:** `Ctrl+Shift+F` searches every filename in the archive.
Look for paths containing `UI`, `Icon`, `Inventory` or `Perk`. Export as PNG;
output lands in `FModel\Output\Exports` mirroring the archive's folder tree.

**Then run the matcher.** Extraction gives you thousands of files named things
like `T_Icon_Sword_Durandal_01.png`, and renaming those by hand is the real
cost of this route:

```bash
pnpm assets:match ~/FModel/Output/Exports          # dry run, writes a plan
pnpm assets:match ~/FModel/Output/Exports --apply  # stage into assets/
pnpm assets                                        # attach to records
```

It strips the engine's naming furniture (`T_`, `UI_`, `_BaseColor`, trailing
numbers), scores what is left against every record title and slug, and writes
`asset-match-plan.tsv` for you to read before anything moves. Matches below
75% are marked `CHECK`. Scenery and effects textures simply do not match and
are reported as such.

**The honest caveat.** Unlike the press pack, extracted UI assets are not
published for redistribution. Sites that use them rely on tolerance rather
than permission, and that is a decision about *publishing* them, separate from
extracting them from a game you own. If you skip this entirely, the site's own
icon set already covers every category and nothing looks broken.

### 6. Wikimedia and press coverage

Logos and box art occasionally sit on Wikipedia/Wikimedia under a stated
licence. Check the licence on the file page itself, not the article.

## What not to do

**Pulling images from community wikis — what this site actually does.**

This section used to read "do not", on the reasoning that *there is no upside:
the same asset is available from the source*. That last clause turned out to be
false, and the rule was overruled deliberately rather than forgotten.

Every official route was worked through first, and none of them identifies its
own pictures. The Rebel Wolves media pack, all three Bandai Namco press packs
and the Steam store ship screenshots named `Screenshot (1..8).png` with no
captions and no IPTC or XMP. The official site never names a region anywhere in
its published copy. The printed Vale Sangora map exists only inside the
Collector's Edition box. The streaming kit is overlay frames and emoji. Item
icons genuinely do only exist inside the game files, and the extraction route in
section 5 needs the game installed, which it is not here.

So the choice was between a database with no pictures and one that credits
another site for them. The owner chose the second, knowing the rest of the
original reasoning stands: **these images are ripped from the game just as ours
would be, so we inherit that exposure, and there is a terms-of-service question
against the wiki on top.**

`tools/fetch-wiki-images.mjs` is how it is done, and it is deliberately narrow:

- it reads `robots.txt` first and refuses any path the host disallows
- one request per second, single-threaded, with a real referer
- an image is only accepted when its **own filename names the record** it is
  being filed under, so Durandal's art can never land on Gladius
- every file's page and URL go into `assets/_library/wiki-images.json`, and
  `pnpm assets` turns that into a visible per-image credit: *"… Image via
  bloodofdawnwalker.wiki.fextralife.com."*

Sites that signal they do not want automated collection are left alone —
`gamerguides.com` blocks `GPTBot` and `Google-Extended` in its robots.txt, so it
is not used even though its pages would parse.

If the game is ever installed, prefer section 5: extracted icons are the same
assets without the second party's exposure, and `pnpm assets:match` already
exists to file them.

**Do not hotlink.** Serving images from someone else's CDN is bandwidth theft
and breaks the moment they rotate a URL. Upload them here.

**Credit everything.** Every media record has a `credit` field and the bulk
importer fills it with the publisher attribution by default. Leave it in.

## The legal position, briefly

Game screenshots and art belong to Bandai Namco Entertainment and Rebel
Wolves. Fan-site use is *tolerated*, not licensed — the practical protections
are: use no more than you need, credit the owner, never imply endorsement,
keep official logos out of your own branding, and take anything down promptly
if asked. The site's terms page already states the no-affiliation position.

Press-kit material is the exception: that is usually genuinely licensed for
this use, which is why it is first on the list.
