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

### 3. Your own screenshots — the only ones nobody else has

If you own the game: F12 on Steam, or the console capture button. This is the
best source for anything the official material does not cover — specific
locations, quest moments, boss encounters — and it is the only category of
image that makes the site visually distinct rather than identical to every
other wiki using the same press pack.

Photo mode, if the game has one, is worth the detour.

### 4. Extracted UI icons — what actually makes a database look right

The item and perk icons are what give a game database its texture, and they
only exist inside the game files. With the game installed, community
extraction tools for the engine will pull the UI atlas. Check Nexus Mods and
the game's modding Discord for a current extractor.

Two honest caveats. Extracted UI assets are the least defensible category
here — they are not published for redistribution the way press art is, and
sites that use them are relying on tolerance rather than permission. And it
needs the game plus a working toolchain, so it is the highest-effort route.

If you skip this, the site's own icon set covers every category already, and
nothing looks broken.

### 5. Wikimedia and press coverage

Logos and box art occasionally sit on Wikipedia/Wikimedia under a stated
licence. Check the licence on the file page itself, not the article.

## What not to do

**Do not pull images from other fan wikis.** Their images are ripped from the
game just as yours would be, so you inherit that exposure — and you add a
terms-of-service violation against the wiki on top. There is no upside: the
same asset is available from the source.

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
