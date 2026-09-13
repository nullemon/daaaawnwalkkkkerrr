/**
 * The filtering behind the index tables.
 *
 * Kept out of the component and free of React so it can be unit-tested, the
 * same reason `reachability.ts` is free of Payload types. The rules that
 * matter are about unknowns: a quest with no published segment cost is not a
 * cheap quest, so it must never sort to the top of "cheapest first".
 */

export type Row = {
  id: string | number
  [key: string]: string | number | boolean | null | undefined
}

export type Sort = { key: string; dir: 'asc' | 'desc' }

export const textOf = (row: Row, key: string): string => {
  const value = row[key]
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

/** Unknown sorts last in both directions — it is absent, not small and not large. */
export const numOf = (row: Row, key: string): number => {
  const value = row[key]
  if (typeof value === 'number') return value
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

export const distinct = (rows: Row[], key: string): string[] => {
  const seen = new Set<string>()
  for (const row of rows) {
    const value = textOf(row, key)
    if (value) seen.add(value)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

export function applyFilters(
  rows: Row[],
  {
    query = '',
    picked = {},
    searchKeys = [],
  }: { query?: string; picked?: Record<string, string>; searchKeys?: string[] },
): Row[] {
  const needle = query.trim().toLowerCase()
  return rows.filter((row) => {
    for (const [key, value] of Object.entries(picked)) {
      if (value && textOf(row, key) !== value) return false
    }
    if (!needle) return true
    return searchKeys.some((key) => textOf(row, key).toLowerCase().includes(needle))
  })
}

export function applySort(rows: Row[], sort: Sort | null, numericKeys: string[] = []): Row[] {
  if (!sort) return rows
  const numeric = numericKeys.includes(sort.key)
  return [...rows].sort((a, b) => {
    // Unknowns stay at the bottom whichever way the column is pointing.
    if (numeric) {
      const left = numOf(a, sort.key)
      const right = numOf(b, sort.key)
      const leftUnknown = !Number.isFinite(left)
      const rightUnknown = !Number.isFinite(right)
      if (leftUnknown || rightUnknown) {
        if (leftUnknown && rightUnknown) return 0
        return leftUnknown ? 1 : -1
      }
      return sort.dir === 'asc' ? left - right : right - left
    }
    const result = textOf(a, sort.key).localeCompare(textOf(b, sort.key))
    return sort.dir === 'asc' ? result : -result
  })
}
