# Drop game assets here

`assets/<collection>/<slug>.<ext>` — the folder picks the collection, the
filename picks the record. Then run `pnpm assets`.

    assets/items/durandal.png
    assets/characters/lacra.jpg
    assets/regions/laslea-glen.webp

Folders: items, characters, perks, quests, endings, regions, enemies, builds,
courts, court-activities, skills.

The slug is the last part of the page's URL. `/items/durandal` means the file
is `durandal.png`. Underscores, spaces and capitals are tolerated, so
`Ancient Hero's Armour.png` resolves to `ancient-heros-armour`.

Existing images are kept. Pass `--force` to replace them.

See `docs/ASSETS.md` for where to source files and what sizes to use.
