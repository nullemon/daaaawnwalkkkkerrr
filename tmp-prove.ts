import 'dotenv/config'
import { getPayload } from 'payload'
import config from './src/payload.config'

/* Proves the three controls render, then puts the database back. */
const main = async () => {
  const payload = await getPayload({ config })
  const games = await payload.find({ collection: 'games', depth: 0, limit: 0, pagination: false })
  const byslug = new Map((games.docs as any[]).map((g) => [g.slug, g.id]))
  const courts = await payload.find({ collection: 'courts', depth: 0, limit: 1, pagination: false })
  const enemy = await payload.find({ collection: 'enemies', depth: 0, limit: 1, pagination: false,
    where: { game: { equals: byslug.get('dawnwalker') } } })

  await payload.updateGlobal({ slug: 'site-settings', data: { lastVerified: '2026-09-18T12:00:00.000Z' } as never })
  await payload.update({ collection: 'games', id: byslug.get('dawnwalker'),
    data: { relatedGames: [byslug.get('onimusha-way-of-the-sword'), byslug.get('control-resonant')] } as never, depth: 0 })
  if (courts.docs.length && enemy.docs.length) {
    await payload.update({ collection: 'courts', id: (courts.docs[0] as any).id,
      data: { bossEnemy: (enemy.docs[0] as any).id } as never, depth: 0 })
    console.log('court', (courts.docs[0] as any).slug, 'boss', (enemy.docs[0] as any).slug)
  }
  console.log('injected')
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
