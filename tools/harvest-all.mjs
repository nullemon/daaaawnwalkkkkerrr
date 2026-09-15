/**
 * Harvests every game's wiki in turn.
 *
 *   node tools/harvest-all.mjs
 *
 * One process per game rather than one long loop, so a wiki that is down or
 * has changed its category names fails on its own and the rest still run.
 */
import { spawnSync } from 'child_process'

const GAMES = [
  'onimusha-way-of-the-sword',
  'control-resonant',
  'resonance-a-plague-tale-legacy',
  'gears-of-war-e-day',
  'phantom-blade-zero',
  'silent-hill-townfall',
  'star-wars-zero-company',
]

for (const slug of GAMES) {
  const result = spawnSync(
    process.execPath,
    ['tools/harvest-game.mjs', slug, '--images'],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) console.error(`\n${slug}: harvest failed, continuing\n`)
}
