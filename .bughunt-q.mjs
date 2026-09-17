import { createClient } from './node_modules/.pnpm/@libsql+client@0.14.0/node_modules/@libsql/client/lib-esm/node.js'
const db = createClient({ url: 'file:./dawnwalker.db' })
const r = await db.execute(process.argv[2])
console.log(JSON.stringify(r.rows, null, 1))
