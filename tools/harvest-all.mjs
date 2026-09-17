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

const failed = []

for (const slug of GAMES) {
  const result = spawnSync(
    process.execPath,
    ['tools/harvest-game.mjs', slug, ...process.argv.slice(2), '--images'],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    failed.push(slug)
    console.error(`\n${slug}: harvest failed, continuing\n`)
  }
}

/*
  A summary at the end, because this prints thousands of lines and a failure
  forty minutes ago has long scrolled away. A non-zero exit is deliberately not
  used: the whole point of one process per game is that a wiki being down does
  not stop the other six, and `pnpm refresh` chains on `&&`.

  A game listed here kept its previous file — the shrink guard in
  harvest-game.mjs refuses to overwrite a good harvest with a short one — so
  the cost is a stale wiki, not a lost one. Re-run it with --resume.
*/
if (failed.length) {
  console.error(`\n\n${failed.length} of ${GAMES.length} wikis did not finish:`)
  for (const slug of failed) console.error(`  node tools/harvest-game.mjs ${slug} --resume --images`)
  console.error('Their existing files were left alone.')
} else {
  console.log(`\nAll ${GAMES.length} wikis harvested.`)
}
