/**
 * Classify each item's acquisition from its own sourced howToGet prose.
 *
 *   node tools/classify-acquisition.mjs            # dry run, prints the plan
 *   node tools/classify-acquisition.mjs --apply    # write it into src/seed/raw
 *
 * Re-run after adding items. Anything the rules cannot place confidently is
 * listed for a human to read rather than guessed at, and the by-hand list
 * below records why each judgement call went the way it did.
 *
 * Original header:
 * Classify each item's acquisition from the sourced howToGet prose.
 *
 * This reads our own already-cited text and files it under a kind. It asserts
 * nothing the source did not say — anything that does not match a confident
 * pattern is reported for a human to read rather than guessed at.
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.argv[2] ?? process.cwd()
const APPLY = process.argv.includes('--apply')
const FILES = ['items-consumables.json', 'items-gear.json']

/** First match wins, so order matters: specific before general. */
const RULES = [
  // Bought. "Bought from", "Purchased from", "stocks them", "widely stocked".
  [/\b(bought|buy it|purchased|purchase it|stocks? (them|it)|merchant'?s? stock|sold by)\b/i, 'merchant'],
  // Dropped by something you kill.
  [/\b(dropped by|drop from|loot(ed)? (it )?from .{0,24}(corpse|body)|harvested from|taken from (slain|wolves|boars)|killed in the wild|from slain|boss drop|world drop)\b/i, 'drop'],
  // Handed over for finishing something.
  [/\b(awarded|reward(ed)? for|given as a reward|comes at the end of|handed (over|to you)|completing|complete(s)? the|finish the|for seeing .{0,30}through)\b/i, 'quest-reward'],
  // Picked or gathered.
  [/\b(picked by hand|picked from|grows wild|gathered|foraged)\b/i, 'gathered'],
  // Made at a bench.
  [/\b(crafted|craft it|brewed)\b/i, 'crafted'],
  // A fixed place you walk to.
  [/\b(in a chest|inside a chest|sits in a chest|found in a chest|chest at|chest inside|chest in|looted from crates|from crates and barrels|pinned to|buried|dig the|inside the|at the .{0,30}(nest|lair|ruins|tower|camp|shed))\b/i, 'world'],
]

/**
 * Read by hand, because the prose does not match a pattern cleanly enough to
 * trust one. Each is a reading of that item's own sourced text.
 *
 * Items absent from both the rules and this list keep no acquisition at all:
 * the ten rings, three consumables and one manual that carry no howToGet text
 * are genuinely unresearched, and saying nothing is the honest output.
 */
const BY_HAND = {
  // "after killing him during the Lost Blood quest"
  'mysterious-ring': 'drop',
  // "Recovered from bandits in and around Tantari Woods"
  'bandits-treasure-map-tantari-woods': 'drop',
  // Game8: "Defeat Ambrus in the max Infamy Quest 'The Gilded Gauntlet'"
  'ambrus-cuirass': 'drop',
  // "Known from the start of the game" — you gather the reagents and make it
  'minor-mending-ointment': 'crafted',
  // "Given by Anca during the prologue"
  'ancas-recipe': 'quest-reward',
  // "Obtainable only through The Hedgehog Herb side quest"
  'razkovniche-plant': 'quest-reward',
  /*
    Several items have more than one route. The field records the primary one
    and `howToGet` keeps the full picture, so these three are corrected by hand
    where a trailing clause would otherwise win: "…and three witchcraft vendors
    stock it" does not make the manual a shop item.
  */
  'soul-reaping-manual': 'world', // "Clear the Ancient Circle in the woods east of Maragir"
  'quick-fighters-ring': 'quest-reward', // "she destroys it and hands this over"
  durandal: 'world', // "search the smashed wagon beneath the bridge"

  // Fixed spots you walk to, each named in its own text
  'strong-ancient-reagent': 'world', // "Recovered from Ancient Ruins"
  shovel: 'world', // "the wooden shed in Parlita"
  'the-vrakhir': 'world', // "in the tunnels ... at the intersection"
  'the-hand-of-fate': 'world', // "the Stone Key from the cathedral treasure"
  'isbrands-plate': 'world', // "in the room where Isbrand is found"
  'runic-enchantment': 'world', // "Push through the ruins to the trial door"
  'wolven-bracers': 'world', // "The trail ends at a ... chest"
}

const classify = (record) => {
  if (BY_HAND[record.slug]) return BY_HAND[record.slug]
  const text = record.howToGet
  if (!text || !String(text).trim()) return null
  for (const [pattern, kind] of RULES) if (pattern.test(text)) return kind
  return null
}

let changed = 0
const unmatched = []
const summary = {}

for (const file of FILES) {
  const full = path.join(ROOT, 'src/seed/raw', file)
  const data = JSON.parse(fs.readFileSync(full, 'utf8'))
  for (const record of data.records) {
    const kind = classify(record)
    if (!kind) {
      unmatched.push(`${record.slug} (${record.category}) :: ${String(record.howToGet ?? '(no text)').replace(/\s+/g, ' ').slice(0, 88)}`)
      continue
    }
    summary[kind] = (summary[kind] ?? 0) + 1
    if (record.acquisition !== kind) {
      record.acquisition = kind
      changed++
    }
  }
  if (APPLY) fs.writeFileSync(full, `${JSON.stringify(data, null, 1)}\n`)
}

console.log(APPLY ? `applied — ${changed} records classified` : `dry run — ${changed} would change`)
for (const [kind, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(14)} ${n}`)
}
console.log(`\nunmatched (${unmatched.length}) — read these, do not guess:`)
unmatched.forEach((line) => console.log(`  ${line}`))
