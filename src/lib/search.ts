/**
 * Ranking for the site search.
 *
 * Free of React so it can be unit-tested. The ranking rule that matters:
 * people search for the name of a thing far more often than for a phrase in
 * its description, so a title match must always beat a summary mention — an
 * exact title above a prefix above a substring above the summary.
 */

export type IndexRow = { t: string; u: string; k: string; s: string }

export function score(row: IndexRow, needle: string): number {
  const title = row.t.toLowerCase()
  if (title === needle) return 100
  if (title.startsWith(needle)) return 70
  if (title.includes(needle)) return 50
  if (row.s.toLowerCase().includes(needle)) return 15
  return 0
}

export function rank(rows: IndexRow[], query: string, limit = 24): IndexRow[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  return rows
    .map((row) => ({ row, value: score(row, needle) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.row.t.localeCompare(b.row.t))
    .slice(0, limit)
    .map((entry) => entry.row)
}

/** Results keep their ranked order inside a group, and groups their first hit's order. */
export function groupByKind(rows: IndexRow[]): [string, IndexRow[]][] {
  const map = new Map<string, IndexRow[]>()
  for (const row of rows) {
    const list = map.get(row.k) ?? []
    list.push(row)
    map.set(row.k, list)
  }
  return [...map.entries()]
}
