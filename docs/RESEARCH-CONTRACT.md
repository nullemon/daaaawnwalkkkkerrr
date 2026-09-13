# Research contract

Every research agent writes ONE JSON file to `src/seed/raw/<name>.json`. The
importer (`src/seed/import.ts`) reads them all. Nothing else in the repo should
be touched by a research agent.

## The rules that matter

1. **Never invent a fact.** If search results do not state it, leave the field
   out. A missing field is fine; a fabricated one poisons the whole site.
2. **Cite everything.** Each record carries `sources` with at least one real URL
   you actually saw in search results.
3. **Rate confidence honestly.**
   - `high` — two or more independent sources agree
   - `medium` — one good source, or sources differ on detail
   - `low` — contested, inferred, or you are unsure
4. **Never copy prose.** Write original summaries in your own words. Facts are
   free to compile; sentences are not.
5. **Record disagreement.** If sources conflict, say so in the `note` field and
   mark confidence `low`. Do not silently pick a winner.
6. **Numbers need a source.** Do not estimate stats, damage, or segment costs.
   Omit rather than guess.

## File shape

```json
{
  "collection": "items",
  "records": [ { ...record... } ]
}
```

## Slugs you must use for cross-references

Regions: `laslea-glen`, `briar-sloughs`, `maragir-wealds`, `boars-back`,
`svartrau-outskirts`, `svartrau-city`, `rockfalls`, `st-tynas-grove`,
`the-slits`, `tantari-woods`

Courts: `ambrus`, `bakir`, `xanthe`
Skill trees: `swordmastery`, `witchcraft`, `vampirism`

Make record slugs yourself: lowercase, hyphens, no apostrophes
(`Ambrus' Cuirass` becomes `ambrus-cuirass`).

## Record shapes

### items
```json
{
  "title": "Durandal",
  "slug": "durandal",
  "category": "weapon|armour|ring|manual|recipe|consumable|ingredient|quest",
  "rarity": "legendary|rare|common",
  "regionSlug": "briar-sloughs",
  "howToGet": "One or two sentences, your own words.",
  "stats": [{ "label": "Damage", "value": "142" }],
  "summary": "One sentence for cards and search results.",
  "bodyParagraphs": ["Paragraph.", "Another paragraph."],
  "note": "Only when sources conflict.",
  "confidence": "medium",
  "sources": [{ "title": "GameSpot best gear", "url": "https://…" }]
}
```

### quests
```json
{
  "title": "Hive and Seek",
  "slug": "hive-and-seek",
  "kind": "main|ally|court|side|contract|prologue",
  "regionSlug": "maragir-wealds",
  "courtSlug": "ambrus",
  "phase": "day|night|either",
  "prereqSlugs": ["song-of-the-mountain"],
  "timeSegments": { "min": 3, "max": 3, "known": true },
  "summary": "…",
  "bodyParagraphs": ["…"],
  "confidence": "medium",
  "sources": [{ "title": "…", "url": "…" }]
}
```
Set `"known": false` and omit min/max unless a source states a real cost.

### court-activities
```json
{
  "title": "…", "slug": "…", "courtSlug": "ambrus",
  "regionSlug": "svartrau-city", "phase": "either",
  "howToStart": "…", "summary": "…", "bodyParagraphs": ["…"],
  "confidence": "medium", "sources": [{ "title": "…", "url": "…" }]
}
```

### perks
```json
{
  "title": "Last Stand", "slug": "last-stand", "treeSlug": "swordmastery",
  "isUltimate": true, "timeCostSegments": 1, "foundInWorld": false,
  "effect": "One line, what it does.",
  "summary": "…", "bodyParagraphs": ["…"],
  "confidence": "medium", "sources": [{ "title": "…", "url": "…" }]
}
```

### characters
```json
{
  "title": "…", "slug": "…",
  "role": "protagonist|ally|vassal|antagonist|merchant|minor",
  "romanceable": false, "regionSlug": "svartrau-city",
  "summary": "…", "bodyParagraphs": ["…"],
  "confidence": "medium", "sources": [{ "title": "…", "url": "…" }]
}
```

### enemies
```json
{
  "title": "…", "slug": "…", "isBoss": true, "regionSlug": "rockfalls",
  "phase": "day|night|either", "weaknesses": ["Fire"],
  "summary": "…", "bodyParagraphs": ["…"],
  "confidence": "medium", "sources": [{ "title": "…", "url": "…" }]
}
```

### builds
```json
{
  "title": "Night Stalker", "slug": "night-stalker",
  "playstyle": "day|night|hybrid",
  "primaryTreeSlug": "vampirism",
  "perkSlugs": ["renounce-death"],
  "itemSlugs": ["durandal"],
  "difficulty": "beginner|intermediate|advanced",
  "summary": "…", "bodyParagraphs": ["…"],
  "confidence": "medium", "sources": [{ "title": "…", "url": "…" }]
}
```

### guides
```json
{
  "title": "…", "slug": "…", "targetQuery": "the search this answers",
  "summary": "…", "bodyParagraphs": ["…"],
  "confidence": "medium", "sources": [{ "title": "…", "url": "…" }]
}
```

`bodyParagraphs` entries may also be `{"h": "A heading"}` or
`{"ul": ["item", "item"]}` for structure.
