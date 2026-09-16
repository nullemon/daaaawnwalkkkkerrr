'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useUi } from './UiStrings'
import { rank, groupByKind, type IndexRow } from '@/lib/search'
import { fill } from '@/lib/copy'

/**
 * The search that fronts the site.
 *
 * One field, results the moment you type, grouped by what they are and
 * reachable with the arrow keys. It runs against a static index fetched once,
 * so it costs no server and every content page stays free of client JS — which
 * is where the speed advantage over the big wikis comes from.
 */
export function HeroSearch({
  placeholder,
  autoFocus = false,
}: {
  /** Overrides the registry's wording for one placement, e.g. the hub. */
  placeholder?: string
  autoFocus?: boolean
}) {
  const ui = useUi()
  const hint = placeholder ?? ui.t('search.hero-placeholder')
  const [rows, setRows] = useState<IndexRow[] | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/search-index.json')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('index'))))
      .then((data: IndexRow[]) => setRows(data))
      .catch(() => setRows([]))
  }, [])

  // Clicking anywhere else should put the dropdown away, the same as any
  // other combobox — otherwise it hangs over the page after you've moved on.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const results = useMemo(() => rank(rows ?? [], query, 24), [rows, query])
  const groups = useMemo(() => groupByKind(results), [results])
  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups])

  const show = open && query.trim().length >= 2

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!show || flat.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => (c + 1) % flat.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => (c - 1 + flat.length) % flat.length)
    } else if (event.key === 'Enter') {
      const pick = flat[cursor]
      if (pick) window.location.href = pick.u
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="herosearch" ref={box}>
      <div className="herosearch-field">
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          placeholder={hint}
          aria-label={hint}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <Icon name="search" size={21} className="herosearch-icon" />
      </div>

      {show ? (
        <div className="herosearch-menu">
          {flat.length === 0 ? (
            <p className="herosearch-empty">
              {fill(ui.t('search.hero-no-match'), { query: query.trim() })}
            </p>
          ) : (
            groups.map(([kind, items]) => (
              <div key={kind} className="herosearch-group">
                <p className="herosearch-kind">{kind}</p>
                {items.map((row) => {
                  const index = flat.indexOf(row)
                  return (
                    <Link
                      key={row.u}
                      href={row.u}
                      className="herosearch-hit"
                      data-cursor={index === cursor ? 'true' : undefined}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => setOpen(false)}
                    >
                      <span className="herosearch-hit-name">{row.t}</span>
                      {row.s ? <span className="herosearch-hit-sub">{row.s}</span> : null}
                    </Link>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
