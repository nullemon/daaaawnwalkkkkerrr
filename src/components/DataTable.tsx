'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from './Icon'
import { PhaseBadge, Rarity } from './Badges'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'
import { applyFilters, applySort, distinct, textOf, type Row as BaseRow, type Sort } from '@/lib/table-filter'

/**
 * A filterable, sortable index table.
 *
 * Every section of this site is a list of 40–93 things, and a flat
 * alphabetical table of 93 quests is not a database — it is a printed page.
 * Finding "night quests in Svartrau City that cost under 3 segments" was
 * scrolling and squinting. This does the filtering in the browser: the rows
 * are already on the page, so narrowing them is instant and needs no request.
 *
 * It stays a real <table> rendered on the server for the first paint, so the
 * content is in the HTML for search engines and for anyone without JS — the
 * filter bar is the only part that needs scripting.
 */

export type ColumnType = 'name' | 'text' | 'link' | 'phase' | 'rarity' | 'num'

export type Column = {
  key: string
  label: string
  type?: ColumnType
  /** Columns worth ordering by. Names and numbers usually; badges rarely. */
  sortable?: boolean
}

/** One facet becomes one dropdown, its options read off the rows themselves. */
export type Facet = { key: string; label: string }

/**
 * Rows carry primitives only — this is a client component, so anything passed
 * from a server page has to survive serialisation. A link column reads its
 * href from `<key>Href`, and the `name` column its icon from `icon`.
 */
export type Row = BaseRow & { icon?: IconName; avatar?: string; avatarAlt?: string }

export function DataTable({
  rows,
  columns,
  facets = [],
  searchPlaceholder,
  noun,
}: {
  rows: Row[]
  columns: Column[]
  facets?: Facet[]
  /** Both fall back to the registry, so a page only passes one to say something
      more specific than "Search…" and "results". */
  searchPlaceholder?: string
  noun?: string
}) {
  const ui = useUi()
  const hint = searchPlaceholder ?? ui.t('table.search-placeholder')
  const things = noun ?? ui.t('table.noun')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<Sort | null>(null)

  // Options come from the data, so a facet can never offer a value that
  // matches nothing, and never miss one somebody added in the admin.
  const options = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const facet of facets) map[facet.key] = distinct(rows, facet.key)
    return map
  }, [rows, facets])

  const searchable = useMemo(
    () => columns.filter((c) => c.type !== 'num').map((c) => c.key),
    [columns],
  )

  const numericKeys = useMemo(
    () => columns.filter((c) => c.type === 'num').map((c) => c.key),
    [columns],
  )

  const shown = useMemo(
    () => applySort(applyFilters(rows, { query, picked, searchKeys: searchable }), sort, numericKeys),
    [rows, query, picked, sort, searchable, numericKeys],
  )

  const active = query.trim() !== '' || Object.values(picked).some(Boolean)

  const toggleSort = (key: string) =>
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )

  return (
    <div className="datatable">
      <div className="filterbar">
        <div className="filterbar-search">
          <Icon name="search" size={16} className="ic" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={hint}
            aria-label={hint}
          />
        </div>

        {facets.map((facet) => (
          <label key={facet.key} className="filterbar-facet">
            <span className="sr-only">{facet.label}</span>
            <select
              value={picked[facet.key] ?? ''}
              onChange={(event) =>
                setPicked((current) => ({ ...current, [facet.key]: event.target.value }))
              }
              data-active={picked[facet.key] ? 'true' : undefined}
            >
              <option value="">{fill(ui.t('table.facet-any'), { label: facet.label })}</option>
              {options[facet.key]?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ))}

        <p className="filterbar-count" aria-live="polite">
          <b>{shown.length}</b> {fill(ui.t('table.count'), { total: rows.length, noun: things })}
        </p>

        {active ? (
          <button
            type="button"
            className="filterbar-reset"
            onClick={() => {
              setQuery('')
              setPicked({})
            }}
          >
            {ui.t('table.reset')}
          </button>
        ) : null}
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={column.type === 'num' ? 'num' : undefined}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {column.sortable === false ? (
                    column.label
                  ) : (
                    <button type="button" className="th-sort" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      <span className="th-arrow" aria-hidden="true">
                        {sort?.key === column.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <Cell key={column.key} row={row} column={column} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown.length === 0 ? (
        <p className="note datatable-empty">
          {ui.t('table.empty')}{' '}
          <button type="button" onClick={() => { setQuery(''); setPicked({}) }}>
            {ui.t('table.clear-filters')}
          </button>{' '}
          {fill(ui.t('table.empty-tail'), { total: rows.length })}
        </p>
      ) : null}
    </div>
  )
}

function Cell({ row, column }: { row: Row; column: Column }) {
  const ui = useUi()
  const value = textOf(row, column.key)
  const href = textOf(row, `${column.key}Href`)

  if (column.type === 'name') {
    return (
      <td>
        <span className="cell-name" data-rarity={textOf(row, 'rarity') || undefined}>
          {row.avatar ? (
            // Decorative: the row already says the name in text right beside it,
            // so announcing the picture too would just read the name twice.
            <img className="cell-avatar" src={row.avatar} alt="" width={22} height={22} loading="lazy" />
          ) : row.icon ? (
            <Icon name={row.icon} size={16} className="ic" />
          ) : null}
          {href ? <Link href={href}>{value}</Link> : value}
        </span>
      </td>
    )
  }

  if (column.type === 'link') {
    return <td>{href ? <Link href={href}>{value}</Link> : value || '—'}</td>
  }

  if (column.type === 'phase') {
    return (
      <td>
        <PhaseBadge phase={textOf(row, column.key) || null} />
      </td>
    )
  }

  if (column.type === 'rarity') {
    return <td>{value ? <Rarity value={value} /> : '—'}</td>
  }

  if (column.type === 'num') {
    const unknown = value === '' || value === 'unknown'
    return (
      <td className="num">
        {unknown ? (
          <span title={ui.t('table.unknown-title')}>{ui.t('table.unknown')}</span>
        ) : (
          value
        )}
      </td>
    )
  }

  return <td>{value || '—'}</td>
}
