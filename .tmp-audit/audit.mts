import { createClient } from 'file:///C:/Users/Admin/projects/daaaawnwalkkkkerrr/node_modules/.pnpm/@libsql+client@0.14.0/node_modules/@libsql/client/lib-esm/node.js'
import { buildMatcher, matchText, type NamedTarget } from '../src/lib/autolink'

const c = createClient({ url: 'file:C:/Users/Admin/projects/daaaawnwalkkkkerrr/dawnwalker.db' })
const q = async (sql: string) => (await c.execute(sql)).rows as any[]

const SECTIONS = ['characters','regions','factions','items','enemies','quests','perks','endings','courts','court_activities','skill_trees','builds','mechanics']

const games = await q('select id, slug, title, short_title from games')
const people = await q('select id, name, slug from people')
const companies = await q('select id, name, slug from companies')

const network: NamedTarget[] = [
  ...people.map(r => ({ key:`people:${r.id}`, kind:'person' as const, name:r.name, names:[r.name], href:'', external:true })),
  ...companies.map(r => ({ key:`companies:${r.id}`, kind:'company' as const, name:r.name, names:[r.name], href:'', external:true })),
  ...games.map(r => ({ key:`games:${r.id}`, kind:'game' as const, name:r.short_title||r.title, names:[r.title, r.short_title].filter(Boolean) as string[], href:'', external:true, game:r.slug })),
]

const text = (node: any, out: string[]) => {
  if (!node || typeof node !== 'object') return
  if (typeof node.text === 'string') out.push(node.text)
  if (Array.isArray(node.children)) for (const k of node.children) text(k, out)
}

const hits = new Map<string, {target:string, where:string[]}>()
const refusalReport = new Map<string,string>()

for (const g of games) {
  const wiki: NamedTarget[] = []
  for (const t of SECTIONS) {
    for (const r of await q(`select id, title, slug from ${t} where game_id=${g.id}`)) {
      wiki.push({ key:`${t}:${r.id}`, kind:'record', name:r.title, names:[r.title], href:`/${t}/${r.slug}`, external:false, game:g.slug })
    }
  }
  const m = buildMatcher([...network, ...wiki])
  for (const r of m.refusals) refusalReport.set(`${r.name}\t${r.reason}`, r.key)

  // every composed summary and body on this wiki
  for (const t of [...SECTIONS, 'guides', 'achievements']) {
    const col = t === 'achievements' ? 'description' : 'summary'
    let rows: any[] = []
    try { rows = await q(`select id, title, ${col} as s, body from ${t} where game_id=${g.id}`) } catch { continue }
    for (const r of rows) {
      const blocks: string[] = []
      if (r.s) blocks.push(String(r.s))
      if (r.body) { const out: string[] = []; try { text(JSON.parse(r.body), out) } catch {} ; blocks.push(out.join(' ')) }
      for (const block of blocks) {
        const seen = new Set<string>()
        for (const part of matchText(block, m, { game: g.slug, self: `${t}:${r.id}`, seen })) {
          if (!part.target) continue
          const key = `${part.text}  ->  ${part.target.key}`
          if (!hits.has(key)) hits.set(key, { target: part.target.href, where: [] })
          const w = hits.get(key)!
          if (w.where.length < 2) w.where.push(`${g.slug}/${t}/${r.title}`)
        }
      }
    }
  }
}

// people + companies hosts
const m2 = buildMatcher(network)
for (const [tbl, col] of [['people','name'],['companies','name']] as const) {
  for (const r of await q(`select id, ${col} as n, summary, body from ${tbl}`)) {
    const blocks: string[] = []
    if (r.summary) blocks.push(String(r.summary))
    if (r.body) { const out: string[] = []; try { text(JSON.parse(r.body), out) } catch {}; blocks.push(out.join(' ')) }
    for (const block of blocks) {
      const seen = new Set<string>()
      for (const part of matchText(block, m2, { self: `${tbl}:${r.id}`, seen })) {
        if (!part.target) continue
        const key = `${part.text}  ->  ${part.target.key}`
        if (!hits.has(key)) hits.set(key, { target: part.target.href, where: [] })
        const w = hits.get(key)!
        if (w.where.length < 2) w.where.push(`${tbl}/${r.n}`)
      }
    }
  }
}

if (process.argv[2] === 'refusals') {
  const lines = [...refusalReport.keys()].sort()
  for (const l of lines) console.log(l)
  console.log('-- refused names:', lines.length)
} else {
  const lines = [...hits.entries()].sort()
  for (const [k, v] of lines) console.log(`${k}\t${v.where[0]}`)
  console.log('-- distinct matches:', lines.length)
}
