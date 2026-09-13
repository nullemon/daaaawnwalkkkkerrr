'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'

type Row = { t: string; u: string; k: string; s: string }

/**
 * Search over a static index fetched once. With a few hundred records this is
 * instant in the browser and costs no server — and it keeps every content page
 * free of client JS, which is where the speed advantage over the big wikis
 * comes from.
 */
export function SearchBox() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/search-index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Row[]) => setRows(data))
      .catch(() => setFailed(true))
  }, [])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!rows || needle.length < 2) return []
    const scored = rows
      .map((row) => {
        const title = row.t.toLowerCase()
        // Rank a title match above a mention in the summary — people search
        // for the name of a thing far more often than for a description of it.
        let score = 0
        if (title === needle) score = 100
        else if (title.startsWith(needle)) score = 70
        else if (title.includes(needle)) score = 50
        else if (row.s.toLowerCase().includes(needle)) score = 15
        return { row, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.row.t.localeCompare(b.row.t))
    return scored.slice(0, 60).map((entry) => entry.row)
  }, [rows, q])

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const row of results) {
      const list = map.get(row.k) ?? []
      list.push(row)
      map.set(row.k, list)
    }
    return [...map.entries()]
  }, [results])

  return (
    <div className="stack-sm">
      <div className="field">
        <label htmlFor="site-search">Search the database</label>
        <input
          id="site-search"
          type="search"
          autoFocus
          placeholder="A quest, an item, a perk, a character…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </div>

      {failed ? (
        <p className="note">The search index could not be loaded. Try the section pages instead.</p>
      ) : !rows ? (
        <p className="note">Loading the index…</p>
      ) : q.trim().length < 2 ? (
        <p className="note">
          {rows.length} records indexed. Type at least two characters.
        </p>
      ) : results.length === 0 ? (
        <p className="note">
          Nothing matches &ldquo;{q}&rdquo;. It may simply not be documented yet — the database is
          honest about its gaps rather than filling them in.
        </p>
      ) : (
        <>
          <p className="note">
            {results.length} match{results.length === 1 ? '' : 'es'}
          </p>
          {grouped.map(([kind, items]) => (
            <section className="section" key={kind}>
              <div className="section-head">
                <h2>{kind}</h2>
                <span className="eyebrow">{items.length}</span>
              </div>
              <ul className="linklist">
                {items.map((row) => (
                  <li key={row.u}>
                    <Link href={row.u}>
                      <Icon name="chevron" size={13} className="ic" />
                      {row.t}
                    </Link>
                    <span className="meta">{row.k}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
